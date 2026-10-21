# Development deployment — 2026-10-21

This is a development foundation, not a production release. No resident data,
synthetic seed, payment account or platform reviewer was created in AWS.

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
