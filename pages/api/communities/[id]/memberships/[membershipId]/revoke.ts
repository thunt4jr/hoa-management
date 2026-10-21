import { z } from "zod";
import { api, queryId } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/auth";
import { withContext } from "@/src/server/db";
import { requirePermission } from "@/src/server/authorization";
export default api(["POST"], async (req, res) => {
  const actor = await requirePrincipal(req),
    id = z.uuid().parse(queryId(req, "id")),
    mid = z.uuid().parse(queryId(req, "membershipId"));
  const { reason } = z
    .object({ reason: z.string().trim().min(10).max(1000) })
    .strict()
    .parse(req.body);
  await withContext(actor, id, async (db) => {
    await requirePermission(db, id, "members.manage");
    await db.query("SELECT hoa.revoke_membership($1::uuid,$2)::text", [
      mid,
      reason,
    ]);
  });
  res.json({ ok: true });
});
