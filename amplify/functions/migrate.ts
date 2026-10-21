import { RDSDataClient } from "@aws-sdk/client-rds-data";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { DataApiTransaction } from "../../src/server/data-api";
import { splitStatements } from "../../src/server/sql";

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}
export async function handler(event: {
  RequestType: string;
  ResourceProperties: { Migrations: Migration[] };
}) {
  if (event.RequestType === "Delete")
    return { PhysicalResourceId: "hoa-schema-v1" };
  const client = new RDSDataClient({ maxAttempts: 1 });
  const db = new DataApiTransaction(client, {
    resourceArn: process.env.DATABASE_RESOURCE_ARN!,
    secretArn: process.env.DATABASE_SECRET_ARN!,
    database: process.env.DATABASE_NAME!,
  });
  try {
    await db.begin();
    await db.query("SELECT pg_advisory_xact_lock(60621001)::text");
    await db.query(
      "CREATE TABLE IF NOT EXISTS public.hoa_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of event.ResourceProperties.Migrations) {
      const existing = (
        await db.query(
          "SELECT checksum FROM public.hoa_schema_migrations WHERE name=$1",
          [migration.name],
        )
      ).rows[0];
      if (existing) {
        if (existing.checksum !== migration.checksum)
          throw new Error("Applied migration checksum changed.");
        continue;
      }
      for (const sql of splitStatements(migration.sql)) await db.query(sql);
      await db.query(
        "INSERT INTO public.hoa_schema_migrations(name,checksum) VALUES($1,$2)",
        [migration.name, migration.checksum],
      );
    }
    const value = await new SecretsManagerClient({}).send(
      new GetSecretValueCommand({ SecretId: process.env.RUNTIME_SECRET_ARN }),
    );
    const credential = JSON.parse(value.SecretString || "{}");
    if (
      credential.username !== "hoa_runtime" ||
      typeof credential.password !== "string" ||
      credential.password.length < 32
    )
      throw new Error("Invalid runtime credential.");
    // PostgreSQL utility statements cannot bind a password directly. format %L
    // quotes the generated secret server-side; neither SQL nor parameters are logged.
    const statement = (
      await db.query(
        "SELECT format('ALTER ROLE hoa_runtime LOGIN PASSWORD %L', $1::text) AS statement",
        [credential.password],
      )
    ).rows[0].statement;
    await db.query(statement);
    await db.commit();
    return { PhysicalResourceId: "hoa-schema-v1" };
  } catch {
    try {
      await db.rollback();
    } catch {
      /* No replay or credentials in errors. */
    }
    throw new Error(
      "Schema migration failed; inspect migration integrity and restricted database access.",
    );
  } finally {
    client.destroy();
  }
}
