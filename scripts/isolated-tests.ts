import {
  mkdtemp,
  writeFile,
  rm,
  mkdir,
  cp,
  symlink,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { Pool } from "pg";
import { migrate } from "./migrate";
import { seed } from "./seed";

async function main() {
  const mode = process.argv[2] || "database";
  const bin = process.env.PG_BIN || "/usr/lib/postgresql/18/bin";
  const dir = await mkdtemp(path.join(tmpdir(), "hoa-tests-"));
  const secret = randomBytes(24).toString("hex");
  let postgres: ReturnType<typeof spawn> | undefined,
    web: ReturnType<typeof spawn> | undefined;
  let adminPool: Pool | undefined;
  let fixture: string | undefined;
  const run = (
    cmd: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
  ) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn(cmd, args, { stdio: "inherit", env });
      p.on("error", reject);
      p.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Test command exited ${code}`)),
      );
    });
  async function freePort() {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }
  try {
    const passwordFile = path.join(dir, "password");
    await writeFile(passwordFile, secret, { mode: 0o600 });
    execFileSync(
      path.join(bin, "initdb"),
      [
        "-D",
        path.join(dir, "data"),
        "-U",
        "hoa_test_owner",
        "--auth=scram-sha-256",
        `--pwfile=${passwordFile}`,
        "--no-locale",
        "--encoding=UTF8",
      ],
      { stdio: "ignore" },
    );
    await rm(passwordFile);
    const port = await freePort();
    postgres = spawn(
      path.join(bin, "postgres"),
      [
        "-D",
        path.join(dir, "data"),
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-k",
        dir,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    const admin = `postgresql://hoa_test_owner:${secret}@127.0.0.1:${port}/postgres`;
    const runtime = `postgresql://hoa_runtime:${secret}@127.0.0.1:${port}/postgres`;
    const pool = new Pool({ connectionString: admin });
    adminPool = pool;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await pool.query("SELECT 1");
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!ready) throw new Error("Isolated PostgreSQL failed to start.");
    await pool
      .query(
        "SELECT format('CREATE ROLE hoa_schema_owner LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS PASSWORD %L',$1::text) AS sql",
        [secret],
      )
      .then((r) => pool.query(r.rows[0].sql));
    await pool.query(
      "GRANT CREATE ON DATABASE postgres TO hoa_schema_owner; GRANT USAGE,CREATE ON SCHEMA public TO hoa_schema_owner",
    );
    const migrationURL = admin.replace("hoa_test_owner:", "hoa_schema_owner:");
    await migrate(migrationURL);
    await migrate(migrationURL);
    await pool
      .query(
        "SELECT format('ALTER ROLE hoa_runtime LOGIN PASSWORD %L',$1::text) AS sql",
        [secret],
      )
      .then((r) => pool.query(r.rows[0].sql));
    await seed(migrationURL);
    const env = {
      ...process.env,
      DATABASE_URL: runtime,
      DATABASE_ADMIN_URL: admin,
      AUTH_MODE: "development",
      ALLOW_DEV_AUTH: "true",
      SESSION_SECRET: secret,
      NEXT_TELEMETRY_DISABLED: "1",
      PLATFORM_ORIGIN: "http://localhost:3217",
      COMMUNITY_BASE_DOMAIN: "localhost",
    };
    if (mode === "browser") {
      const root = process.cwd();
      await mkdir(path.join(root, ".data"), { recursive: true });
      fixture = await mkdtemp(path.join(root, ".data", "e2e-"));
      for (const item of [
        "pages",
        "src",
        "styles",
        "next.config.ts",
        "proxy.ts",
        "tsconfig.json",
        "package.json",
        "package-lock.json",
        "public",
      ]) {
        try {
          await access(path.join(root, item));
        } catch {
          continue;
        }
        await cp(path.join(root, item), path.join(fixture, item), {
          recursive: true,
        });
      }
      await symlink(
        path.join(root, "node_modules"),
        path.join(fixture, "node_modules"),
        "dir",
      );
      web = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "dev",
          fixture,
          "--hostname",
          "127.0.0.1",
          "--port",
          "3217",
        ],
        {
          env: { ...env, NODE_ENV: "development", HOA_TEST_PROJECT_ROOT: root },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let logs = "";
      web.stdout?.on("data", (chunk) => {
        logs += chunk.toString();
      });
      web.stderr?.on("data", (chunk) => {
        logs += chunk.toString();
      });
      let up = false;
      for (let i = 0; i < 120; i++) {
        try {
          if ((await fetch("http://localhost:3217")).status === 200) {
            up = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!up) {
        await writeFile(path.join(dir, "web.log"), logs);
        throw new Error(`Test web server failed: ${logs.slice(-3000)}`);
      }
      await run(
        process.execPath,
        ["node_modules/@playwright/test/cli.js", "test"],
        env,
      );
    } else {
      await run(
        process.execPath,
        ["--import", "tsx", "--test", "tests/database.test.ts"],
        env,
      );
      // Exercise a real dump/restore against the synthetic database, not a backup mock.
      execFileSync(
        path.join(bin, "pg_dump"),
        ["--format=custom", `--file=${path.join(dir, "backup.dump")}`, admin],
        { stdio: "ignore" },
      );
      await pool.query("CREATE DATABASE hoa_restore");
      const restored = admin.replace(/\/postgres$/, "/hoa_restore");
      execFileSync(
        path.join(bin, "pg_restore"),
        [`--dbname=${restored}`, path.join(dir, "backup.dump")],
        { stdio: "ignore" },
      );
      const verify = new Pool({ connectionString: restored });
      const count = (
        await verify.query("SELECT count(*)::int AS n FROM hoa.communities")
      ).rows[0].n;
      const policies = (
        await verify.query(
          "SELECT bool_and(relrowsecurity AND relforcerowsecurity) AS enabled FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='hoa' AND relkind='r'",
        )
      ).rows[0].enabled;
      if (count < 2 || !policies)
        throw new Error("Restored database failed integrity checks.");
      await verify.end();
      const runtimeRestore = new Pool({
        connectionString: runtime.replace(/\/postgres$/, "/hoa_restore"),
      });
      if (
        (await runtimeRestore.query("SELECT * FROM hoa.communities"))
          .rowCount !== 0
      )
        throw new Error("Restored runtime bypassed tenant isolation.");
      await runtimeRestore.end();
      console.log(
        "Backup/restore passed: communities and forced RLS restored.",
      );
      await writeFile(
        "/tmp/hoa-foundation-test-results.txt",
        `Database tests and isolated PostgreSQL 18 dump/restore passed.\n`,
      );
    }
  } finally {
    await adminPool?.end();
    if (web) {
      web.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (web?.exitCode !== null) resolve();
        else web?.once("exit", () => resolve());
      });
    }
    if (postgres) {
      execFileSync(
        path.join(bin, "pg_ctl"),
        ["-D", path.join(dir, "data"), "-m", "immediate", "stop"],
        { stdio: "ignore" },
      );
    }
    await rm(dir, { recursive: true, force: true });
    if (fixture) await rm(fixture, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Test runner failed.");
  process.exitCode = 1;
});
