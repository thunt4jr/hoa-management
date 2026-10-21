import type { PoolClient } from "pg";
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
  db: PoolClient,
  communityId: string,
  permission: Permission,
) {
  const result = await db.query("SELECT hoa.has_permission($1,$2) AS allowed", [
    communityId,
    permission,
  ]);
  if (!result.rows[0].allowed)
    throw new AppError(
      403,
      "forbidden",
      "You do not have permission to access this resource.",
    );
}

export async function requirePlatformAdmin(db: PoolClient) {
  if (
    !(await db.query("SELECT hoa.is_platform_admin() AS allowed")).rows[0]
      .allowed
  )
    throw new AppError(403, "forbidden", "Platform review access is required.");
}
