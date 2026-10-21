import { Pool, type PoolClient } from "pg";
import { AppError } from "./errors";

let pool: Pool | undefined;
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
  run: (db: PoolClient) => Promise<T>,
) {
  const db = await database().connect();
  try {
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
    await db.query("BEGIN");
    await db.query(
      "SELECT set_config('app.user_id',$1,true), set_config('app.community_id',$2,true), set_config('app.mfa',$3,true)",
      [actor?.id || "", communityId || "", actor?.mfa ? "true" : "false"],
    );
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
}
