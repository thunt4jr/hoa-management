import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { Layout, PageIntro, Unavailable } from "@/src/components/Layout";
import { protectedPage } from "@/src/server/pages";
import { withContext } from "@/src/server/db";
export const getServerSideProps = protectedPage(async (_ctx, actor) =>
  withContext(actor, null, async (db) => ({
    communities: (await db.query("SELECT * FROM hoa.my_communities()"))
      .rows as {
      id: string;
      display_name: string;
      slug: string;
      role: string;
    }[],
    registrations: (
      await db.query(
        "SELECT id,CASE WHEN status='pending_review' AND expires_at<=now() THEN 'expired' ELSE status END AS status,kind,created_at,expires_at,payload->>'displayName' AS display_name FROM hoa.registrations WHERE applicant_id=$1::uuid ORDER BY created_at DESC",
        [actor.id],
      )
    ).rows as {
      id: string;
      status: string;
      kind: string;
      display_name: string;
      expires_at: string;
    }[],
  })),
);
export default function AppHome({
  data,
  actor,
  error,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (!data) return <Unavailable message={error} />;
  return (
    <Layout title="My communities" actor={actor}>
      <PageIntro eyebrow="Your workspace" title="My communities">
        Choose a community to use the permissions assigned to you there.
      </PageIntro>
      <div className="section-heading">
        <h2>Active memberships</h2>
        <Link className="button secondary" href="/register">
          Register or request access
        </Link>
      </div>
      {data.communities.length ? (
        <div className="card-grid">
          {data.communities.map((c) => (
            <Link
              className="card community-card"
              key={c.id}
              href={`/communities/${c.id}`}
            >
              <span className="pill">{c.role.replaceAll("_", " ")}</span>
              <h3>{c.display_name}</h3>
              <p>Open community workspace</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>No active memberships yet</h3>
          <p>
            Submit a community for review or request access to an existing
            association. A pending registration does not grant management
            access.
          </p>
        </div>
      )}
      <section>
        <h2>Your registrations and claims</h2>
        {data.registrations.length ? (
          <div className="stack">
            {data.registrations.map((r) => (
              <div className="card compact" key={r.id}>
                <div>
                  <h3>{r.display_name}</h3>
                  <p className="muted">Reference {r.id}</p>
                </div>
                <span className="pill">{r.status.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Your submitted requests will appear here.</p>
        )}
      </section>
    </Layout>
  );
}
