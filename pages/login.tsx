import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { useState } from "react";
import { Layout, PageIntro, requestJson } from "@/src/components/Layout";
import { config } from "@/src/server/config";
import { safeReturnPath } from "@/src/server/hosts";
import { platformPage } from "@/src/server/http";
import { developmentPersonas } from "@/src/development-personas";
export function getServerSideProps(ctx: GetServerSidePropsContext) {
  try {
    platformPage(ctx);
    return {
      props: {
        dev: config().devAuth,
        next: safeReturnPath(ctx.query.next),
        configured: !!process.env.COGNITO_CLIENT_ID,
      },
    };
  } catch {
    return { notFound: true as const };
  }
}
export default function Login({
  dev,
  next,
  configured,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Layout title="Sign in">
      <div className="narrow">
        <PageIntro eyebrow="Your account" title="Welcome back">
          Sign in before choosing a community. Community access is reviewed
          separately.
        </PageIntro>
        <div className="card">
          {dev ? (
            <>
              <p className="notice">
                Development identity adapter. These accounts contain synthetic
                local data and simulate verified email and MFA.
              </p>
              <h2>Choose a local test account</h2>
              <div className="stack">
                {developmentPersonas.map((persona) => (
                  <button
                    disabled={busy}
                    className="button secondary"
                    key={persona}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await requestJson("/api/auth/dev", { persona });
                        window.location.assign(next);
                      } catch (e) {
                        setError((e as Error).message);
                        setBusy(false);
                      }
                    }}
                  >
                    {persona.charAt(0).toUpperCase() + persona.slice(1)}
                  </button>
                ))}
              </div>
            </>
          ) : configured ? (
            <>
              <h2>Secure account access</h2>
              <p>
                Cognito manages signup, email verification, and TOTP MFA.
                Complete enrollment, then sign in again if prompted.
              </p>
              <a
                className="button"
                href={`/api/auth/login?next=${encodeURIComponent(next)}`}
              >
                Continue to secure sign-in
              </a>
            </>
          ) : (
            <>
              <h2>Identity provider setup required</h2>
              <p>
                Configure Cognito to enable signup and sign-in. Local developers
                can opt into the documented development adapter.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
