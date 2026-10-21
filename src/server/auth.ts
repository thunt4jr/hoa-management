import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { withContext, type Principal } from "./db";
import { config } from "./config";
import { AppError } from "./errors";
import { requirePlatform, safeReturnPath } from "./hosts";
import { developmentPersonas } from "../development-personas";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
function cookieName(name: string) {
  return `${config().production ? "__Host-" : ""}hoa_${name}`;
}
function cookie(req: IncomingMessage, name: string) {
  return (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName(name)}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}
export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  const existing = res.getHeader("Set-Cookie");
  const valueString = `${cookieName(name)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config().production ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(existing)
      ? existing.map(String)
      : existing
        ? [String(existing)]
        : []),
    valueString,
  ]);
}

export async function principal(
  req: IncomingMessage,
): Promise<Principal | null> {
  const token = cookie(req, "session");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return withContext(null, null, async (db) => {
    const row = (
      await db.query("SELECT * FROM hoa.session_principal($1)", [hash(token)])
    ).rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          mfa: row.mfa,
          platformAdmin: row.platform_admin,
        }
      : null;
  });
}
export async function requirePrincipal(req: IncomingMessage) {
  const actor = await principal(req);
  if (!actor)
    throw new AppError(401, "authentication_required", "Sign in to continue.");
  return actor;
}
export async function issueSession(
  res: ServerResponse,
  subject: string,
  email: string,
  mfa: boolean,
) {
  const token = random();
  await withContext(null, null, (db) =>
    db.query("SELECT hoa.issue_session($1,$2,$3,$4)::text", [
      subject,
      email.toLowerCase(),
      hash(token),
      mfa,
    ]),
  );
  setCookie(res, "session", token, 1800);
}
export async function signOut(req: IncomingMessage, res: ServerResponse) {
  const token = cookie(req, "session");
  if (token)
    await withContext(null, null, (db) =>
      db.query("SELECT hoa.revoke_session($1)::text", [hash(token)]),
    );
  setCookie(res, "session", "", 0);
}
export async function throttle(key: string, maximum: number) {
  const allowed = await withContext(
    null,
    null,
    async (db) =>
      (
        await db.query("SELECT hoa.rate_limit($1,$2::integer) AS allowed", [
          hash(key),
          maximum,
        ])
      ).rows[0].allowed,
  );
  if (!allowed)
    throw new AppError(
      429,
      "rate_limited",
      "Too many requests. Wait a minute and try again.",
    );
}
function crypt(payload: string, decrypt = false) {
  const key = createHash("sha256").update(config().secret).digest();
  if (decrypt) {
    const [iv, tag, data] = payload
      .split(".")
      .map((v) => Buffer.from(v, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString();
  }
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64url"))
    .join(".");
}

function cognito() {
  const region = process.env.AWS_REGION,
    pool = process.env.COGNITO_USER_POOL_ID,
    client = process.env.COGNITO_CLIENT_ID;
  if (
    !region ||
    !pool ||
    !client ||
    !process.env.COGNITO_DOMAIN ||
    !pool.startsWith(`${region}_`)
  )
    throw new AppError(
      503,
      "cognito_setup",
      "Cognito sign-in requires provider configuration.",
    );
  const domain = new URL(process.env.COGNITO_DOMAIN);
  if (
    domain.protocol !== "https:" ||
    domain.pathname !== "/" ||
    domain.search ||
    domain.hash ||
    domain.username ||
    domain.password
  )
    throw new AppError(503, "cognito_setup", "Invalid Cognito login origin.");
  return {
    region,
    pool,
    client,
    domain,
    issuer: `https://cognito-idp.${region}.amazonaws.com/${pool}`,
    redirect: `${config().origin.origin}/api/auth/callback`,
  };
}

