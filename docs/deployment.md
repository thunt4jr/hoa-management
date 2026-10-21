# Deployment, operations, and recovery

## Current verification boundary

The standalone Next.js build and isolated PostgreSQL tests are local checks.
The Dockerfile and local compose definition are provided but no container image,
ECS service, ALB, RDS instance, S3 bucket, Cognito pool, DNS zone, email service,
or production restore has been provisioned/tested. External setup is a release
blocker, not a completed integration.

## AWS staging target

1. Create separate AWS resources, database credentials, pools, secrets, and domains
   for development/staging/production. Use IaC reviewed for the actual account;
   this repository has no deployed IaC state. Choose a region-supported RDS 18
   minor after querying available engine versions. Require encrypted storage,
   TLS certificate verification, private subnets, backups, and deletion protection.
2. Build the supplied container with Node 24 and `npm ci`, scan dependencies/image,
   and pin reviewed base-image digests before release. Publish only with explicit
   authorization. The multi-stage image runs as a non-root user and excludes
   local environment and credential files. Its build needs no provider credentials.
3. Run on ECS Fargate behind an HTTPS ALB with ACM certificates. Configure an exact
   platform host and verified wildcard default domain. Preserve Host, reject invalid
   HTTP headers, deny origin access except via ALB security groups, and validate
   Host behavior end-to-end. TLS redirect and HSTS belong at the HTTPS edge. No
   arbitrary forwarded host is trusted. Keep Cloudflare custom domains disabled.
4. Inject only `DATABASE_URL`, `SESSION_SECRET`, `PLATFORM_ORIGIN`,
   `COMMUNITY_BASE_DOMAIN`, `AUTH_MODE=cognito`, `ALLOW_DEV_AUTH=false`, and Cognito
   region/pool/client/domain configuration. Keep secrets in Secrets Manager.
   Never supply `DATABASE_ADMIN_URL` or migration role credentials to the web task.
   Use the task IAM role for Cognito reads; no static access keys or browser secrets.
5. Require a verified-email, password-only Cognito public client with code grant,
   PKCE, TOTP and required MFA. Register the fixed platform callback. Test signup,
   first-login enrollment, re-login, state replay, disabled users, logout, callback
   rejection on customer domains, and JWT failures. Federated logins fail closed.
   Initial platform-review authority is assigned through an approved administrative
   process after identity verification, never by signup, domain, or email matching.
6. Use a separately controlled schema-owner migration job for fixed-search-path
   definer functions. Owner-only RLS policies avoid requiring superuser/BYPASSRLS.
   The initial job needs schema/table creation and permission to create the limited
   runtime role. Apply `npm run db:migrate` before deploying
   dependent code. Configure the existing `hoa_runtime` login with a distinct secret;
   it must not own tables, inherit an owner role, be superuser, or have BYPASSRLS.
   Verify application refusal with an unsafe credential and confirm RLS tests against
   a staging copy. Lock down migration access and audit all privileged operations.
7. Configure WAF limits for unauthenticated login/registration traffic. The app has
   durable fixed-window limits for login starts and registration identities; these
   do not replace edge abuse prevention. Test ALB task health using the platform
   Host, not a task-IP Host rejected by the app. Add multi-AZ service health checks,
   resource limits, deployment alarms, and controlled egress to required providers.

## Migrations and rollback

Migrations run transactionally under an advisory lock and keep checksum records
in `public.hoa_schema_migrations`. Reapplying unchanged migrations is a no-op;
editing an applied migration fails. Use additive migrations and backfill before
removing columns. A deploy rollback reuses the prior immutable image only if its
schema contract is compatible. Prefer a forward repair migration. Restore a
backup only through an approved incident process because it can lose newer writes.
Do not run development seed scripts in staging or production.

## Backups and restore

`npm run test:db` performs `pg_dump --format=custom` and restores into a second
isolated synthetic database, then checks community data and forced RLS flags.
This verifies local logical backup mechanics. It does not verify RDS PITR,
availability-zone recovery, real data, key recovery, or a business RTO/RPO.

Before launch, enable encrypted RDS automated backups/PITR and retained snapshots;
approve retention, RTO/RPO, legal holds, and encryption-key access. Restore a
staging snapshot into an isolated network. Rotate credentials, verify expected
record counts, constraints, grants, function ownership, sessions, audit continuity,
and cross-tenant/recipient denial with the real runtime role. Measure recovery
time/data loss and document a dated operator sign-off. Invalidate pre-incident
sessions and reconcile provider webhooks before resuming writes. Later S3 versions
and exports require coordinated backup/restore and malware quarantine procedures.

## Logging and data lifecycle

API errors emit structured request ID/category events without body, token, SQL,
address, or provider exception text. Filter OAuth query strings and private paths
from ALB/CDN/APM logs; query codes must not enter analytics. Configure CloudWatch
alarms for 5xx, DB pool saturation, elevated auth/review failures, and backup
failure. Dashboards, alarms, log filtering, and traces are not provisioned here.

Sessions expire after 30 minutes; unused OAuth attempts after 10 minutes; pending
address reservations after 14 days. Cleanup runs opportunistically at login or
registration. Durable sweeper jobs and notification/import/provisioning outboxes
remain future work. Keep tenant/job/cache/search keys community-scoped, recheck
recipient permissions at execution, and use retries with idempotency.

No record-deletion, legal-hold, data-export, retention policy, file upload, malware
scanner, or exceptional support-access workflow is implemented. Do not invent or
apply a destructive retention schedule. Obtain approved rules before introducing
account erasure, and preserve required financial/governance history. Portal
restriction is not legal privilege or protection against lawful disclosure.

## Launch gates

Require documented security review, approved legal/business/retention policies,
provider activation and sandbox verification, production-equivalent recovery test,
accessibility/manual keyboard review, monitoring, and a pilot with synthetic or
authorized communities. Passing a build is not a production-readiness claim.
