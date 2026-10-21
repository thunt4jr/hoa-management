import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";
import {
  Layout,
  PageIntro,
  Unavailable,
  requestJson,
} from "@/src/components/Layout";
import { protectedPage } from "@/src/server/pages";
import { withContext } from "@/src/server/db";
import { requirePlatformAdmin } from "@/src/server/authorization";
interface Review {
  id: string;
  applicant_id: string;
  status: string;
  kind: string;
  near_match: boolean;
  payload: {
    displayName: string;
    legalName: string;
    authorityEvidence: string;
    representative: string;
    representativeTitle: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      region: string;
      postalCode: string;
      country: string;
    };
  };
}
export const getServerSideProps = protectedPage(async (_ctx, actor) =>
  withContext(actor, null, async (db) => {
    await requirePlatformAdmin(db);
    await db.query("SELECT hoa.record_review_access()");
    return {
      requests: (
        await db.query(
          "SELECT id,applicant_id,status,kind,near_match,payload FROM hoa.registrations WHERE status IN ('pending_review','claim_review') AND expires_at>now() ORDER BY created_at",
        )
      ).rows as Review[],
    };
  }),
);
export default function Admin({
  data,
  actor,
  error: pageError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data) return <Unavailable message={pageError} />;
  return (
    <Layout title="Platform review" actor={actor}>
      <PageIntro
        eyebrow="Platform administration"
        title="Community verification"
      >
        Review authority evidence and community identity before approving a
        workspace. These controls do not provide access to private resident
        correspondence.
      </PageIntro>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data.requests.length ? (
        <div className="stack">
          {data.requests.map((r) => (
            <article className="card" key={r.id}>
              <span className="pill">{r.kind.replaceAll("_", " ")}</span>
              <h2>{r.payload.displayName}</h2>
              <p>{r.payload.legalName}</p>
              <p>
                {Object.values(r.payload.address).filter(Boolean).join(", ")}
              </p>
              <p>
                <strong>Representative:</strong> {r.payload.representative},{" "}
                {r.payload.representativeTitle}
              </p>
              <p>
                <strong>Submitted evidence description:</strong>{" "}
                {r.payload.authorityEvidence}
              </p>
              {r.near_match && (
                <p className="notice">
                  A nearby location or legal-name match requires comparison
                  before approval.
                </p>
              )}
              {["access", "ownership_dispute"].includes(r.kind) && (
                <p className="notice">
                  Access and ownership disputes require an accountable handover
                  review. This phase records the claim but cannot grant a
                  claimant access. Contact the verified current administration
                  through the approved support process.
                </p>
              )}
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const f = new FormData(e.currentTarget);
                  try {
                    await requestJson(`/api/registrations/${r.id}/review`, {
                      decision: String(f.get("decision")),
                      reason: String(f.get("reason")),
                      evidence: String(f.get("evidence")),
                    });
                    window.location.reload();
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Decision
                  <select name="decision">
                    <option value="reject">Reject this request</option>
                    {r.kind === "new" && (
                      <option value="approve">
                        Approve verified authority and community
                      </option>
                    )}
                    {r.kind === "shared_association" && (
                      <option value="approve_shared">
                        Approve a separate association at this shared address
                      </option>
                    )}
                  </select>
                </label>
                <label>
                  Review reason
                  <textarea
                    name="reason"
                    minLength={20}
                    maxLength={2000}
                    required
                    rows={3}
                  />
                </label>
                <label>
                  Reviewed evidence reference
                  <input
                    name="evidence"
                    minLength={10}
                    maxLength={500}
                    required
                  />
                  <span className="muted">
                    Reference an approved external evidence record; do not paste
                    a signed file URL or secrets.
                  </span>
                </label>
                <button
                  className="button"
                  disabled={busy || r.applicant_id === actor?.id}
                >
                  Record decision
                </button>
                {r.applicant_id === actor?.id && (
                  <p className="muted">
                    A different platform reviewer must review your request.
                  </p>
                )}
              </form>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No pending reviews</h2>
          <p>
            New requests will appear here. Expired reservations cannot be
            approved.
          </p>
        </div>
      )}
    </Layout>
  );
}
