# Repository guidance

Keep Next.js 16, TypeScript, npm, and the Pages Router. Preserve uncommitted work;
do not initialize Git, commit, or deploy without an explicit request.

Read `docs/architecture.md`, `docs/authorization.md`, and
`docs/implementation-checklist.md` before changing server behavior. The full
product scope belongs in `docs/product-brief.md`.

Keep business rules in `src/server/`. Every protected request needs a verified
session and a fresh database permission check. Hosts never grant membership.
Use `withContext` for transaction-local user/community context. The runtime
database role must neither own tables nor bypass RLS. Add isolation tests for
new tenant tables and recipient checks for private resources.

Use integer minor units for money. Keep subscriptions separate from HOA funds.
Do not enable payments, public resident data, custom domains, or provider mocks
in production. The local identity adapter requires explicit opt-in and must fail
closed in production.

Run lint, typecheck, unit/database tests, and build for server changes. Run the
implemented browser workflows when changing forms or authentication. Report
checks not run and external setup blockers. Keep docs aligned with working code.
Include a suggested commit message in implementation summaries.
