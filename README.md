# HOA Management

A multi-community HOA platform under development, using the existing Next.js
16.4.2 Pages Router, React 19, strict TypeScript 6, Node 24, and npm.

The first slice provides community registration and independent authority review,
duplicate protection, scoped access, community switching, a limited authorized
management portfolio, and audited membership revocation. It does not collect
money or implement the remaining product modules. The development backend is
deployed; complete Cognito signup/TOTP verification remains outstanding. Local
tests use an explicit development-only adapter.

## Local setup

```sh
nvm use
npm ci
cp .env.example .env.local
```

Set local PostgreSQL URLs and a generated `SESSION_SECRET` in `.env.local`.
Use a separate administrative migration credential and a `hoa_runtime` application
login. The application rejects a table owner, superuser, or BYPASSRLS runtime role.
PostgreSQL 18 is the tested baseline; install its server/client binaries or use
`docker compose --env-file .env.local up -d db` with `LOCAL_POSTGRES_PASSWORD` set.
The compose database is local-only and contains no application data initially.

```sh
npm run db:migrate
```

Using the administrative connection, enable `LOGIN` for the new `hoa_runtime`
role and set its own strong password (for example, interactive psql `\password
hoa_runtime` followed by `ALTER ROLE hoa_runtime LOGIN;`). Match that password in
`DATABASE_URL`; never use the migration login in the web process.

For synthetic local data, set `AUTH_MODE=development` and `ALLOW_DEV_AUTH=true`,
keep `PLATFORM_ORIGIN=http://localhost:3000`, then run:

```sh
npm run db:seed
npm run dev
```

Open http://localhost:3000/login. Applicant submits registrations, Reviewer reviews
them, Manager belongs to two communities with different roles, Resident belongs
to one, and Outsider has no initial membership. These identities simulate verified
email/MFA and cannot be enabled in production. The seed requires an explicitly
enabled loopback development database. Synthetic names and addresses are fixtures.

To use Cognito, set `AUTH_MODE=cognito`, disable development auth, and configure
the pool/client/domain/region variables described in `.env.example`. Register the
exact `${PLATFORM_ORIGIN}/api/auth/callback` URL. Configure verified email,
authorization-code grant, PKCE, `openid email`, required MFA, password-only sign-in,
and TOTP enrollment. Supply task-role IAM for `DescribeUserPool` and `AdminGetUser`.
Use a public client without a secret; never put AWS credentials in browser variables.
See [architecture and identity constraints](docs/architecture.md).

## Routes

| Route | Purpose |
|---|---|
| `/` | Public platform introduction or approved default-subdomain identity |
| `/login` | Cognito entry or explicitly enabled local personas |
| `/register` | Authenticated community registration and private claims |
| `/app` | Current memberships and the applicant's own request statuses |
| `/communities/[id]` | Permission-checked community identity and access administration |
| `/portfolio` | Explicitly assigned organization summary, with MFA |
| `/admin` | Platform-only authority review, with MFA |

API mutations require an exact same-origin JSON request. API routes are under
`/api/auth/*`, `/api/registrations`, `/api/registrations/[id]/review`,
`/api/communities/[id]`, and
`/api/communities/[id]/memberships/[membershipId]/revoke`. Private responses are
uncacheable. There are no payment, export, file, event, email, or custom-domain APIs.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run format:check
```

`test:db` creates and removes an isolated PostgreSQL cluster with random local
credentials, applies migrations twice, tests real RLS/concurrent registration,
and runs a real dump/restore check. It uses `/usr/lib/postgresql/18/bin` by default;
set `PG_BIN` for your installation. It never reads a configured application database.

`test:e2e` creates another isolated cluster and a copied test application under
ignored `.data/`, leaving an existing development server alone. It uses port 3217
and local Chrome (`/usr/bin/google-chrome`, or `CHROME_PATH`). Playwright exercises
registration/review/switching, resource/host isolation, CSRF, and axe accessibility
checks. Browser tests do not verify Cognito, AWS, DNS, Stripe, or legal policies.
Automated axe checks do not establish full WCAG conformance.

`npm run check` runs lint, both TypeScript projects, unit tests, full Gen 2
synthesis, database/restore tests, the build, and an isolated production bundle
smoke test. The bundle test uses synthetic resource references and never calls AWS.
Browser checks are separate because they require Chrome. `npm run format` formats
application, infrastructure and test code. ESLint 10 works with this Next.js config but several
bundled plugins still emit upstream peer-dependency warnings during npm install.
The [dependency review](docs/dependency-review.md) records unresolved build-tool
advisories and compatible security overrides. Production dependency auditing is
clean; the full development audit is not.

## Deployment and scope

The selected target is AWS Amplify Gen 2 in us-east-1: Cognito, private S3,
and private Aurora PostgreSQL through the Data API. Next.js 16 uses the documented
Node 24 compute bundle because Amplify's native Next.js adapter lists support
through version 15. The repository owns this packaging integration. Only the
`development` branch is enabled; automatic builds and PR previews start disabled.

See [deployment and recovery](docs/deployment.md) for setup commands, permissions,
cost controls, migrations, rollback, verification boundaries and launch gates.
See the dated [development deployment record](docs/development-deployment.md) for
the AWS environment, actual verification results and remaining release gates.
Live Aurora and Cognito configuration checks have passed; complete human identity
and production-equivalent recovery testing remain outstanding.

Read the [product brief](docs/product-brief.md), [architecture](docs/architecture.md),
[authorization matrix](docs/authorization.md), [payment design](docs/payment-flows.md),
[domain evaluation](docs/domain-onboarding.md), [events contract](docs/events-and-moderation.md),
and [implementation checklist](docs/implementation-checklist.md).

## Branch workflow

Use `development` for ongoing work and as the base for feature/fix branches.
Target feature pull requests at `development`, then promote reviewed changes
through `development` → `staging` → `main`. Run the required checks before promotion
and validate in the staging environment before merging to `main`.
Branch creation and pushes do not provision environments or deploy the app.

GitHub Releases are not configured. If adopted,
use reviewed semantic versions, matching `vX.Y.Z` tags, a changelog describing
user-visible changes and migrations, and explicit maintainer approval to publish.
