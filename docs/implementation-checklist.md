# Implementation checklist

This tracks delivered slices against the [full product brief](product-brief.md).
Unchecked items are remaining work, including unverified external integrations.

## Foundation

- [x] Preserve existing Next.js 16 Pages Router/TypeScript/npm stack and uncommitted work.
- [x] Record architecture, identity, permissions, payment/domain decisions and assumptions.
- [x] Implement Cognito PKCE/nonce/state/JWT and server-side assurance checks.
- [x] Provide explicitly gated local synthetic identity adapter.
- [x] Define Amplify Gen 2 Cognito/private S3/Aurora resources and Node 24 hosting bundle.
- [x] Add explicit Data API transactions, bound parameters, isolated PostgreSQL protocol tests.
- [x] Deploy development in personal/us-east-1; verify live Aurora, HTTPS boundaries,
  Cognito configuration and hosted login entry. See [verification record](development-deployment.md).
- [ ] Verify actual Cognito signup, email verification, MFA enrollment/challenge,
  callback replay/failure, logout, disabled identities, IAM and provider configuration.
- [x] Opaque, expiring, host-only sessions, same-origin JSON mutations, no private cache.
- [x] PostgreSQL migrations, forced RLS and a non-owner/non-bypass runtime role check.
- [x] Explicit role permission matrix, per-community switching, authorized portfolio summary.
- [x] Registration, private claims/status, transactional address reservation and expiry.
- [x] Independent authority review and audited shared-address approval with evidence.
- [x] Revocation, last-admin protection, append-only runtime audit trail.
- [x] Reserved-safe default subdomain lookup; unknown/custom host and callback rejection.
- [ ] Provision and verify real wildcard DNS/TLS, AWS origin and staging deployment.
- [ ] International/authoritative address matching, secure evidence uploads, accepted
  evidence policy, accountable dispute handling and existing-HOA leadership handover.
- [ ] Verified successor role grants, fine-grained permission overrides and MFA step-up.

## Community operations

- [ ] Properties, multiple owners/renters, bounded relationships, opt-in directory.
- [ ] Verified-email invitations, expiring single use, imports with preview/errors,
  move-in/out and preservation of recipient privacy across occupancy changes.
- [ ] Board positions/terms/contact preferences and credential-free leadership handover.
- [ ] Branding, configurable approved public pages and navigation.
- [ ] Documents/versions/approval/search/archive, private attachments, malware controls.
- [ ] Shared meetings/events foundation with timezone/DST recurrence and exceptions.
- [ ] Event lifecycle, public versions, canonical feed cards, mobile calendar and archive.
- [ ] Organizer announcements, event questions/replies and permission-aware attachments.
- [ ] RSVP states/guest counts/deadlines, transactional capacities/waitlists and privacy.
- [ ] Idempotent reminders/change/cancellation jobs with fresh recipient checks.
- [ ] Authorized `.ics` snapshots with privacy and stale-download explanations.
- [ ] Community discussions, categories, pins, reporting/mutes, rate limits, moderation
  warnings/restrictions/appeals, human decisions, essential-access separation.
- [ ] Notification preferences, in-app/email attempts, bounces and delivery states.

## Money and confidential workflows

- [ ] Configurable monthly/annual community subscriptions, separate billing customers,
  consolidated manager billing, lifecycle/grace/read-only/export policies.
- [ ] Verified HOA Connect accounts, hosted KYC, capability gating, approved direct
  charge/controller model, versioned fee terms/disclosure/consent.
- [ ] Dues/assessments/invoices/receipts/offline payments, minor-unit ledger,
  allocations/reversals, ACH pending/return states, autopay consent/cancellation.
- [ ] Signed, account-validated durable webhooks with retry/out-of-order deduplication;
  gross/fee/refund/net reconciliation and sandbox tests.
- [ ] Recipient-level private cases/notices, evidence/internal notes separation,
  human approval, immutable issued copy, private replies, hearings/appeals/history.
- [ ] Distinct delivery attempts/provider delivery/views/acknowledgments/returned mail;
  manual postal tracking, optional PDF and approved jurisdictional rules.

## Self-service launch and release gates

- [ ] Custom-domain provider staging compatibility, exact DNS wizard, ownership/TLS
  state machine, renewal, canonical behavior, safe disconnect/tombstones/reverification.
- [ ] Entitlements, operational onboarding/domain/payment/subscription administration;
  distinct platform revenue and HOA payment volume.
- [ ] Private S3, secure uploads, least-privilege infrastructure, secret rotation,
  edge abuse prevention, monitoring/alerts, jobs/outbox and isolated environments.
- [x] Automated unit, real RLS/concurrency and local logical restore test coverage.
- [x] Complete browser and automated accessibility checks of implemented foundation screens.
- [ ] Full later-module acceptance cases: private recipient/occupant isolation,
  payment/webhook correctness, domain takeover, moderation appeal/essential-access
  separation, Halloween event publication/discussion/RSVP, audience ACLs, DST,
  occurrence changes, canceled reminders and capacity races.
- [ ] Production-equivalent backup/PITR recovery, approved retention/export/legal holds.
- [ ] Manual WCAG 2.2 AA and assistive-technology review; automated checks alone are insufficient.
- [ ] Independent security review, provider activation, legal/business policies and pilot.

## Later backlog and exclusions

Maintenance requests, architectural-change applications, amenity reservations,
vendors, budgets, accounting exports, informal surveys, volunteer/potluck signups,
secure revocable calendar subscriptions, and consent-based SMS are later work.
Formal elections, proxies, automated debt collection, liens, and legal-compliance
guarantees are outside the initial release.