export async function beginLogin(
  req: IncomingMessage,
  res: ServerResponse,
  next: unknown,
) {
  requirePlatform(req.headers.host);
  // A global durable limit is conservative until an authenticated identity exists;
  // edge WAF limits are additionally required for public production endpoints.
  await throttle("oauth:start", 60);
  const c = cognito(),
    state = random(),
    verifier = random(),
    nonce = random();
  await withContext(null, null, (db) =>
    db.query("SELECT hoa.store_oauth($1,$2)::text", [
      hash(state),
      crypt(JSON.stringify({ verifier, nonce, next: safeReturnPath(next) })),
    ]),
  );
  setCookie(res, "oauth", state, 600);
  const url = new URL("/oauth2/authorize", c.domain);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.client,
    redirect_uri: c.redirect,
    scope: "openid email",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "login",
  }).toString();
  return url.toString();
}

export async function finishLogin(
  req: IncomingMessage,
  res: ServerResponse,
  code: string,
  state: string,
) {
  requirePlatform(req.headers.host);
  const stored = cookie(req, "oauth") || "";
  if (
    !state ||
    stored.length !== state.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(stored))
  )
    throw new AppError(400, "oauth_state", "Sign-in expired. Start again.");
  setCookie(res, "oauth", "", 0);
  const encrypted = await withContext(
    null,
    null,
    async (db) =>
      (await db.query("SELECT hoa.consume_oauth($1) AS payload", [hash(state)]))
        .rows[0].payload,
  );
  if (!encrypted)
    throw new AppError(
      400,
      "oauth_replay",
      "Sign-in expired or was already used.",
    );
  const attempt = JSON.parse(crypt(encrypted, true)) as {
      verifier: string;
      nonce: string;
      next: string;
    },
    c = cognito();
  const response = await fetch(new URL("/oauth2/token", c.domain), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.client,
      redirect_uri: c.redirect,
      code,
      code_verifier: attempt.verifier,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok)
    throw new AppError(
      401,
      "oauth_exchange",
      "Sign-in could not be verified. Start again.",
    );
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string")
    throw new AppError(
      401,
      "oauth_token",
      "No verified identity was returned.",
    );
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(`${c.issuer}/.well-known/jwks.json`)),
    {
      issuer: c.issuer,
      audience: c.client,
      algorithms: ["RS256"],
      maxTokenAge: "5m",
    },
  );
  if (
    payload.token_use !== "id" ||
    payload.nonce !== attempt.nonce ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    !payload.sub ||
    payload.identities
  )
    throw new AppError(
      401,
      "identity_verification",
      "A verified local Cognito identity is required.",
    );
  const aws = new CognitoIdentityProviderClient({ region: c.region });
  const [pool, user] = await Promise.all([
    aws.send(new DescribeUserPoolCommand({ UserPoolId: c.pool })),
    aws.send(
      new AdminGetUserCommand({ UserPoolId: c.pool, Username: payload.sub }),
    ),
  ]);
  // Required pool MFA alone is insufficient on first signup. Require an enrolled
  // TOTP factor and password-only login; federated/passwordless assertions fail closed.
  const factors = pool.UserPool?.Policies?.SignInPolicy
    ?.AllowedFirstAuthFactors || ["PASSWORD"];
  if (
    pool.UserPool?.MfaConfiguration !== "ON" ||
    !user.Enabled ||
    !user.UserMFASettingList?.includes("SOFTWARE_TOKEN_MFA") ||
    factors.some((f) => f !== "PASSWORD")
  )
    throw new AppError(
      403,
      "mfa_required",
      "Complete TOTP MFA enrollment, then sign in again. Required-MFA provider configuration must be verified.",
    );
  await issueSession(res, payload.sub, payload.email, true);
  return safeReturnPath(attempt.next);
}

export async function developmentLogin(
  req: IncomingMessage,
  res: ServerResponse,
  persona: (typeof developmentPersonas)[number],
) {
  requirePlatform(req.headers.host);
  if (!config().devAuth) throw new AppError(404, "not_found", "Not found.");
  await throttle("development:login", 60);
  // Synthetic, preseeded identities use the same session and authorization path.
  await issueSession(
    res,
    `development:${persona}`,
    `${persona}@example.test`,
    true,
  );
}
