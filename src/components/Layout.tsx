import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/router";
import type { Principal } from "../server/db";
export async function requestJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.error?.fields
        ?.map(
          (f: { path: string; message: string }) => `${f.path}: ${f.message}`,
        )
        .join(" · ") ||
        data.error?.message ||
        "The request failed.",
    );
  return data;
}
export function Layout({
  title,
  actor,
  children,
}: {
  title: string;
  actor?: Principal | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");
  return (
    <>
      <Head>
        <title>{title} | HOA Management</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="HOA Management home">
            <span className="brand-mark" aria-hidden="true">
              H
            </span>
            HOA Management
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/app">My communities</Link>
            <Link href="/portfolio">Portfolio</Link>
            {actor?.platformAdmin && actor.mfa && (
              <Link href="/admin">Platform review</Link>
            )}
            {actor ? (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await requestJson("/api/auth/logout", {});
                    await router.push("/login");
                  } catch {
                    setLogoutError("Sign-out failed. Try again.");
                  }
                }}
              >
                Sign out
              </button>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        {logoutError && (
          <p role="alert" className="error">
            {logoutError}
          </p>
        )}
        {children}
      </main>
      <footer className="site-footer">
        Community identity, clear responsibilities, private access.
      </footer>
    </>
  );
}
export function Unavailable({ message }: { message?: string | null }) {
  return (
    <Layout title="Service setup">
      <div className="card">
        <h1>Service setup required</h1>
        <p role="alert">
          {message ||
            "This page is unavailable. Check service configuration and try again."}
        </p>
        <Link href="/">Return home</Link>
      </div>
    </Layout>
  );
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </div>
  );
}
