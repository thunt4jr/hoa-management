import { z } from "zod";
import { withContext, type Principal } from "../db";
import { AppError } from "../errors";
import { requirePermission, requirePlatformAdmin } from "../authorization";
import { validSlug } from "../hosts";
import { addressSchema, normalizeAddress } from "./address";
import { throttle } from "../auth";

export const registrationSchema = z
  .object({
    legalName: z.string().trim().min(3).max(180),
    displayName: z.string().trim().min(3).max(100),
    slug: z
      .string()
      .refine(
        validSlug,
        "Use 3–48 lowercase letters, numbers, or hyphens; system addresses are reserved.",
      ),
    associationType: z.enum([
      "hoa",
      "condominium",
      "cooperative",
      "master",
      "sub_association",
    ]),
    propertyCount: z.number().int().min(1).max(1000000),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA timezone."),
    address: addressSchema,
    mailingAddress: addressSchema,
    representative: z.string().trim().min(3).max(120),
    representativeTitle: z.string().trim().min(3).max(120),
    authorityEvidence: z.string().trim().min(20).max(2000),
    kind: z.enum(["new", "access", "shared_association", "ownership_dispute"]),
  })
  .strict();
export type RegistrationInput = z.infer<typeof registrationSchema>;

export async function submitRegistration(actor: Principal, input: unknown) {
  const data = registrationSchema.parse(input);
  const address = normalizeAddress(data.address);
  await throttle(`registration:${actor.id}`, 20);
  return withContext(actor, null, async (db) => {
    try {
      const result = await db.query(
        "SELECT hoa.submit_registration($1,$2,$3) AS id",
        [
          { ...data, normalizedAddress: address.normalized },
          address.key,
          address.nearKey,
        ],
      );
      return {
        id: result.rows[0].id as string,
        status: data.kind === "new" ? "pending_review" : "claim_review",
      };
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new AppError(
          409,
          "location_review",
          "This address needs review. Request access or a shared-association review without creating another community.",
        );
      throw error;
    }
  });
}

export async function dashboard(actor: Principal, communityId: string) {
  z.uuid().parse(communityId);
  return withContext(actor, communityId, async (db) => {
    await requirePermission(db, communityId, "community.read");
    const community = (
      await db.query(
        "SELECT id,legal_name,display_name,slug,timezone,status FROM hoa.communities WHERE id=$1",
        [communityId],
      )
    ).rows[0];
    const membership = (
      await db.query(
        "SELECT id,role FROM hoa.memberships WHERE community_id=$1 AND user_id=$2",
        [communityId, actor.id],
      )
    ).rows[0];
    const members =
      membership.role === "community_admin"
        ? (
            await db.query(
              "SELECT id,role,user_id,revoked_at FROM hoa.memberships WHERE community_id=$1 ORDER BY starts_at",
              [communityId],
            )
          ).rows
        : [];
    const audit =
      membership.role === "community_admin"
        ? (
            await db.query(
              "SELECT action,resource_id,created_at FROM hoa.audit_events WHERE community_id=$1 ORDER BY created_at DESC LIMIT 20",
              [communityId],
            )
          ).rows
        : [];
    return { community, membership, members, audit };
  });
}

export async function reviewRegistration(
  actor: Principal,
  id: string,
  input: unknown,
) {
  z.uuid().parse(id);
  const data = z
    .object({
      decision: z.enum(["approve", "approve_shared", "reject"]),
      reason: z.string().trim().min(20).max(2000),
      evidence: z.string().trim().min(10).max(500),
    })
    .strict()
    .parse(input);
  return withContext(actor, null, async (db) => {
    await requirePlatformAdmin(db);
    return (
      await db.query(
        "SELECT hoa.review_registration($1,$2,$3,$4) AS community_id",
        [id, data.decision, data.reason, data.evidence],
      )
    ).rows[0];
  });
}
