# Amplify working-session report — 2026-10-21

## Outcome

Prepared the development deployment for AWS Amplify Gen 2 in the requested
personal profile/us-east-1. Keep Next.js 16.4.2, TypeScript and the Pages Router.
The repository maintains a Node 24 deployment bundle because the native Amplify
Next.js adapter currently lists support through version 15. No staging/main
environment or production deployment was created.

**AWS deployment remains blocked.** The personal CLI profile still reports an
expired SSO token. A new device-code attempt expired without approval, and
`amplify:prepare` failed with CredentialsProviderError before its first AWS read
completed. No cloud app, database, pool, bucket or IAM role was created by this
session. The user must renew the session on this machine; verify STS identity
before provisioning. A prior confirmation of sign-in did not make this CLI's
session valid. No AWS account number or successful live integration is inferred.

## Files changed

- `amplify/backend.ts`, `auth/resource.ts`, `storage/resource.ts`,
  `infrastructure.ts`, `functions/migrate.ts`, `tsconfig.json`: Gen 2 Cognito with
  required TOTP; retained private/versioned/encrypted S3; private Aurora 17.7
  with Data API, 0–2 ACUs and idle auto-pause; separated runtime/migration IAM
  and Secrets Manager credentials; transactional checksum migrations.
- `amplify.yml`: explicit development backend/hosting build stages.
- `scripts/prepare-amplify.ts`, `attach-amplify-role.ts`, `amplify-runtime.ts`,
  `package-amplify.ts`: repository-linked app preparation with auto-build/previews
  disabled, scoped role attachment, runtime secret loading and Node 24 packaging.
- `src/server/data-api.ts`, `sql.ts`, `db.ts`, `authorization.ts`: common query
  interface, bound Data API parameters, metadata decoding, explicit transactions,
  sanitized SQLSTATE handling and transaction-local identity/tenant/MFA/timeouts.
- `src/server/auth.ts`, `communities/service.ts`, `pages/admin.tsx`, `pages/app.tsx`,
  `pages/api/communities/[id]/memberships/[membershipId]/revoke.ts`: explicit
  PostgreSQL casts for transport-compatible UUID, JSONB, integer and void results.
- `scripts/migrate.ts`, `isolated-tests.ts`: use the shared SQL splitter, explicitly
  select native PostgreSQL for local tests, and run the real-PostgreSQL protocol test.
- `tests/data-api.test.ts`, `data-api-database.test.ts`, `infrastructure.test.ts`,
  `scripts/synth-amplify.ts`, `test-amplify-package.ts`: binding/transaction/error,
  real RLS/context, infrastructure, complete Gen 2 synthesis and artifact checks.
- `package.json`, `package-lock.json`, `.gitignore`, `.env.example`,
  `eslint.config.mjs`, root `tsconfig.json`: pinned SDK/CDK/Gen 2 dependencies,
  compatible security overrides, scripts, transport configuration and artifact ignores.
- `AGENTS.md`, `README.md`, `docs/architecture.md`, `deployment.md`,
  `domain-onboarding.md`, `implementation-checklist.md`, `dependency-review.md`
  and this report: actual setup, architecture, cost controls, caveats and evidence.

No applied SQL migration was edited, real prices invented, synthetic data seeded
in AWS, or existing local development server stopped.

## Commands and results

| Command/check actually run | Result |
|---|---|
| Repository status/log/remotes and source/documentation review | Development tracking origin/development; existing main/staging preserved |
| `npm install` for pinned Gen 2/CDK/SDK tooling and compatible security overrides | Completed; existing ESLint peer warnings remain |
| `npm run check` after final dependency changes | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed Next.js/root and separate Amplify TypeScript projects |
| `npm test` | 9 tests passed |
| `npm run amplify:synth` | Complete Gen 2 graph synthesized; MFA/callback/private retained bucket assertions passed; no deployment |
| `npm run test:db` | 12 existing PostgreSQL isolation/concurrency/permission tests plus 1 protocol-over-real-PostgreSQL test passed; migration reapply and actual dump/restore passed |
| `npm run test:e2e` | All 3 registration/review/switching, isolation/CSRF/host/cache and mobile/axe workflows passed |
| `npm run build` | Next.js 16.4.2 standalone build passed |
| `npm run test:amplify-package` | 41.8 MiB self-contained compute bundle; production server/host/no-store/dev-auth checks passed; synthetic fixture removed |
| `npm run format:check`, `git diff --check` | Passed |
| `npm audit --omit=dev` | Zero reported production advisories |
| Full `npm audit` | Not clean: 43 high/3 moderate affected dev packages, zero critical; three underlying advisories documented in dependency-review.md |
| `aws sts get-caller-identity --profile personal --region us-east-1` | Failed: expired SSO token |
| `aws sso login --profile personal --no-browser --use-device-code` | Device-code attempt expired (InvalidGrantException) |
| `AWS_PROFILE=personal AWS_REGION=us-east-1 npm run amplify:prepare` | Failed: CredentialsProviderError; no resources created |

Initial sandbox socket restrictions required running local PostgreSQL/package
checks with the approved socket capability. An early package test used fetch,
which discarded its explicit Host header; the test now uses HTTP requests and
passes without weakening application host validation.

## Remaining external setup and scope

Renew personal AWS SSO; verify account identity, available Aurora minor and CDK
bootstrap/permissions; authorize the GitHub connection if AWS requires it; deploy
development backend/hosting and verify real Host, cache, IAM, Data API and Cognito
signup/email/TOTP/replay/logout behavior. Assign no platform reviewer until an
accountable operator independently verifies a real identity and records the grant.

Default community wildcard DNS/TLS needs an owned domain. Cloudflare/custom
domains remain unevaluated against the actual Amplify origin. Budget amounts,
alert recipients, monitoring, WAF, secret rotation, live Aurora recovery testing,
dependency-review resolution and production approval remain outstanding. Aurora
auto-pause is a cost control, not a total-spend cap. Retained state can stay billable
after stack removal.

The wider product modules remain on implementation-checklist.md: properties and
resident lifecycle, governance/files, events/discussions/RSVPs/reminders,
subscriptions/payments/reconciliation, confidential notices and custom domains.
Local mocks/fixtures are not live provider verification. This is not a production
readiness claim.

Suggested commit: `feat: configure Amplify Gen 2 development deployment`
