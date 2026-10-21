import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { withContext, closeDatabase, type Principal } from "../src/server/db";
import { requirePermission } from "../src/server/authorization";
import {
  dashboard,
  submitRegistration,
  reviewRegistration,
} from "../src/server/communities/service";
import { ids, sampleAddress } from "../scripts/seed";
const admin = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const actor = (
  name: "applicant" | "reviewer" | "manager" | "resident" | "outsider",
  mfa = true,
): Principal => ({
  id: ids[name],
  email: `${name}@example.test`,
  mfa,
  platformAdmin: name === "reviewer",
});
const registration = (street: string, extra: Record<string, unknown> = {}) => ({
  legalName: `Test Association ${street}`,
  displayName: `Test Community ${street}`,
  slug: `test-${randomUUID().slice(0, 12)}`,
  associationType: "hoa",
  propertyCount: 25,
  timezone: "America/New_York",
  address: { ...sampleAddress, line1: street },
  mailingAddress: { ...sampleAddress, line1: "500 Manager Road" },
  representative: "Test Representative",
  representativeTitle: "Authorized board representative",
  authorityEvidence:
    "Board resolution available for an independent authority review.",
  kind: "new",
  ...extra,
});
after(async () => {
  await closeDatabase();
  await admin.end();
});

test("runtime is non-owner, non-bypass; all shared tables force RLS", async () => {
  await withContext(null, null, async (db) => {
    const row = (
      await db.query(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    assert.equal(row.rolsuper, false);
    assert.equal(row.rolbypassrls, false);
    assert.equal((await db.query("SELECT * FROM hoa.communities")).rowCount, 0);
  });
  const result = await admin.query(
    "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='hoa' AND relkind='r'",
  );
  for (const row of result.rows) {
    assert.ok(row.relrowsecurity && row.relforcerowsecurity, row.relname);
  }
  const owners = await admin.query(
    "SELECT DISTINCT r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid JOIN pg_roles r ON p.proowner=r.oid WHERE n.nspname='hoa'",
  );
  assert.ok(owners.rowCount);
  for (const owner of owners.rows) {
    assert.equal(owner.rolsuper, false);
    assert.equal(owner.rolbypassrls, false);
  }
});
test("guessed IDs and changed tenant context cannot cross community membership", async () => {
  assert.equal(
    (await dashboard(actor("resident"), ids.courtyard)).community.id,
    ids.courtyard,
  );
  await assert.rejects(() => dashboard(actor("resident"), ids.lake), {
    status: 403,
  });
  await withContext(actor("resident"), ids.courtyard, async (db) => {
    assert.equal(
      (await db.query("SELECT * FROM hoa.communities WHERE id=$1", [ids.lake]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT * FROM hoa.memberships WHERE community_id=$1", [
          ids.lake,
        ])
      ).rowCount,
      0,
    );
  });
  await withContext(actor("resident"), ids.lake, async (db) => {
    assert.equal((await db.query("SELECT * FROM hoa.communities")).rowCount, 0);
  });
  await assert.rejects(() => dashboard(actor("reviewer"), ids.courtyard), {
    status: 403,
  });
});
test("transaction-local tenant state resets after commit and rollback", async () => {
  await withContext(actor("manager"), ids.courtyard, (db) =>
    db.query("SELECT * FROM hoa.communities"),
  );
  await assert.rejects(() =>
    withContext(actor("manager"), ids.lake, async () => {
      throw new Error("rollback");
    }),
  );
  await withContext(null, null, async (db) => {
    assert.equal((await db.query("SELECT * FROM hoa.communities")).rowCount, 0);
    assert.equal(
      (await db.query("SELECT hoa.actor_id() AS id,hoa.tenant_id() AS tenant"))
        .rows[0].id,
      null,
    );
  });
});
test("permissions vary by community and privileged roles require MFA", async () => {
  await withContext(actor("manager"), ids.courtyard, (db) =>
    requirePermission(db, ids.courtyard, "members.manage"),
  );
  await assert.rejects(
    () =>
      withContext(actor("manager"), ids.lake, (db) =>
        requirePermission(db, ids.lake, "members.manage"),
      ),
    { status: 403 },
  );
  await withContext(actor("manager"), ids.lake, (db) =>
    requirePermission(db, ids.lake, "finance.manage"),
  );
  await assert.rejects(
    () => dashboard(actor("manager", false), ids.courtyard),
    { status: 403 },
  );
  await withContext(actor("manager"), ids.courtyard, async (db) => {
    assert.equal(
      (
        await db.query(
          "SELECT hoa.has_permission($1,'notices.manage') AS allowed",
          [ids.courtyard],
        )
      ).rows[0].allowed,
      false,
    );
  });
});
test("portfolio requires an active explicit organization assignment", async () => {
  const list = (who: Principal) =>
    withContext(
      who,
      null,
      async (db) => (await db.query("SELECT * FROM hoa.my_portfolio()")).rows,
    );
  assert.equal((await list(actor("manager"))).length, 2);
  assert.equal((await list(actor("resident"))).length, 0);
  assert.equal((await list(actor("manager", false))).length, 0);
  await admin.query(
    "UPDATE hoa.management_assignments SET allow_portfolio=false WHERE community_id=$1",
    [ids.lake],
  );
  assert.equal((await list(actor("manager"))).length, 1);
  await admin.query(
    "UPDATE hoa.management_assignments SET allow_portfolio=true WHERE community_id=$1",
    [ids.lake],
  );
});
test("simultaneous registrations reserve one canonical address, never two tenants", async () => {
  const data = registration("310 Concurrency Street");
  const results = await Promise.allSettled([
    submitRegistration(actor("applicant"), data),
    submitRegistration(actor("outsider"), {
      ...data,
      address: { ...data.address, line1: "310 CONCURRENCY ST." },
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  const created = results.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<{ id: string }>;
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM hoa.memberships WHERE user_id IN ($1,$2)",
        [ids.applicant, ids.outsider],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    () =>
      reviewRegistration(actor("applicant"), created.value.id, {
        decision: "approve",
        reason: "Self approval must not grant board access.",
        evidence: "test-evidence:001",
      }),
    { status: 403 },
  );
});
test("approval grants verified authority; duplicate address creation stays blocked", async () => {
  const data = registration("320 Verification Avenue"),
    pending = await submitRegistration(actor("applicant"), data);
  const approved = await reviewRegistration(actor("reviewer"), pending.id, {
    decision: "approve",
    reason:
      "Independent board resolution and representative authority reviewed.",
    evidence: "synthetic-evidence:320",
  });
  assert.ok(approved.community_id);
  assert.equal(
    (await dashboard(actor("applicant"), approved.community_id)).membership
      .role,
    "community_admin",
  );
  await assert.rejects(
    () =>
      submitRegistration(actor("outsider"), {
        ...data,
        slug: "second-unverified",
      }),
    { status: 409 },
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM hoa.audit_events WHERE resource_id=$1 AND action='registration.approve'",
        [pending.id],
      )
    ).rows[0].n,
    1,
  );
});
test("shared address requires a separate evidence-backed platform decision", async () => {
  const pending = await submitRegistration(
    actor("outsider"),
    registration("100 Sample Street", {
      kind: "shared_association",
      slug: "shared-sub-association",
    }),
  );
  await assert.rejects(() =>
    reviewRegistration(actor("reviewer"), pending.id, {
      decision: "approve",
      reason: "Trying the ordinary approval path must fail.",
      evidence: "synthetic-evidence:shared",
    }),
  );
  const result = await reviewRegistration(actor("reviewer"), pending.id, {
    decision: "approve_shared",
    reason:
      "Distinct sub-association and authorized representative independently verified.",
    evidence: "synthetic-evidence:shared",
  });
  const exception = (
    await admin.query(
      "SELECT e.* FROM hoa.address_exceptions e JOIN hoa.communities c ON c.address_exception_id=e.id WHERE c.id=$1",
      [result.community_id],
    )
  ).rows[0];
  assert.equal(exception.approved_by, ids.reviewer);
});
test("expired reservations are reclaimable and cannot be approved", async () => {
  const data = registration("330 Expiry Road"),
    pending = await submitRegistration(actor("applicant"), data);
  await admin.query(
    "UPDATE hoa.registrations SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [pending.id],
  );
  await assert.rejects(() =>
    reviewRegistration(actor("reviewer"), pending.id, {
      decision: "approve",
      reason: "An expired reservation cannot grant access.",
      evidence: "synthetic-evidence:expired",
    }),
  );
  const fresh = await submitRegistration(actor("outsider"), {
    ...data,
    slug: "reclaimed-expired",
  });
  assert.notEqual(fresh.id, pending.id);
});
test("claims reveal no existing member data or privileged access", async () => {
  const claim = await submitRegistration(
    actor("outsider"),
    registration("100 Sample Street", { kind: "access" }),
  );
  assert.deepEqual(Object.keys(claim).sort(), ["id", "status"]);
  await withContext(actor("resident"), null, async (db) => {
    assert.equal(
      (
        await db.query("SELECT * FROM hoa.registrations WHERE id=$1", [
          claim.id,
        ])
      ).rowCount,
      0,
    );
  });
  await assert.rejects(() =>
    reviewRegistration(actor("reviewer"), claim.id, {
      decision: "approve",
      reason: "Knowing a location cannot grant authority.",
      evidence: "synthetic-evidence:claim",
    }),
  );
});
test("ordinary runtime writes cannot grant roles, approve claims, or read session storage", async () => {
  for (const sql of [
    "UPDATE hoa.memberships SET role='community_admin'",
    "UPDATE hoa.registrations SET status='approved'",
    "SELECT * FROM hoa.sessions",
    "INSERT INTO hoa.communities(legal_name) VALUES('Bypass')",
  ]) {
    await assert.rejects(
      () =>
        withContext(actor("resident"), ids.courtyard, (db) => db.query(sql)),
      { code: "42501" },
    );
  }
  await assert.rejects(
    () =>
      withContext(actor("resident"), null, (db) =>
        db.query(
          "SELECT hoa.review_registration($1,'approve','A sufficiently long reason.','evidence:test')",
          [randomUUID()],
        ),
      ),
    { code: "42501" },
  );
});

test("membership revocation is immediate, audited, and keeps the last administrator", async () => {
  const membership = (
    await admin.query(
      "SELECT id FROM hoa.memberships WHERE user_id=$1 AND community_id=$2",
      [ids.resident, ids.courtyard],
    )
  ).rows[0].id;
  await withContext(actor("manager"), ids.courtyard, (db) =>
    db.query("SELECT hoa.revoke_membership($1,$2)", [
      membership,
      "Move-out confirmed by approved staff.",
    ]),
  );
  await assert.rejects(() => dashboard(actor("resident"), ids.courtyard), {
    status: 403,
  });
  const own = (
    await admin.query(
      "SELECT id FROM hoa.memberships WHERE user_id=$1 AND community_id=$2",
      [ids.manager, ids.courtyard],
    )
  ).rows[0].id;
  await assert.rejects(() =>
    withContext(actor("manager"), ids.courtyard, (db) =>
      db.query("SELECT hoa.revoke_membership($1,$2)", [
        own,
        "No successor was approved yet.",
      ]),
    ),
  );
  const audit = await withContext(actor("manager"), ids.courtyard, (db) =>
    db.query(
      "SELECT * FROM hoa.audit_events WHERE resource_id=$1 AND action='membership.revoked'",
      [membership],
    ),
  );
  assert.equal(audit.rowCount, 1);
  await assert.rejects(() =>
    withContext(actor("manager"), ids.courtyard, (db) =>
      db.query("DELETE FROM hoa.audit_events"),
    ),
  );
});
