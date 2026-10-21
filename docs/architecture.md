# Architecture and assumptions

## Repository assessment, 2026-10-21

The existing project was a Next.js 16.4.2 / React 19.3.1 Pages Router starter with
strict TypeScript 6.0.3, ESLint 10, npm, and Node 24. There was no database,
authentication, infrastructure, environment example, or test suite. The directory
is untracked within an ancestor Git repository; no repository was initialized,
branch changed, commit created, or pre-existing work discarded.

This implementation retains that stack and adds a modular server application,
PostgreSQL, Cognito integration code, and isolated tests. There is one database and
one production identity provider. TypeScript 6 remains pinned because the existing
Next.js ESLint tooling does not support the TypeScript 7 API.

## Hosting decision

Use a Node 24 standalone Next.js container on ECS Fargate behind an HTTPS ALB,
with private RDS PostgreSQL, Secrets Manager, and private S3 in later phases.
This is a deployment target, not provisioned infrastructure. AWS currently lists
[Amplify SSR support through Next.js 15](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html).
Preserving Next.js 16 makes the [supported Node/container deployment](https://nextjs.org/docs/pages/getting-started/deploying)
the appropriate starting target. Cognito does not require Amplify Hosting or a
second authentication library.

Local integration tests use PostgreSQL 18.6 binaries. RDS documents
[PostgreSQL 18 support](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html);
confirm the exact minor version and region before provisioning. No AWS account,
region-specific quotas, Cognito pool, deployment, or external integration has
been exercised by these tests.

## Implemented slice

Public introduction, hosted-provider sign-in entry, development-only identities,
community registration, private applicant status, authority review, shared-address
exceptions, community switcher, per-community roles, explicitly assigned portfolio
summary, membership revocation, append-only application audit, and default
subdomain resolution. No subscription or resident collection can be activated.

The server modules are `auth`, `authorization`, `communities`, database context,
and request/host boundaries. Governance, events, communications, violations,
payments, and custom-domain provisioning will become separate modules as working
slices are implemented. There are no placeholder payment or event APIs.

## Identity and sessions

Cognito authorization-code login uses PKCE S256, a nonce, server-side encrypted
single-use attempts, and a same-browser state cookie. Callback URLs are fixed
configuration. JWT validation checks signature, issuer, audience, lifetime,
token type, verified email, and nonce. Federated identities fail closed in this
phase. Cognito IAM reads verify a required-MFA pool, password-only first factors,
and enrolled TOTP before issuing an application session. First Cognito signup
can issue tokens before factor enrollment, so the callback requires enrollment
and another sign-in. Live provider behavior still needs sandbox verification.
See [AWS MFA behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
and [token endpoint documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html).

Application sessions are random 256-bit opaque tokens, hashed in PostgreSQL,
valid for 30 minutes, revocable, and held in HttpOnly host-only SameSite=Lax
cookies. Production uses Secure and the `__Host-` prefix. No tokens are stored
in localStorage and no refresh tokens are retained. Membership and MFA permission
checks occur afresh for each resource request. Failed sign-out remains visible.

The development adapter uses only synthetic preseeded personas, the same session
tables, and the same authorization services. It requires both explicit environment
flags, a loopback platform origin, and a non-production runtime. It simulates
verified email and MFA; it is not a Cognito emulator or a production integration.

## Database boundaries

All shared tables enable and force RLS. `withContext` begins a transaction, checks
the runtime is neither superuser, table owner, nor BYPASSRLS, and uses
transaction-local user, community, and MFA settings. Commit and rollback clear
the context before pooled connections are reused. Tenant tables require both
context and current membership/permission. Authentication and directory bootstrap
use narrow SECURITY DEFINER functions with a fixed search path; runtime has no
direct access to their tables. A controlled schema owner owns these functions and
has an explicit owner-only RLS policy; it needs neither superuser nor BYPASSRLS.
Its credential must never reach the web container. The runtime also rejects role
creation/database creation privileges and membership in the schema-owner role.

RLS supplements server authorization. Runtime credentials and code can set the
context and must be trusted; RLS does not protect against a compromised app server
or arbitrary SQL execution under that credential. Use parameterized queries and
review definer functions as a privileged interface. Platform reviewer access does
not bypass tenant records. Audit writes use narrow functions and no runtime
UPDATE/DELETE grants; database administrators remain able to alter storage.

Organization administration, dated management assignments, legal communities,
users, and memberships are distinct. Portfolio grants expose only an approved
community-name summary, not membership, finance, or resident records. A manager
still needs individual community permissions to open a workspace. Billing
customers and connected fund recipients will be separate entities in phase 3.

## Registration integrity

Store original physical and mailing input separately. Normalize Unicode, case,
spacing, common street abbreviations, and postal spacing without dropping unit
distinctions. This is conservative normalization, not postal-service validation
or geocoding. Other address spellings and legal-name matches require human review;
international normalization and authoritative association identifiers remain open.

An advisory transaction lock and canonical-location unique constraint serialize
registrations. A partial unique index permits one pending reservation per location.
Reservations expire in 14 days and are reclaimed transactionally on the next
attempt. Expired requests cannot be approved. A verified primary community blocks
ordinary self-service registration. All duplicate responses use the same generic
review message; no member information is returned. Near matches are flagged.

Claims for access or disputed authority are recorded privately and do not grant
access. Their approval/handover workflow is deferred. A separate shared-association
request can create a community only after a different platform reviewer records
authority evidence, a reason, and an address-exception record. Database constraints
bind the exception to that location. Reviewers cannot approve their own requests.
An active community means identity approved, not paid subscription or collection
capability. Authority evidence upload is unavailable; the text form instructs users
to avoid sensitive identifiers, and reviewers reference approved external records.

## Hosts and privacy

Only the exact platform authority or syntactically valid default subdomains are
accepted. Reserved names are rejected in both code and database. Public default
subdomains resolve only active community display names, and never authorize users.
Unknown mappings return 404; arbitrary/custom hosts return 421. Forwarded host
headers are ignored. Authentication and protected workspaces stay at the central
platform origin with host-only cookies. Customer domains will not share sessions.

Private responses use `private, no-store` and vary by Host and Cookie. There are
no search indexes, exports, file links, jobs, real-time channels, or tenant caches
in this phase; those need explicit isolation tests when added. Notification subjects,
resident correspondence, and resident directories are not implemented or exposed.

## Product assumptions needing approval

- Keep the descriptive repository name until a real platform name is supplied.
- No real prices, fees, entitlements, legal templates, or retention periods are set.
- Require TOTP for all current Cognito accounts as a conservative first policy;
  role-specific enrollment and federated assurance need further design.
- A human reviews authority evidence. Operational evidence acceptance standards,
  disputes, support escalation, and jurisdictional policies need an accountable owner.
- Pending address reservations last 14 days; adjust after product review.
- Public default subdomains show only an approved display name and central access
  link. Full branding and explicit public content approval come in phase 2.
- Every initial privileged role has a fixed permission set. Custom grants and
  documented board-authority transfer require their own reviewed workflow.
- No team names, policies, charges, provider activation, or production readiness
  are implied by this foundation.
