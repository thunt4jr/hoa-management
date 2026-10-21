import type {
  InferGetServerSidePropsType,
  GetServerSidePropsContext,
} from "next";
import Link from "next/link";
import { Layout } from "@/src/components/Layout";
import { classifyHost } from "@/src/server/hosts";
import { config } from "@/src/server/config";
import { withContext } from "@/src/server/db";
import { noStore } from "@/src/server/http";
export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  noStore(ctx.res);
  try {
    const host = classifyHost(ctx.req.headers.host);
    if (host.kind === "platform")
      return {
        props: {
          community: null as { id: string; display_name: string } | null,
          origin: config().origin.origin,
        },
      };
    const community = await withContext(
      null,
      null,
      async (db) =>
        (await db.query("SELECT * FROM hoa.public_community($1)", [host.slug]))
          .rows[0],
    );
    if (!community) return { notFound: true as const };
    return {
      props: {
        community: community as { id: string; display_name: string },
        origin: config().origin.origin,
      },
    };
  } catch {
    return { notFound: true as const };
  }
}
export default function Home({
  community,
  origin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (community)
    return (
      <Layout title={community.display_name}>
        <section className="hero">
          <p className="eyebrow">Community portal</p>
          <h1>{community.display_name}</h1>
          <p className="lede">
            Workspace access is available to approved members.
          </p>
          <a className="button" href={`${origin}/communities/${community.id}`}>
            Sign in to your workspace
          </a>
          <p className="muted">
            Sign-in takes place securely at the platform address.
          </p>
        </section>
      </Layout>
    );
  return (
    <Layout title="Community management">
      <section className="hero-grid">
        <div className="hero">
          <p className="eyebrow">
            For independent associations &amp; their managers
          </p>
          <h1>A clear home for your community.</h1>
          <p className="lede">
            Keep each HOA’s identity and access separate, even when the same
            people help manage several communities.
          </p>
          <div className="actions">
            <Link className="button" href="/register">
              Register a community
            </Link>
            <Link className="button secondary" href="/app">
              Open your workspace
            </Link>
          </div>
          <p className="muted">
            Foundation preview · Community approval is required before
            activation.
          </p>
        </div>
        <aside className="hero-panel">
          <span className="pill">A considered starting point</span>
          <h2>
            One platform.
            <br />
            Distinct communities.
          </h2>
          <div className="feature-row">
            <span>01</span>
            <div>
              <h3>Verified authority</h3>
              <p>
                Registration starts a review. It does not grant board access.
              </p>
            </div>
          </div>
          <div className="feature-row">
            <span>02</span>
            <div>
              <h3>Scoped permissions</h3>
              <p>Your role follows the community you are working in.</p>
            </div>
          </div>
          <div className="feature-row">
            <span>03</span>
            <div>
              <h3>Continuity of records</h3>
              <p>
                Community identity remains separate from management assignments.
              </p>
            </div>
          </div>
        </aside>
      </section>
      <section className="callout">
        <h2>Building in verified stages</h2>
        <p>
          This preview covers identity, registration review, and community
          access. Subscriptions, resident payments, events, and confidential
          case management remain in development. No money is collected here.
        </p>
      </section>
    </Layout>
  );
}
