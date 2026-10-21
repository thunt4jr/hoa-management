import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { request } from "node:http";
import { packageAmplify } from "./package-amplify";

async function main() {
  await mkdir(".data", { recursive: true });
  const fixture = await mkdtemp(".data/amplify-package-");
  const outputsFile = path.join(fixture, "outputs.json");
  const root = path.join(fixture, "bundle");
  // Node fetch discards an explicit Host header; use HTTP for virtual-host tests.
  const send = (
    pathname: string,
    headers: Record<string, string>,
    body?: string,
  ) =>
    new Promise<{
      status: number;
      headers: import("node:http").IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: 3218,
          path: pathname,
          method: body ? "POST" : "GET",
          headers,
          timeout: 2000,
        },
        (response) => {
          let text = "";
          response.on("data", (chunk) => {
            text += chunk.toString();
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode!,
              headers: response.headers,
              body: text,
            }),
          );
        },
      );
      req.on("timeout", () =>
        req.destroy(new Error("Test request timed out.")),
      );
      req.on("error", reject);
      req.end(body);
    });
  let server: ReturnType<typeof spawn> | undefined;
  async function stopServer() {
    if (!server) return;
    const current = server;
    current.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (current.exitCode !== null) resolve();
      else current.once("exit", () => resolve());
    });
    server = undefined;
  }
  const origin = "https://development.localtest.amplifyapp.com";
  const runtime = {
    region: "us-east-1",
    origin,
    database: "hoa",
    resourceArn: "arn:aws:rds:us-east-1:123456789012:cluster:synthetic-test",
    secretArn:
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:runtime-synthetic",
    sessionSecretArn:
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:session-synthetic",
    computeRoleArn:
      "arn:aws:iam::123456789012:role/hoa-management/development/synthetic",
    userPoolId: "us-east-1_synthetic",
    clientId: "synthetic",
    cognitoDomain:
      "https://hoa-localtest-development.auth.us-east-1.amazoncognito.com",
  };
  try {
    await writeFile(outputsFile, JSON.stringify({ custom: { hoa: runtime } }));
    await packageAmplify({ outputsFile, root });
    const manifest = JSON.parse(
      await readFile(`${root}/deploy-manifest.json`, "utf8"),
    );
    assert.deepEqual(
      manifest.routes.map((route: { path: string }) => route.path),
      ["/_next/static/*", "/*"],
    );
    assert.equal(manifest.computeResources[0].runtime, "nodejs24.x");
    assert.equal(manifest.framework.name, "custom-node-http");
    async function inspect(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        assert.ok(
          !entry.isSymbolicLink(),
          "The compute bundle must be self-contained.",
        );
        assert.ok(
          !/^\.env(?:\.|$)/.test(entry.name),
          "Environment files must not be packaged.",
        );
        if (entry.isDirectory())
          await inspect(path.join(directory, entry.name));
      }
    }
    await inspect(root);
    execFileSync(process.execPath, [
      "--check",
      `${root}/compute/default/entry.cjs`,
    ]);
    // Start the real packaged Next server on a separate port, without AWS calls.
    // Secret loading and actual Amplify edge behavior still require live verification.
    server = spawn(process.execPath, [`${root}/compute/default/server.js`], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3218",
        PLATFORM_ORIGIN: origin,
        COMMUNITY_BASE_DOMAIN: new URL(origin).hostname,
        SESSION_SECRET: "synthetic-only-package-test-secret-32-characters",
        AUTH_MODE: "cognito",
        ALLOW_DEV_AUTH: "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    server.stdout?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    server.stderr?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    let ready = false;
    let responseDetail = "no response";
    for (let index = 0; index < 100; index++) {
      try {
        const response = await send("/", { host: new URL(origin).host });
        responseDetail = `${response.status} ${response.body}`;
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* Server is starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(
      ready,
      `Packaged server failed: ${responseDetail.slice(0, 300)} ${logs.slice(-1000)}`,
    );
    assert.equal(
      (
        await send("/", {
          host: "unknown.invalid",
          "x-forwarded-host": new URL(origin).host,
        })
      ).status,
      421,
    );
    const privatePage = await send("/app", { host: new URL(origin).host });
    assert.equal(privatePage.status, 307);
    assert.match(
      String(privatePage.headers["cache-control"] || ""),
      /no-store/,
    );
    const disabled = await send(
      "/api/auth/dev",
      {
        host: new URL(origin).host,
        origin,
        "content-type": "application/json",
      },
      JSON.stringify({ persona: "reviewer" }),
    );
    assert.equal(disabled.status, 404);
    await stopServer();
    // The entrypoint must listen without credentials and deny protected routes.
    // No AWS request is possible: every credential source is disabled/absent.
    const isolatedEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("AWS_")),
    );
    server = spawn(process.execPath, [`${root}/compute/default/entry.cjs`], {
      env: {
        ...isolatedEnvironment,
        NODE_ENV: "production",
        PORT: "3218",
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_CONFIG_FILE: path.resolve(fixture, "no-config"),
        AWS_SHARED_CREDENTIALS_FILE: path.resolve(fixture, "no-credentials"),
      },
      stdio: "ignore",
    });
    let unavailable = false;
    for (let index = 0; index < 100; index++) {
      try {
        const response = await send("/", { host: new URL(origin).host });
        if (response.status === 503) {
          assert.match(String(response.headers["cache-control"]), /no-store/);
          assert.equal(
            response.body,
            "Service is temporarily unavailable. Please retry.",
          );
          unavailable = true;
          break;
        }
      } catch {
        /* Server is starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(unavailable, "Secret initialization must fail closed.");
    assert.equal(
      (await send("/app", { host: new URL(origin).host })).status,
      503,
    );
    await mkdir(".data", { recursive: true });
    await writeFile(
      ".data/amplify-package-test.json",
      JSON.stringify({ passed: true, syntheticOutputs: true, liveAWS: false }),
    );
    console.log(
      "Synthetic package smoke passed: self-contained bundle, host/cache boundaries, disabled development login and fail-closed request-time secret loading. AWS is unverified.",
    );
  } finally {
    await stopServer();
    // Remove the synthetic fixture; actual backend outputs/artifacts are untouched.
    await rm(fixture, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Package test failed.",
  );
  process.exitCode = 1;
});
