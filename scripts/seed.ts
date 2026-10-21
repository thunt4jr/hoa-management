import "./load-env";
import { Pool } from "pg";
import { normalizeAddress } from "../src/server/communities/address";

export const ids = {
  applicant: "00000000-0000-4000-8000-000000000001",
  reviewer: "00000000-0000-4000-8000-000000000002",
  manager: "00000000-0000-4000-8000-000000000003",
  resident: "00000000-0000-4000-8000-000000000004",
  outsider: "00000000-0000-4000-8000-000000000005",
  courtyard: "10000000-0000-4000-8000-000000000001",
  lake: "10000000-0000-4000-8000-000000000002",
  organization: "20000000-0000-4000-8000-000000000001",
};
export const sampleAddress = {
  line1: "100 Sample Street",
  line2: "",
  city: "Example City",
  region: "NY",
  postalCode: "10001",
  country: "US",
};
export async function seed(url: string) {
  const pool = new Pool({ connectionString: url });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const name of [
      "applicant",
      "reviewer",
      "manager",
      "resident",
      "outsider",
    ] as const)
      await db.query(
        "INSERT INTO hoa.users(id,subject,email,email_verified,platform_admin) VALUES($1,$2,$3,true,$4) ON CONFLICT(id) DO NOTHING",
        [
          ids[name],
          `development:${name}`,
          `${name}@example.test`,
          name === "reviewer",
        ],
      );
    for (const [id, street, name, slug] of [
      [
        ids.courtyard,
        "100 Sample Street",
        "Sample Courtyard HOA",
        "sample-courtyard",
      ],
      [ids.lake, "200 Sample Street", "Sample Lake Association", "sample-lake"],
    ]) {
      const a = normalizeAddress({ ...sampleAddress, line1: street });
      const location = (
        await db.query(
          "INSERT INTO hoa.community_locations(address_key,near_key,canonical_address) VALUES($1,$2,$3) ON CONFLICT(address_key) DO UPDATE SET address_key=excluded.address_key RETURNING id",
          [a.key, a.nearKey, a.normalized],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO hoa.communities(id,location_id,legal_name,display_name,slug) VALUES($1,$2,$3,$3,$4) ON CONFLICT(id) DO NOTHING",
        [id, location, name, slug],
      );
    }
    await db.query(
      "INSERT INTO hoa.memberships(community_id,user_id,role) VALUES($1,$2,'community_admin'),($3,$2,'treasurer'),($1,$4,'homeowner') ON CONFLICT(community_id,user_id) DO NOTHING",
      [ids.courtyard, ids.manager, ids.lake, ids.resident],
    );
    await db.query(
      "INSERT INTO hoa.organizations VALUES($1,'Sample Management Organization') ON CONFLICT DO NOTHING",
      [ids.organization],
    );
    await db.query(
      "INSERT INTO hoa.organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin') ON CONFLICT DO NOTHING",
      [ids.organization, ids.manager],
    );
    await db.query(
      "INSERT INTO hoa.management_assignments(organization_id,community_id,allow_portfolio) VALUES($1,$2,true),($1,$3,true) ON CONFLICT DO NOTHING",
      [ids.organization, ids.courtyard, ids.lake],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("/seed.ts")) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.AUTH_MODE !== "development" ||
    process.env.ALLOW_DEV_AUTH !== "true" ||
    !process.env.DATABASE_ADMIN_URL ||
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_ADMIN_URL).hostname,
    )
  )
    throw new Error(
      "Synthetic seed requires an explicitly enabled local development database.",
    );
  seed(process.env.DATABASE_ADMIN_URL)
    .then(() =>
      console.log(
        "Synthetic local identities and two sample communities are ready.",
      ),
    )
    .catch(() => {
      console.error("Seed failed; check database setup.");
      process.exitCode = 1;
    });
}
