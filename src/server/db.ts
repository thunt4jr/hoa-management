import { Pool } from "pg";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { DataApiTransaction, type SqlClient } from "./data-api";
export type { SqlClient } from "./data-api";
import { AppError } from "./errors";

let pool: Pool | undefined;
let dataApiClient: RDSDataClient | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new AppError(
      503,
      "database_setup",
      "The database has not been configured.",
    );
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  return pool;
}

export interface Principal {
  id: string;
  email: string;
  mfa: boolean;
  platformAdmin: boolean;
}

export async function withContext<T>(
  actor: Principal | null,
  communityId: string | null,
  run: (db: SqlClient) => Promise<T>,
) {
  const dataApi = process.env.DATABASE_TRANSPORT === "data-api";
  if (
    process.env.DATABASE_TRANSPORT &&
    !["postgres", "data-api"].includes(process.env.DATABASE_TRANSPORT)
  )
    throw new AppError(503, "database_setup", "Invalid database transport.");
  if (
    dataApi &&
    (!process.env.DATABASE_RESOURCE_ARN ||
      !process.env.DATABASE_SECRET_ARN ||
      !process.env.DATABASE_NAME)
  )
    throw new AppError(
      503,
      "database_setup",
      "Data API configuration is incomplete.",
    );
  const native = dataApi ? undefined : await database().connect();
  const remote = dataApi
    ? new DataApiTransaction(
        (dataApiClient ??= new RDSDataClient({
          region: process.env.AWS_REGION,
          maxAttempts: 1,
        })),
        {
          resourceArn: process.env.DATABASE_RESOURCE_ARN!,
          secretArn: process.env.DATABASE_SECRET_ARN!,
          database: process.env.DATABASE_NAME!,
        },
      )
    : undefined;
  const db: SqlClient = remote || native!;
  try {
    if (remote) await remote.begin();
    else await db.query("BEGIN");
    const role = await db.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, pg_has_role(current_user,c.relowner,'MEMBER') AS can_assume_owner FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname=current_user AND n.nspname='hoa' AND c.relkind='r'",
    );
    if (
      !role.rowCount ||
      role.rows.some(
        (r) =>
          r.rolsuper ||
          r.rolbypassrls ||
          r.rolcreaterole ||
          r.rolcreatedb ||
          r.can_assume_owner,
      )
    ) {
      throw new AppError(
        503,
        "unsafe_database_role",
        "A non-owner, non-bypass database role is required.",
      );
    }
    await db.query(
      "SELECT set_config('app.user_id',$1,true), set_config('app.community_id',$2,true), set_config('app.mfa',$3,true), set_config('statement_timeout','10000',true)",
      [actor?.id || "", communityId || "", actor?.mfa ? "true" : "false"],
    );
    const result = await run(db);
    if (remote) await remote.commit();
    else await db.query("COMMIT");
    return result;
  } catch (error) {
    try {
      if (remote) await remote.rollback();
      else await db.query("ROLLBACK");
    } catch {
      /* Preserve the original failure; no automatic replay. */
    }
    throw error;
  } finally {
    native?.release();
  }
}

export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
  dataApiClient?.destroy();
  dataApiClient = undefined;
}
