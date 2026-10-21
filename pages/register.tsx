import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Layout,
  PageIntro,
  Unavailable,
  requestJson,
} from "@/src/components/Layout";
import { protectedPage } from "@/src/server/pages";
export const getServerSideProps = protectedPage(async () => ({ ready: true }));
const addressFields = [
  ["line1", "Street address"],
  ["line2", "Building / unit (if applicable)"],
  ["city", "City"],
  ["region", "State / province / region"],
  ["postalCode", "Postal code"],
  ["country", "Country (two-letter code)"],
] as const;
function AddressFields({ prefix, legend }: { prefix: string; legend: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="form-grid">
        {addressFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={`${prefix}.${key}`}
              required={key !== "line2"}
              maxLength={
                key === "country" ? 2 : key === "postalCode" ? 20 : 100
              }
              defaultValue={key === "country" ? "US" : undefined}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export default function Register({
  data,
  actor,
  error: pageError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  if (!data) return <Unavailable message={pageError} />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      get = (key: string) => String(f.get(key) || "");
    const address = (prefix: string) =>
      Object.fromEntries(
        addressFields.map(([key]) => [key, get(`${prefix}.${key}`)]),
      );
    try {
      const result = await requestJson("/api/registrations", {
        legalName: get("legalName"),
        displayName: get("displayName"),
        slug: get("slug"),
        associationType: get("associationType"),
        propertyCount: Number(get("propertyCount")),
        timezone: get("timezone"),
        representative: get("representative"),
        representativeTitle: get("representativeTitle"),
        authorityEvidence: get("authorityEvidence"),
        kind: get("kind"),
        address: address("physical"),
        mailingAddress: address("mailing"),
      });
      setSuccess(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout title="Community registration" actor={actor}>
      <PageIntro
        eyebrow="Community onboarding"
        title="Register or request access"
      >
        Use the association’s physical location. Its mailing address is
        collected separately.
      </PageIntro>
      <ol className="progress" aria-label="Onboarding stages">
        <li>1. Verified account</li>
        <li aria-current="step">2. Community &amp; authority review</li>
        <li>3. Billing and payment setup, coming later</li>
      </ol>
      {success ? (
        <div className="card" role="status">
          <h2>Request received</h2>
          <p>
            Your reference is {success}. Platform staff must verify authority
            before granting access. No subscription or payment collection has
            been activated.
          </p>
          <Link className="button" href="/app">
            View request status
          </Link>
        </div>
      ) : (
        <form className="card form" onSubmit={submit}>
          <fieldset>
            <legend>Request type</legend>
            <label>
              What do you need?
              <select name="kind">
                <option value="new">Register a new community</option>
                <option value="access">
                  Request access to an existing community
                </option>
                <option value="shared_association">
                  Review a separate association at a shared address
                </option>
                <option value="ownership_dispute">
                  Review an authority or ownership dispute
                </option>
              </select>
            </label>
            <p className="muted">
              Claims reveal no resident data and grant no automatic access.
              Shared locations require evidence and explicit approval.
            </p>
          </fieldset>
          <fieldset>
            <legend>Association details</legend>
            <div className="form-grid">
              <label>
                Legal association name
                <input
                  name="legalName"
                  required
                  minLength={3}
                  maxLength={180}
                />
              </label>
              <label>
                Display name
                <input
                  name="displayName"
                  required
                  minLength={3}
                  maxLength={100}
                />
              </label>
              <label>
                Requested community address
                <input
                  name="slug"
                  required
                  minLength={3}
                  maxLength={48}
                  pattern="[a-z][a-z0-9-]{2,47}"
                  aria-describedby="slug-help"
                />
                <span id="slug-help" className="muted">
                  Lowercase letters, numbers, and hyphens. System names are
                  reserved.
                </span>
              </label>
              <label>
                Association type
                <select name="associationType">
                  <option value="hoa">HOA</option>
                  <option value="condominium">Condominium</option>
                  <option value="cooperative">Cooperative</option>
                  <option value="master">Master association</option>
                  <option value="sub_association">Sub-association</option>
                </select>
              </label>
              <label>
                Approximate number of properties
                <input
                  name="propertyCount"
                  type="number"
                  min="1"
                  max="1000000"
                  required
                />
              </label>
              <label>
                Community timezone
                <input
                  name="timezone"
                  defaultValue="America/New_York"
                  required
                  aria-describedby="timezone-help"
                />
                <span id="timezone-help" className="muted">
                  IANA name, such as America/Chicago.
                </span>
              </label>
            </div>
          </fieldset>
          <AddressFields
            prefix="physical"
            legend="Physical community location"
          />
          <AddressFields prefix="mailing" legend="Separate mailing address" />
          <fieldset>
            <legend>Authority verification</legend>
            <div className="form-grid">
              <label>
                Authorized representative
                <input
                  name="representative"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </label>
              <label>
                Position / authority
                <input
                  name="representativeTitle"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </label>
            </div>
            <label>
              Describe the evidence available for review
              <textarea
                name="authorityEvidence"
                required
                minLength={20}
                maxLength={2000}
                rows={4}
                aria-describedby="evidence-help"
              />
            </label>
            <p id="evidence-help" className="muted">
              Describe board authorization or an existing administrator’s
              approval. Do not enter bank details, tax identifiers, identity
              documents, or resident records. Secure evidence upload is not
              available in this phase.
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Submitting…" : "Submit for review"}
          </button>
          <p className="muted">
            Unverified reservations expire after 14 days. Knowing an address
            does not establish authority.
          </p>
        </form>
      )}
    </Layout>
  );
}
