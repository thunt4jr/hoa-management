import type { InferGetServerSidePropsType } from "next";
import { Layout, PageIntro, Unavailable } from "@/src/components/Layout";
import { protectedPage } from "@/src/server/pages";
import { withContext } from "@/src/server/db";
import { AppError } from "@/src/server/errors";
export const getServerSideProps = protectedPage(async (_ctx, actor) =>
  withContext(actor, null, async (db) => {
    const rows = (await db.query("SELECT * FROM hoa.my_portfolio()")).rows as {
      organization_name: string;
      community_id: string;
      display_name: string;
      slug: string;
    }[];
    if (!rows.length)
      throw new AppError(
        403,
        "forbidden",
        "An explicit active portfolio assignment is required.",
      );
    return { rows };
  }),
);
export default function Portfolio({
  data,
  actor,
  error,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (!data) return <Unavailable message={error} />;
  return (
    <Layout title="Management portfolio" actor={actor}>
      <PageIntro eyebrow="Management organization" title="Authorized portfolio">
        Only communities with an active, explicitly approved portfolio
        assignment appear here. Open individual workspaces through your
        community memberships.
      </PageIntro>
      <div className="card-grid">
        {data.rows.map((r) => (
          <div className="card" key={r.community_id}>
            <p className="eyebrow">{r.organization_name}</p>
            <h2>{r.display_name}</h2>
            <p className="muted">Community reference: {r.community_id}</p>
          </div>
        ))}
      </div>
    </Layout>
  );
}
