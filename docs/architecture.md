# Architecture and assumptions

## Repository assessment, 2026-10-21

The existing project was a Next.js 16.4.2 / React 19.3.1 Pages Router starter with
strict TypeScript 6.0.3, ESLint 10, npm, and Node 24. There was no database,
authentication, infrastructure, environment example, or test suite. At initial assessment, the directory
was untracked within an ancestor Git repository. A dedicated repository was later
created and pushed at the user's request with development → staging → main branches.
Pre-existing work was preserved.

This implementation retains that stack and adds a modular server application,
PostgreSQL, Cognito integration code, and isolated tests. There is one database and
one production identity provider. TypeScript 6 remains pinned because the existing
Next.js ESLint tooling does not support the TypeScript 7 API.

## Hosting decision

At the user's request, development targets AWS Amplify Gen 2 in the personal
account, us-east-1. Gen 2 defines Cognito and private S3 and uses CDK custom
resources for a single Aurora PostgreSQL Serverless v2 database. It does not add
DynamoDB, AppSync, a second authentication system, or a second database.

Development has its own Amplify app, `hoa-management-development`, containing
only the development branch. Its build/runtime roles do not replace the original
app's main-branch role. Automatic builds and previews are disabled; deploys are
explicit. See the [deployment record](development-deployment.md).

Amplify's [native Next.js adapter lists support through version 15](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html).
Keep the existing Next.js 16 Pages Router and package its standalone server using
the documented [Node 24 compute deployment specification](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html).
This repository maintains that packaging adapter. It has no ISR, image optimizer,
streaming-specific adapter, or use of the preview `defineHosting` API. Test those
features before adding them. The older container Dockerfile remains an optional
exit path; ECS/Fargate is no longer the selected deployment target.

The Aurora Data API allows Amplify compute to reach a private database without
public PostgreSQL, a VPC-attached web server, or NAT gateways. Each request starts
an explicit transaction, checks its non-owner runtime role, sets transaction-local
identity/tenant/MFA and statement timeout, performs authorization/resource queries,
and commits or rolls back using the same Data API transaction ID. No ambiguous
write/commit is automatically replayed. SQL parameters remain bound; UUID,
JSONB, integer and void-returning calls use explicit casts where needed.
See [AWS's RLS/Data API pattern](https://aws.amazon.com/blogs/database/enforce-row-level-security-with-the-rds-data-api/).

The migration Lambda alone can read the generated schema-owner credential.
Runtime IAM can read only its own login secret and the session secret, call the
cluster's Data API, and perform the two required Cognito assurance reads. The
runtime role neither owns tables nor bypasses RLS. Migration changes use checksum
records and an advisory transaction lock. Unchanged migrations are a no-op.

The compute entry starts Next with non-secret references. Before routing any
request, Node request middleware loads the session secret and shares successful
initialization across requests. Missing credentials or failed secret reads return
a generic no-store 503; no application route runs. No credential or secret value
is written to logs or the deployment artifact.

IaC selects Aurora PostgreSQL 17.7, 0–2 ACUs, a 15-minute idle auto-pause, encrypted
storage, seven-day automated backups, deletion protection and retained state.
AWS documents [Data API support for PostgreSQL 17.4+ in us-east-1](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html).
Check the exact available engine minor through the account API before deployment. Local tests
use PostgreSQL 18.6. Live Aurora runtime-role/RLS and Cognito configuration checks
have passed; complete signup/TOTP/callback testing is still required. Zero minimum
ACUs reduces idle compute charges; storage, secrets,
active compute, builds and hosting still incur charges. This is no spending cap.
Only development is enabled in IaC; staging/main require separately reviewed
resources and deployment configuration. No synthetic seed runs in AWS.

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
