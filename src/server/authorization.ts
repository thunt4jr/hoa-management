import type { SqlClient } from "./db";
import { AppError } from "./errors";

export const permissions = [
  "community.read",
  "members.manage",
  "governance.read",
  "governance.publish",
  "finance.manage",
  "events.organize",
  "discussions.moderate",
  "notices.manage",
] as const;
export type Permission = (typeof permissions)[number];

export async function requirePermission(
  db: SqlClient,
  communityId: string,
  permission: Permission,
) {
  const result = await db.query(
    "SELECT hoa.has_permission($1::uuid,$2) AS allowed",
    [communityId, permission],
  );
  if (!result.rows[0].allowed)
    throw new AppError(
      403,
      "forbidden",
      "You do not have permission to access this resource.",
    );
}

export async function requirePlatformAdmin(db: SqlClient) {
  if (
    !(await db.query("SELECT hoa.is_platform_admin() AS allowed")).rows[0]
      .allowed
  )
    throw new AppError(403, "forbidden", "Platform review access is required.");
}
