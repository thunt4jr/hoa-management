# Development deployment — 2026-10-21

This is a development foundation, not a production release. No resident data,
synthetic seed, payment account or platform reviewer was created in AWS.

**Verified live at 18:58 UTC:**
[development site](https://development.dmxkehgksjyhj.amplifyapp.com).
Amplify job **12** passed BUILD/DEPLOY/VERIFY and serves code from `af3a2eb`.
The root backend stack is `UPDATE_COMPLETE`. Subsequent documentation-only commits
do not trigger another deployment because automatic builds remain disabled.

## Resources and boundaries

- AWS personal account `136140097897`, region `us-east-1`, SSO profile `personal`.
- Dedicated Amplify Gen 2 app `hoa-management-development` (`dmxkehgksjyhj`),
  connected only to GitHub's `development` branch. Auto-build and PR previews are off.
- Development origin: `https://development.dmxkehgksjyhj.amplifyapp.com`.
- Root backend stack: `amplify-dmxkehgksjyhj-development-branch-b8b18d1f36`.
  Cognito, storage and database stacks deployed successfully.
- Required TOTP Cognito with a public authorization-code client and fixed callback;
  private versioned S3; private Aurora PostgreSQL 17.7 Serverless v2, Data API,
  0–2 ACUs and 15-minute auto-pause. Retention/deletion protection remain enabled.
- Schema-owner secret belongs only to the migration path. Compute gets the distinct
  `hoa_runtime` credential reference and session secret, never the owner secret.
- Original app `d1fnxnoqkpd9t9` and its main service role are preserved. The screenshot's
  main URL remains the earlier deployment. Main/staging are not deployed by this work.

Automatic approval review rejected replacing the original app-wide service role,
because it could affect main and expand persistent IAM authority. A separate
development app avoided that cross-branch change. Its deployment role is separate
from the restricted web runtime role.

## Verification completed

- `npm run check`: lint, both TypeScript projects, nine unit/protocol/infrastructure
  tests, full Gen 2 synthesis, twelve PostgreSQL tests plus the Data API-envelope
  integration test, logical dump/restore, Next.js build and production-bundle smoke.
- `npm run test:e2e`: three browser workflows passed, covering registration and
  independent review, switching, authorization/host/CSRF boundaries and automated
  mobile accessibility. Uses isolated local fixtures, not Cognito impersonation.
- Clean checkout: `npx --yes npm@11.5.1 ci`, followed by the complete check and
  browser workflows. CI's Node 24.5 loader was also tested explicitly.
- `npm audit --omit=dev`: zero reported vulnerabilities. The full development audit
  still has unresolved findings documented in [dependency review](dependency-review.md).
- Changed TypeScript scripts passed Prettier checks; `git diff --check` passed.
- Live `verify:deployment -- --backend-only`: non-owner `hoa_runtime`, forced RLS,
  no-context community visibility, JSON decoding and denied direct session-table
  reads passed through the real Aurora Data API. Cognito required MFA, enabled TOTP,
  password-only factors, public client and fixed callback passed.
- IAM policy simulation: runtime/session secrets allowed; migration secret and
  S3 object reads denied. This is policy simulation, not an assumed-role read test.
- Actual S3 configuration: all four public-access blocks on and versioning enabled.
- `AWS_PROFILE=personal npm run verify:deployment`: all live checks passed,
  including HTTPS homepage 200/security headers, ignored forwarding header,
  private 307/no-store, disabled synthetic login 404, invalid callback 400,
  real login 302/PKCE/nonce/secure host-only cookie, and Cognito's login form 200.
  This is not a completed human signup, TOTP challenge or authenticated session.
- CloudTrail confirmed Amplify assumes the restricted runtime role. Hosted startup
  initially failed with `CredentialsProviderError` before a Secrets Manager call.
  Moving secret loading into request handling fixed it; the live homepage and
  login checks now pass without placing secrets or AWS keys in the bundle.
- Log delivery initially lacked group-discovery permission and its log group.
  Both are now provisioned by setup. The runtime log group exists with 30-day
  operational retention and receives startup/request diagnostics.
- Aurora auto-pause was observed: the first verification attempt returned
  `DatabaseResumingException` before a transaction began. After resume, explicit
  verification passed. Application writes and uncertain commits are not replayed.
- Remote staging/main remain at `1ca3b48`; the original app's service role is unchanged.

## Changes made during deployment

`scripts/prepare-amplify.ts` now uses only an owned, matching development app and
role, rereads IAM role metadata after creation, and never replaces another app's
service role. `package-lock.json` repairs clean-install inconsistencies without
changing pinned direct dependencies. `amplify/package.json` marks backend modules
as ESM; `scripts/synth-amplify.mjs` uses the CLI deployer's scoped loader to match CI.
`scripts/package-amplify.ts` and its smoke check identify the standalone adapter
separately from the native Next.js adapter. The minimal `hosting/package.json`
app root and matching frontend working directory select generic compute while
root npm scripts build the existing application with its original Next CLI command.
`scripts/verify-deployment.ts` provides
repeatable live checks without creating users or granting authority. Package
scripts, deployment/architecture/checklist/README docs and `.agents/PAPERCUTS.md`
record these behaviors and the clean-install workaround.

The preparation helper synchronizes owned app/branch build metadata and provisions
the runtime log group before deployment, with 30-day operational retention.
`src/server/runtime.ts` and `proxy.ts` initialize the session secret during request
handling; the entrypoint carries references and starts Next first. The package
regression verifies that absent credentials return a no-store 503 for both public
and protected routes. A separate local test using real temporary environment
credentials returned 200 for `/` and 302 for login start; no credential values
were printed or stored. The exact cloud-built artifact also returned 200 locally,
with only its test port changed to avoid an existing server.

Files changed since the initial Gen 2 setup (`a754a58`):

- Setup/config: `.env.example`, `.agents/PAPERCUTS.md`, `amplify.yml`,
  `amplify/package.json`, `hosting/package.json`, `package.json`,
  `package-lock.json`, `eslint.config.mjs`, `tsconfig.json`.
- Runtime: `proxy.ts`, `src/server/runtime.ts`, `scripts/amplify-runtime.ts`.
- Tooling/checks: `scripts/prepare-amplify.ts`, `scripts/package-amplify.ts`,
  `scripts/synth-amplify.mjs`, `scripts/test-amplify-package.ts`,
  `scripts/verify-deployment.ts`.
- Documentation: `README.md`, `docs/architecture.md`, `docs/deployment.md`,
  `docs/implementation-checklist.md`, `docs/development-deployment.md`,
  `docs/amplify-session-report.md` (marked as a historical checkpoint).

## Outstanding release gates

Complete real signup, email verification, TOTP enrollment/challenge, successful
callback, session/replay failures, disabled identity and logout tests with an
authorized test user. No human credentials or initial reviewer grant were invented.
An accountable operator must independently verify any initial reviewer.

Test production-equivalent Aurora snapshot/PITR recovery and rollback; the local
logical restore test is not an Aurora recovery drill. Configure operational alerts,
budget recipients/amounts, retention and evidence policies. Wildcard/default
community DNS and TLS need an owned domain; custom domains remain unimplemented.

Properties/invitations, documents, events/RSVPs/discussions/reminders, subscriptions,
HOA collections, private notices and self-service domains remain separate future
slices in the [implementation checklist](implementation-checklist.md). A security
review, approved business/legal policies, provider activation and a pilot are
required before a production launch. Staging/main need their own reviewed setup.
