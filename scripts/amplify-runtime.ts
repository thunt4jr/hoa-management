import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

let phase = "load-config";
async function start() {
  const runtime = JSON.parse(
    await readFile(path.join(__dirname, "hoa-runtime.json"), "utf8"),
  );
  Object.assign(process.env, {
    NODE_ENV: "production",
    HOSTNAME: "0.0.0.0",
    PORT: process.env.PORT || "3000",
    NEXT_TELEMETRY_DISABLED: "1",
    AWS_REGION: runtime.region,
    PLATFORM_ORIGIN: runtime.origin,
    COMMUNITY_BASE_DOMAIN: new URL(runtime.origin).hostname,
    AUTH_MODE: "cognito",
    ALLOW_DEV_AUTH: "false",
    RUNTIME_SESSION_SECRET_ARN: runtime.sessionSecretArn,
    DATABASE_TRANSPORT: "data-api",
    DATABASE_RESOURCE_ARN: runtime.resourceArn,
    DATABASE_SECRET_ARN: runtime.secretArn,
    DATABASE_NAME: runtime.database,
    COGNITO_USER_POOL_ID: runtime.userPoolId,
    COGNITO_CLIENT_ID: runtime.clientId,
    COGNITO_DOMAIN: runtime.cognitoDomain,
  });
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_ADMIN_URL;
  delete process.env.SESSION_SECRET;
  phase = "start-server";
  createRequire(path.join(__dirname, "entry.cjs"))(
    path.join(__dirname, "server.js"),
  );
}
start().catch((error: unknown) => {
  const code =
    error instanceof Error && /^[A-Za-z0-9_]{1,80}$/.test(error.name)
      ? error.name
      : "UnknownError";
  console.error(
    JSON.stringify({ event: "runtime_bootstrap_failed", phase, code }),
  );
  process.exit(1);
});
