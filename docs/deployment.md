# Amplify Gen 2 deployment, operations, and recovery

## Selected environment and verification boundary

Development targets the personal AWS profile in us-east-1. Promote through
`development` → `staging` → `main`. Only development is enabled in the backend
guard; staging/production are not provisioned. Automatic builds and PR previews
start disabled. A Git push alone does not deploy.

Gen 2 defines verified-email, password-only Cognito with required TOTP, a private
versioned S3 bucket without resident access grants, and one private Aurora
PostgreSQL Serverless v2 database. There is no AppSync or DynamoDB. No payments,
outbound email integration, custom domains, uploads or event jobs are activated.
Cloud deployment and live provider verification remain pending AWS authentication.

Next.js 16 uses a repository-maintained bundle following
[Amplify's Node compute specification](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html).
The native Next.js adapter lists support through version 15. The packager copies
the standalone server, bundles its secret-loading entrypoint, and checks the
220 MiB compute limit. Only `/_next/static/*` uses static CDN routing. All pages,
APIs, JSON page data and public assets go through compute. Private responses remain
no-store. ISR and image optimization need separate adapter work before use.
Compute has only /tmp writable and a 15-minute execution limit; long-running work
needs separate jobs. The preview defineHosting API is not used.

## First development deployment

Prerequisites: Node 24/npm, authenticated personal AWS credentials, `gh` signed
into thunt4jr with repository/webhook access, a bootstrapped CDK account/region,
and permissions to deploy Gen 2 custom resources. Never use static access keys.
Verify the returned AWS account and region before provisioning.

```sh
aws sso login --profile personal
aws sts get-caller-identity --profile personal --region us-east-1
aws rds describe-db-engine-versions --engine aurora-postgresql --engine-version 17.7 --profile personal --region us-east-1
npm ci
npm run check
npm run test:e2e
AWS_PROFILE=personal AWS_REGION=us-east-1 npm run amplify:prepare
```

`amplify:prepare` reuses only the dedicated development app matching this repository or creates one,
creates its development branch with auto-build/previews disabled, and writes
non-secret references to ignored `.data/amplify-development.json`. It sends the
current GitHub token to Amplify's repository-connection API in memory; it never
prints or stores that token. GitHub app/organization rules can require an owner
to complete authorization. Do not circumvent that requirement. Supply an explicitly
reviewed `AWS_APP_ID` if an existing app name is ambiguous.

Development uses a dedicated Amplify app named `hoa-management-development`,
with only the development branch connected. This avoids changing the service role
used by an existing app's main branch. Existing app-wide roles are never replaced.
The setup command creates or reuses only the matching development app and its
owned deployment role. Its build specification and runtime role stay scoped to
that development branch. Staging/main are promoted through Git separately and
need reviewed environment resources before deployment.

Push reviewed code to development, then start and monitor its hosting build:

```sh
aws amplify start-job --app-id YOUR_APP_ID --branch-name development --job-type RELEASE --profile personal --region us-east-1
aws amplify list-jobs --app-id YOUR_APP_ID --branch-name development --profile personal --region us-east-1
```

The build runs `ampx pipeline-deploy` inside Amplify CI and writes the backend
outputs before packaging. The CLI rejects this command outside CI. For local
backend experimentation use a separately reviewed sandbox; do not substitute a
sandbox for the shared development environment.

After the backend deploys, local inspection/packaging can fetch its non-secret
references using:

```sh
AWS_PROFILE=personal AWS_REGION=us-east-1 npx ampx generate outputs --app-id YOUR_APP_ID --branch development
npm run build
npm run amplify:package
```

Gen 2 writes ignored `amplify_outputs.json`. The runtime entrypoint reads the
session secret using its compute IAM role. Data API receives the runtime secret
reference and resolves the password. No plaintext secret is packaged. The central
origin is `https://development.YOUR_APP_ID.amplifyapp.com`.

`amplify.yml` deploys Gen 2, attaches the runtime role, validates code and packages
hosting. It never runs the synthetic seed. Database/browser tests run locally
before pushing because they need PostgreSQL and Chrome. Review infrastructure
changes before promotion. If CDK bootstrap is missing, review and explicitly
bootstrap this account/region with deployment permissions for Cognito, S3, RDS,
Lambda, IAM, secrets and networking. Never grant these powers to the web runtime.

## Permissions and tenant isolation

The deployment role uses AWS's
[AmplifyBackendDeployFullAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmplifyBackendDeployFullAccess.html)
and the account's CDK bootstrap roles. These are privileged CI permissions:
restrict repository writes, reviews, workflow edits and who can start builds.
Its additional policy permits only the development branch update and passing
roles under `/hoa-management/development/` to Amplify. Compute uses a separate role.

The web role can execute transactions against one cluster, read its runtime/session
secrets, and DescribeUserPool/AdminGetUser for its pool. It cannot read the migration
secret or S3 objects. Only the migration Lambda receives the owner secret and
configures the distinct hoa_runtime login. Runtime refuses superuser, BYPASSRLS,
CREATEROLE, CREATEDB, ownership or membership in an owner role. Shared tables force RLS.

Each Data API request is sequential within an explicit transaction. Role checks,
identity/tenant/MFA settings, authorization and resource queries use the same
transaction ID. Settings and statement timeout are transaction-local. SDK write
and commit retries are disabled. A lost commit response is an uncertain outcome,
not permission to repeat a write. Database uniqueness and locks protect address
reservations independently of HTTP retries. Future exports need pagination or
jobs that respect Data API row/result limits.

## Verify before admitting real users

Verify the actual Host behavior at the Amplify URL and keep forwarded headers
untrusted. Confirm private HTML/JSON/API cache headers and absence of private
content in static artifacts. Test real signup/email verification, TOTP enrollment,
repeat sign-in, state replay, disabled identities, logout, expiry and exact
callbacks. First signup without enrolled TOTP must not receive an app session.
Synthetic identities must remain unavailable in production.

Never create a platform reviewer by matching an email/domain or by public signup.
After a real verified Cognito sign-in creates a user row, an accountable operator
must independently verify authority and record an initial reviewer grant through
the controlled admin credential with an audit record. No such user/grant is seeded.

Run isolation/concurrency checks against an isolated Aurora database, including
SQLSTATE conflicts and rollback. The local Data API protocol test emulates only
the AWS envelope over real PostgreSQL, not the live service. IaC selects Aurora
17.7: verify region availability and auto-pause support before applying it. Local
PostgreSQL 18 checks do not establish Aurora compatibility. Generated amplifyapp.com
hostnames provide no community wildcard DNS/TLS; an owned domain and validated
routing are still required. Customer-domain provisioning remains deferred.

## Cost controls

Only development is enabled. Aurora uses 0–2 ACUs with auto-pause after 15 idle
minutes. There are no NAT gateways, load balancers, public PostgreSQL endpoints
or always-running web containers. Resume can add latency or require a later user
retry; writes are never silently retried. Two ACUs bounds database scaling, not
total spend. Storage, secrets, backups beyond allowances, requests, active compute,
hosting/builds and logs still cost money. Continuous traffic or health checks can
prevent pausing. Configure account-specific AWS Budgets/alerts before leaving the
environment running; no budget amount or notification recipient is invented here.

## Migrations, rollback and removal

The migration resource runs checked-in statements under an advisory transaction
lock and records checksums in public.hoa_schema_migrations. Unchanged migrations
are no-ops; editing an applied migration fails. Native migration tests use the
same SQL splitter. Prefer additive changes and backfills. Hosting rollback can
reuse an earlier build only if its schema contract remains compatible. Rolling
code back does not reverse SQL; prefer a forward repair migration.

Database, Cognito pool, secrets and bucket are retained. Database/pool deletion
protection is enabled. Bucket keepOnDelete prevents the auto-empty custom resource.
The migration delete handler never drops records. Deleting a branch/stack is not
a data-erasure procedure and can leave billable resources. Inventory retained
state before any separately authorized teardown. Never erase required records.
Test removal and restore in an isolated environment before production reliance.

## Backups, logging and release gates

The local database suite runs real pg_dump/restore, checks ownership/grants/data,
and verifies forced RLS and runtime denial after restore. Aurora's seven-day
backup setting is not evidence of completed PITR recovery. Before launch, approve
retention/RTO/RPO and legal holds, restore into an isolated environment, verify
counts, constraints, grants, sessions and audit continuity, and measure recovery.
Invalidate pre-incident sessions and reconcile providers before resuming writes.

Errors omit bodies, tokens, SQL, addresses and provider details. Keep OAuth query
strings and private content out of access logs/analytics. Add reviewed monitoring,
alarms, WAF controls, log retention/access and secret rotation before launch.
Resolve or explicitly review the known [build-tool advisories](dependency-review.md)
before production approval; the development audit is not clean.
Sessions expire after 30 minutes, OAuth attempts after 10 minutes and pending
reservations after 14 days; cleanup is opportunistic. Sweepers, outboxes, export,
legal holds, deletion workflows and file scanning remain future work.

Require documented security review, approved business/legal policies, provider
verification, recovery testing, accessibility review and a pilot with authorized
data before production. A successful build is not production readiness.
