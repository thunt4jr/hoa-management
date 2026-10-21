import "./load-env";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { splitStatements } from "../src/server/sql";

export async function migrate(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(60621001)");
    if (
      (await db.query("SELECT current_user")).rows[0].current_user ===
      "hoa_runtime"
    )
      throw new Error("Use a separate schema-owner migration credential.");
    await db.query(
      "CREATE TABLE IF NOT EXISTS public.hoa_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(`db/migrations/${name}`, "utf8"),
        checksum = createHash("sha256").update(sql).digest("hex");
      const existing = (
        await db.query(
          "SELECT checksum FROM public.hoa_schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await db.query("BEGIN");
      try {
        for (const statement of splitStatements(sql)) await db.query(statement);
        await db.query(
          "INSERT INTO public.hoa_schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await db.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(60621001)");
    db.release();
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("/migrate.ts")) {
  if (!process.env.DATABASE_ADMIN_URL)
    throw new Error("DATABASE_ADMIN_URL is required for migrations.");
  migrate(process.env.DATABASE_ADMIN_URL).catch(() => {
    console.error(
      "Migration failed. Check administrative access and migration integrity; no credentials are printed.",
    );
    process.exitCode = 1;
  });
}
