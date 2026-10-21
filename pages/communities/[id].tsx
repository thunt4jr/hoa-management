import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Layout,
  PageIntro,
  Unavailable,
  requestJson,
} from "@/src/components/Layout";
import { protectedPage } from "@/src/server/pages";
import { dashboard } from "@/src/server/communities/service";
import { withContext } from "@/src/server/db";
export const getServerSideProps = protectedPage(async (ctx, actor) => ({
  ...(await dashboard(actor, String(ctx.params?.id))),
  choices: await withContext(
    actor,
    null,
    async (db) =>
      (await db.query("SELECT * FROM hoa.my_communities()")).rows as {
        id: string;
        display_name: string;
      }[],
  ),
}));
export default function Community({
  data,
  actor,
  error: pageError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState("");
  const router = useRouter();
  if (!data) return <Unavailable message={pageError} />;
  return (
    <Layout title={data.community.display_name} actor={actor}>
      <div className="section-heading">
        <span className="pill">Approved community</span>
        <label className="switcher">
          Switch community
          <select
            value={data.community.id}
            onChange={(e) => router.push(`/communities/${e.target.value}`)}
          >
            {data.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PageIntro
        eyebrow="Community workspace"
        title={data.community.display_name}
      >
        Your role here: {data.membership.role.replaceAll("_", " ")}. Permissions
        are checked for this community on each request.
      </PageIntro>
      <div className="card-grid">
        <div className="card">
          <h2>Association identity</h2>
          <p>{data.community.legal_name}</p>
          <p className="muted">Timezone: {data.community.timezone}</p>
        </div>
        <div className="card">
          <h2>Access and onboarding</h2>
          <p>
            Community verification is approved. Subscription setup and HOA
            collection accounts are not enabled in this phase.
          </p>
          <Link href="/app">View your communities and requests</Link>
        </div>
      </div>
      {data.membership.role === "community_admin" && (
        <section>
          <h2>Membership access</h2>
          <p className="muted">
            Internal references are shown for access administration. This is not
            a resident directory. Verify a successor before removing the last
            administrator.
          </p>
          <div className="stack">
            {data.members.map(
              (m: {
                id: string;
                role: string;
                user_id: string;
                revoked_at: string | null;
              }) => (
                <div className="card compact" key={m.id}>
                  <div>
                    <h3>{m.role.replaceAll("_", " ")}</h3>
                    <p className="muted">Member {m.user_id}</p>
                    <p>
                      {m.revoked_at ? "Access revoked" : "Active membership"}
                    </p>
                  </div>
                  {!m.revoked_at && m.user_id !== actor?.id && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const reason = String(
                          new FormData(e.currentTarget).get("reason"),
                        );
                        try {
                          await requestJson(
                            `/api/communities/${data.community.id}/memberships/${m.id}/revoke`,
                            { reason },
                          );
                          window.location.reload();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <label>
                        Reason for revoking access
                        <input name="reason" minLength={10} required />
                      </label>
                      <button className="button secondary">
                        Revoke membership
                      </button>
                    </form>
                  )}
                </div>
              ),
            )}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <h2>Access audit</h2>
          {data.audit.length ? (
            <ul>
              {data.audit.map(
                (
                  a: {
                    action: string;
                    created_at: string;
                    resource_id: string;
                  },
                  i: number,
                ) => (
                  <li key={i}>
                    {a.action} · {a.created_at} · {a.resource_id}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="muted">Membership access changes will appear here.</p>
          )}
        </section>
      )}
    </Layout>
  );
}
