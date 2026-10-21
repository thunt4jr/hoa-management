import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { withContext, closeDatabase } from "../src/server/db";

async function main() {
  if (!process.env.AWS_PROFILE)
    throw new Error("Use an explicit development AWS_PROFILE.");
  const outputs = JSON.parse(await readFile("amplify_outputs.json", "utf8"));
  const runtime = outputs.custom?.hoa;
  assert.match(
    runtime?.origin || "",
    /^https:\/\/development\.[a-z0-9]+\.amplifyapp\.com$/,
    "Development outputs required.",
  );
  assert.equal(runtime.region, "us-east-1");
  Object.assign(process.env, {
    DATABASE_TRANSPORT: "data-api",
    DATABASE_RESOURCE_ARN: runtime.resourceArn,
    DATABASE_SECRET_ARN: runtime.secretArn,
    DATABASE_NAME: runtime.database,
    AWS_REGION: runtime.region,
  });
  await withContext(null, null, async (db) => {
    const role = (await db.query("SELECT current_user::text AS role")).rows[0];
    assert.equal(role.role, "hoa_runtime");
    const rls = (
      await db.query(
        "SELECT bool_and(relrowsecurity AND relforcerowsecurity) AS forced FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='hoa' AND c.relkind='r'",
      )
    ).rows[0];
    assert.equal(rls.forced, true);
    assert.equal(
      (await db.query("SELECT id FROM hoa.communities")).rowCount,
      0,
    );
    assert.deepEqual(
      (await db.query("SELECT jsonb_build_object('ok',true) AS payload"))
        .rows[0].payload,
      { ok: true },
    );
  });
  await assert.rejects(
    () =>
      withContext(null, null, (db) =>
        db.query("SELECT token_hash FROM hoa.sessions LIMIT 1"),
      ),
    { code: "42501" },
  );
  console.log(
    "PASS: live Data API runtime role, forced RLS, JSON decoding and private session-table denial.",
  );

  const cognito = new CognitoIdentityProviderClient({ region: runtime.region });
  try {
    const pool = (
      await cognito.send(
        new DescribeUserPoolCommand({ UserPoolId: runtime.userPoolId }),
      )
    ).UserPool!;
    const client = (
      await cognito.send(
        new DescribeUserPoolClientCommand({
          UserPoolId: runtime.userPoolId,
          ClientId: runtime.clientId,
        }),
      )
    ).UserPoolClient!;
    assert.equal(pool.MfaConfiguration, "ON");
    assert.deepEqual(pool.Policies?.SignInPolicy?.AllowedFirstAuthFactors, [
      "PASSWORD",
    ]);
    assert.deepEqual(client.CallbackURLs, [
      `${runtime.origin}/api/auth/callback`,
    ]);
    assert.deepEqual(client.AllowedOAuthFlows, ["code"]);
    assert.equal(Boolean(client.ClientSecret), false);
  } finally {
    cognito.destroy();
  }
  console.log(
    "PASS: live Cognito required MFA, password-only pool and fixed public-client callback.",
  );

  const get = (pathname: string, options: RequestInit = {}) =>
    fetch(new URL(pathname, runtime.origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      ...options,
    });
  const home = await get("/");
  assert.equal(home.status, 200, "Homepage must render.");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal(
    (
      await get("/", {
        headers: { "x-forwarded-host": "unrecognized.invalid" },
      })
    ).status,
    200,
  );
  const privatePage = await get("/app");
  assert.equal(privatePage.status, 307);
  assert.match(privatePage.headers.get("cache-control") || "", /no-store/);
  assert.match(privatePage.headers.get("location") || "", /^\/login\?/);
  const disabled = await get("/api/auth/dev", {
    method: "POST",
    headers: { origin: runtime.origin, "content-type": "application/json" },
    body: JSON.stringify({ persona: "reviewer" }),
  });
  assert.equal(disabled.status, 404);
  const callback = await get(
    `/api/auth/callback?code=invalid&state=${"a".repeat(43)}`,
  );
  assert.equal(callback.status, 400);
  console.log(
    "PASS: HTTPS homepage, ignored forwarding header, private redirect/no-store, disabled synthetic login and invalid callback denial.",
  );

  // A normal anonymous login start exercises runtime IAM, Aurora transactions,
  // encrypted OAuth storage and secure cookies. It creates no user or membership.
  const login = await get("/api/auth/login?next=/app");
  assert.equal(login.status, 302, "Live login start must reach Cognito.");
  const authorize = new URL(login.headers.get("location") || "");
  assert.equal(authorize.origin, runtime.cognitoDomain);
  assert.equal(
    authorize.searchParams.get("redirect_uri"),
    `${runtime.origin}/api/auth/callback`,
  );
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("client_id"), runtime.clientId);
  assert.equal(Boolean(authorize.searchParams.get("nonce")), true);
  const cookies = login.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (cookie) =>
        /^__Host-hoa_oauth=/.test(cookie) &&
        /HttpOnly/i.test(cookie) &&
        /Secure/i.test(cookie) &&
        /SameSite=Lax/i.test(cookie),
    ),
  );
  const provider = await fetch(authorize, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(
    [200, 302, 303].includes(provider.status),
    "Cognito authorization page must be available.",
  );
  console.log(
    "PASS: live server-side login start, PKCE/nonce, host-only secure OAuth cookie and Cognito entry page. Full human signup/TOTP/callback remains unverified.",
  );
}
main()
  .catch((error) => {
    console.error(
      `Deployment verification failed: ${error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.name : "unknown"}`,
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
