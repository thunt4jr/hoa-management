# Codex Build Prompt: Multi-Community HOA Management SaaS

This is the supplied product brief. Implementation status is tracked separately
in `implementation-checklist.md`; requirements here are not completion claims.

## 1. Objective and existing repository

Act as a senior full-stack engineer and SaaS architect. Build a production-oriented, subscription-based HOA management platform in the existing project directory. This is a platform for multiple independent communities, not a website hardcoded for one HOA.

Inspect the repository before changing anything: AGENTS.md, README.md, package manifests, lockfiles, source structure, infrastructure, environment examples, tests, and Git status. Preserve existing work, dependencies, naming, branch workflow, and uncommitted changes. Do not initialize a replacement application or perform an unrelated rewrite.

Use the established stack. If the directory is uninitialized, the preferred starting direction is TypeScript, Next.js, AWS hosting, Cognito/Amplify Auth, PostgreSQL, private S3 storage, and Stripe. Verify current supported versions and hosting capabilities before implementation. Do not introduce a second database or authentication system without documenting the reason. Evaluate Cloudflare for SaaS for custom domains, but validate its compatibility with the actual AWS origin, authentication flow, and deployment model before committing to that integration.

Document unresolved product choices as assumptions. Do not invent a platform name, real pricing, legal policies, credentials, or completed integrations. Make safe implementation progress without repeatedly asking for decisions that the repository already answers.

## 2. Product structure and business model

Provide three experiences: a public platform marketing and signup site; a platform-owner administration dashboard; and branded HOA workspaces with separate management and resident views.

Support independent HOAs and management companies responsible for multiple communities. One user can belong to multiple communities with different permissions. Include a community switcher and an explicitly authorized management portfolio view.

Keep the billing customer, management organization, legal HOA, property, and individual user as distinct concepts. A management company may pay software subscriptions for several HOAs without owning their financial accounts or merging their data. Allow management assignments and board leadership to change without recreating the HOA or losing its history.

Start with configurable monthly and annual per-community subscriptions. Support consolidated billing for a manager where practical. Keep plan prices, included homes, storage limits, and feature entitlements configurable. Do not silently bill residents for the software subscription.

Keep these revenue streams separate:

- Platform subscriptions paid to the platform by an HOA or its authorized management organization.
- Resident payments for HOA dues and assessments paid to the correct HOA through its connected payment account, with a disclosed platform application fee.

## 3. Community signup, duplicate prevention, and verification

Create a guided flow covering account creation, email verification, community registration, authority verification, plan selection, payment onboarding, branding, and resident invitations. Show clear pending and active states; unverified registrations must not collect money or impersonate an existing HOA.

Collect the community's legal and display names, physical location, country, state, postal code, association type, approximate property count, authorized representative, and separate mailing address. Collect additional association identifiers only when necessary and store sensitive identifiers securely.

Normalize addresses before comparison, preserving original input and meaningful building/unit distinctions. Match against canonical community-location records, legal names, and verified association identifiers where available. Do not use a management company's mailing address as the community's identity.

Block self-service creation when the same verified community address already exists. Offer a privacy-preserving request-access or claim-existing-community workflow, not another tenant. Flag near matches for review. Use database constraints and transactional reservation/creation to prevent two simultaneous registrations from creating duplicates. Expire unverified reservations so they cannot permanently block legitimate registration.

Provide an audited review path for genuinely separate associations sharing an address, including master and sub-associations. Require evidence and explicit platform approval before an exception. Never allow ordinary users to bypass duplicate checks.

Verify a registrant's authority using approved evidence or existing administrator approval. Knowing an address or controlling a similarly named domain is insufficient to receive board access. Provide an accountable ownership-transfer and disputed-claim process without disclosing resident data to claimants.

## 4. Authorization and tenant isolation

Support platform administrator, management-organization administrator, community administrator, board member, treasurer, moderator, homeowner, and tenant/resident roles. Make permissions explicit and community-scoped rather than assuming every board member can perform every sensitive action.

Use server-enforced, deny-by-default authorization for every API, server action, export, file access, notification, background job, and real-time subscription. Require both community membership and permission for the specific resource. A domain or client-supplied community ID must never grant access.

Isolate community data in database relationships, storage paths, caches, search indexes, logs, and queues. For PostgreSQL shared tables, implement and test row-level security using a non-bypass application role and transaction-scoped tenant context. Scope foreign keys to prevent cross-community relationships. Tenant isolation does not replace recipient-level permissions inside the same HOA.

Require MFA for privileged users. Audit role changes and sensitive access. Give platform support no routine access to private resident correspondence; any exceptional access must be explicitly authorized, time-limited, and recorded.

## 5. Properties, residents, and board membership

Model properties separately from people. Support multiple owners, an owner with several properties, renters, nonresident owners, and date-bounded relationships between people and properties.

Implement expiring, single-use invitations, email verification, approval-based access requests, move-in/move-out workflows, and CSV import with preview, validation, duplicate detection, and error reporting. Users must not assign themselves privileged roles.

A new owner or renter must not automatically inherit a previous occupant's private correspondence. Revoke obsolete memberships and privileges promptly while retaining records according to the approved retention policy.

Provide board profiles, positions, term dates, responsibilities, and contact preferences. Support leadership handover without transferring personal credentials. A resident directory should be opt-in with restricted visibility, not a public contact list.

## 6. Community website, documents, and meetings

Give each HOA its own logo, colors, community details, contact information, navigation, and configurable public homepage. Do not publish resident records by default.

Provide announcements, events, meeting calendars, agendas, approved minutes, governing documents, policies, forms, and board-member updates. Support drafts, approval, scheduling, version history, search, and archiving.

Classify content as public, community-member, authorized-board, or explicitly restricted. Keep executive-session materials separate from ordinary meeting minutes. A label alone must not control access; enforce the corresponding permissions server-side.

Meetings should include timezone-aware dates, location or virtual meeting information, agendas, attachments, reminders, and minutes. Preserve previous document versions and record who approved publication.

Provide in-app and email notifications with preferences, delivery status, and bounce handling. Avoid sending sensitive case details in notification subjects or previews. Do not claim an email delivery event proves legal service or that a resident read the contents.

### 6.1. Community events, event posts, and attendance

Implement a complete community events module, not just a calendar embedded on the website. Support HOA meetings, annual member meetings, resident gatherings, block parties, Halloween parties, cleanup days, and other community activities. Distinguish official HOA meetings from social events while using a shared event/calendar foundation. Link meeting records, agendas, and minutes to the associated event rather than maintaining conflicting copies of dates and locations.

**Event creation and publishing:** Let authorized administrators and designated organizers create, edit, approve, publish, reschedule, cancel, and archive events. Support draft, pending-review, published, canceled, and archived states. Communities may optionally allow resident-submitted events that require administrator approval before publication. Restrict official HOA meeting publication to authorized roles. Record who changed an event and when.

**Dedicated event pages:** Include a title, description, category, organizer/contact preference, cover image or flyer, start/end date and time, community timezone, location/address or virtual meeting information, attachments, and applicable attendance instructions. Support all-day and recurring events, recurrence end dates, and edits or cancellations affecting either one occurrence or the whole series. Store event identity and recurrence consistently; preserve intended local times across daylight-saving changes. For block parties, support optional maps, affected streets, parking/access instructions, and organizer-provided closure times. Publishing an event must not imply permission to close a street.

**Discovery and announcements:** Provide a mobile-friendly calendar, an upcoming-events list, and dashboard event cards with category and date filters. Let organizers announce an event in the community feed and pin important upcoming events. Feed announcements should link to the canonical event page and reflect updated event details instead of becoming stale duplicate records. Keep past events available in an archive according to retention and access policies. Show events on the public HOA homepage only when an authorized administrator explicitly publishes an approved public version.

**Posts inside each event:** Give every event its own organizer updates and resident discussion thread. Allow eligible residents to ask questions, reply, and coordinate activities without mixing those comments into unrelated discussions. Clearly distinguish organizer announcements from resident replies. Apply the existing civil-conduct rules, reporting, rate limits, moderation queue, and appeal process to event posts and attachments. Let organizers disable or close comments without removing event details, RSVP access, or essential meeting materials.

**RSVPs and coordination:** Support Going, Maybe, and Not Going responses, plus optional guest counts, RSVP deadlines, capacity limits, and waitlists for suitable social events. Make signup optional and configurable per event. Prevent duplicate responses and capacity overbooking under concurrent requests. Keep attendee identities and guest details private to authorized organizers by default; ordinary attendees should see only approved aggregate attendance information. Do not collect children's names merely to count guests. Do not impose social-event capacity or RSVP rules on official meetings in a way that blocks otherwise entitled members. An RSVP is not evidence of actual attendance, quorum, a vote, or proxy authorization. Keep volunteer and potluck signup sheets as optional later enhancements rather than blocking core event delivery.

**Reminders and changes:** Provide in-app and email notifications for newly published events, organizer updates, reminders, material schedule/location changes, and cancellations. Make reminder timing and eligible audiences configurable, and respect preferences and required-notice policies. When an event changes or is canceled, update pending reminders so obsolete notices are not sent. Use background jobs with idempotency and delivery tracking to avoid duplicate sends. Recheck recipient authorization immediately before delivery. Sensitive events must use generic notifications with authenticated links. Do not represent event reminders as a substitute for any required formal meeting-notice process. Keep SMS outside the initial scope unless a consent-based provider integration is explicitly added.

**Calendar export and privacy:** Provide Add to Calendar and downloadable calendar files for supported calendar clients. Protect private event exports with the same authorization as the event and avoid embedding private attachments or attendee lists. Explain that a downloaded event is a snapshot and might not automatically receive subsequent changes; cancellation and rescheduling notifications remain necessary. Keep revocable calendar subscription feeds as a later enhancement unless securely implemented and tested.

**Visibility and authorization:** Default events to community-member visibility. Allow explicit public, community-member, authorized-board, and invitation-only audiences where permitted by the community's governance rules. Restrict publication of sensitive meeting details. Invitation-only event membership must not grant general access to an HOA workspace. Require authorization for event pages, previews, search results, attachments, RSVP data, posts, exports, and notifications. Public event pages must not expose resident identities, private discussions, sensitive meeting links, or restricted files. Do not expose one community's events in another community's calendar unless an explicitly authorized portfolio view is requested.

## 7. Community discussions and civil moderation

Provide private, community-only discussion boards with categories, threads, comments, pinned announcements, reporting, mute controls, and moderator queues. Community administrators should be able to disable discussions without disabling essential management functions.

Publish clear conduct rules covering harassment, threats, personal attacks, discriminatory abuse, spam, and exposure of private information. Allow disagreement and criticism of HOA leadership. Do not equate criticism, negative sentiment, or a complaint with misconduct.

Implement rate limiting, spam controls, reporting, warnings, temporary posting restrictions, moderator decisions, and an appeal process. Preserve an auditable moderation history with restricted access to removed content.

Optional AI moderation may flag content or suggest a more respectful rewrite, but it must not silently rewrite posts, autonomously impose fines, or make final high-impact decisions. Keep human review available. Make third-party AI processing configurable, minimize submitted data, and document it before enabling it.

Posting restrictions must not automatically remove access to payments, official records, private notices, or appeals. Do not promise that software can guarantee all conversations remain civil.

## 8. Private notices and violation management

Implement a dedicated private correspondence and case-management module, separate from the discussion feed.

Authorized staff must be able to send a notice to a specific person or approved recipient set. Access must be limited to those recipients and specifically authorized staff. Do not automatically expose notices to every household member, renter, board member, moderator, or future property owner.

Support a reference number, property, alleged violation, applicable rule, dates, evidence, staff-only notes, requested corrective action, response deadline, hearing/appeal information, assigned staff, and status history. Separate resident-visible messages from internal notes.

Support draft, review, approved, issued, responded, resolved, appealed, and closed states as appropriate. Require human approval before issuing enforcement notices or creating a fine. Maintain an immutable copy of the issued notice and its recipients, with separately logged corrections and follow-up correspondence.

Provide a secure portal inbox, private replies, optional printable/PDF letters, and generic email alerts linking to an authenticated view. Use private attachments and short-lived authorized file access. Keep sensitive content out of public search, shared caches, analytics, email previews, and community feeds.

Record attempted delivery, provider-reported delivery, portal views, explicit acknowledgments, and returned mail as different events. Allow manual recording of postal or certified-mail tracking; do not pretend a postal integration exists unless implemented.

Make notice periods, electronic-delivery consent, hearings, fines, retention, and required recipients jurisdiction-configurable and subject to legal review. Do not label templates legally compliant by default. Restricted portal access is not a guarantee of legal privilege or protection against recipient screenshots, forwarding, lawful record requests, or compelled disclosure.

## 9. Platform subscriptions and HOA payments

Use Stripe Billing for the platform's SaaS subscriptions and Stripe Connect for HOA collections, unless the existing repository has an established equivalent that meets these requirements. Use current supported APIs and account configuration rather than copying deprecated examples.

Represent each legally distinct HOA receiving funds with its appropriate verified connected account and payout details. Prefer provider-hosted or embedded onboarding so identity verification and bank information are collected through supported provider flows. Do not activate collection until required capabilities are available.

Evaluate direct charges with application fees as the starting model for resident-to-HOA payments. Document the selected charge type, merchant relationship, processing-fee payer, refund behavior, dispute handling, negative-balance responsibility, and platform obligations before enabling live payments. Do not pool all HOA dues into the platform's ordinary operating account.

Make the platform fee configurable by an authorized platform administrator, with an effective date, versioned terms, clear disclosure, and consent. Support an approved percentage or fixed-fee structure without hardcoding an invented rate. Start with an HOA-paid fee deducted from proceeds. Do not add a resident-facing surcharge without separate authorization and compliance review.

Provide dues schedules, one-time assessments, invoices, receipts, balances, payment history, reminders, and authorized recording of offline payments. Support cards and eligible ACH payments, with explicit autopay consent and cancellation. Distinguish pending, succeeded, failed, returned, refunded, and disputed payments.

Credit a resident's payment correctly against the obligation. Track processing and platform fees separately from HOA income and resident balances. Use integer minor units for money and immutable accounting entries with reversals for corrections. Reconcile gross payments, fees, refunds, and net settlements. Do not claim to provide a complete accounting system unless that scope is actually implemented.

Use server-calculated amounts, signed webhooks, account-to-community validation, idempotency, and durable processing. Handle duplicate and out-of-order events without duplicate ledger entries, notices, or charges. Never treat the browser success redirect as authoritative payment confirmation.

Provide subscription lifecycle handling, invoice history, plan changes, failed-payment notifications, grace periods, cancellation, and data export. A subscription lapse must not immediately delete records or prevent authorized handling of existing payments, refunds, or disputes. Clearly define any read-only mode and legally required access.

## 10. Subdomains and self-service custom domains

Provision a unique default address such as pinegrove.example.com for every approved community. Use verified wildcard routing where supported. Reserve platform/system subdomains and prevent hostname collisions.

Allow an authorized community administrator to connect a custom hostname, such as portal.community.example, through a self-service wizard. Support root domains only where the selected provider and plan genuinely support them, with documented limitations and cost implications.

The wizard must generate the exact DNS records, explain ownership verification, show provisioning status, validate DNS and TLS readiness, and activate the mapping only when all checks pass. Include pending, verified, certificate-pending, active, failed, and disconnected states with actionable retry instructions.

Automate changes only where the customer has explicitly authorized access to a supported DNS provider. Otherwise show copyable records and automatic verification. Do not promise to change arbitrary registrar DNS without access. Do not require a domain transfer. Never overwrite unrelated MX, SPF, DKIM, DMARC, or other DNS records.

Implement certificate renewal/status checks, canonical hostname behavior, safe disconnects, and re-verification before any reassignment. Prevent custom-domain takeover and unsafe reuse of abandoned mappings. Keep the platform subdomain available according to the canonical-domain policy.

Validate the AWS origin integration, TLS/SNI, host-header behavior, quotas, and trusted tenant-host propagation. Reject unrecognized hosts and spoofed forwarding headers. Never rely on a user-supplied header as trusted tenant identity.

Design supported authentication across platform and custom domains with validated callback/return URLs, CSRF protection, and appropriately scoped cookies. Do not share sessions by broadly exposing cookies or inventing an unaudited token exchange.

## 11. Administration, operations, and user experience

Provide platform views for subscriptions, platform revenue, onboarding failures, duplicate/ownership claims, domain health, payment onboarding status, and operational alerts. Keep cross-community visibility permission-controlled. Present platform revenue separately from HOA payment volume.

Provide community views for membership, outstanding assessments, upcoming meetings and events, documents, discussions, and private cases according to role. Provide a simpler resident dashboard showing only that person's permitted balances, notices, documents, upcoming events, RSVPs, and community updates.

Use a responsive, professional interface with clear community identity, accessible navigation, keyboard operation, labeled forms, visible focus, readable contrast, useful empty states, and actionable errors. Target WCAG 2.2 AA and test the implemented screens. Do not rely on audio or color alone for important information.

Add structured, privacy-conscious logs, monitoring, alerting, backups, and a tested restore procedure. Use least-privilege credentials, secure secret storage, input validation, upload validation/malware controls, rate limits, and dependency checks. Set explicit retention, export, legal-hold, and deletion procedures. Do not erase required financial or governance records merely because a user requests account deletion.

Use background jobs with retries and idempotency for notifications, event reminders and change/cancellation delivery, scheduled assessments, imports, and provisioning. Keep development, staging, and production isolated. Provide infrastructure and deployment instructions appropriate to the actual hosting setup, including rollback and database migration handling.

## 12. Data model and maintainability

Design migrations and relationships for organizations, communities, management assignments, users, memberships, properties, occupancy/ownership history, board terms, invitations, documents/versions, meetings, events, event series/occurrence exceptions, event organizers, event audiences/invitations, event posts/comments, RSVPs/guest counts, waitlist entries, event reminder schedules, announcements, discussion threads, moderation actions, private cases, notice recipients, assessments, invoices, payment allocations, ledger entries, subscriptions, connected accounts, domains, notifications, webhook events, and audit events.

Implement only entities needed by the current phase, but preserve the separation between community identity, billing ownership, and legal fund recipients. Add indexes and uniqueness constraints for actual query and integrity requirements.

Use clear modules for identity/authorization, communities, governance, events/calendars, communications, violations, billing/payments, domains, and integrations. Prefer a maintainable modular application over unnecessary microservices. Keep business rules server-side and expose only validated interfaces.

## 13. Scope and implementation phases

Treat all sections above as the core product scope, delivered incrementally:

1. Foundation: repository assessment, architecture, authentication, permission matrix, community registration/verification, duplicate protection, community switching, tenant-isolation tests, and default subdomain routing.
2. Community operations: properties, invitations, membership history, board management, documents, meetings, event calendars and pages, organizer updates/event discussions, RSVPs, event reminders, calendar exports, announcements, and basic moderation.
3. Money and confidential workflows: platform subscriptions, verified connected accounts, dues and assessments, reconciliation, private notices, approval, responses, and audit trails.
4. Self-service launch: custom domains, DNS/TLS lifecycle, subscription entitlements, operational administration, accessibility, recovery testing, and security hardening.

Keep maintenance requests, architectural-change applications, amenity reservations, vendor management, budgets, accounting exports, and informal surveys in a clearly labeled later backlog. Formal elections, proxies, automated debt collection, liens, and legal-compliance guarantees are out of the initial release.

Do not create a large collection of nonfunctional screens and call it complete. Complete and verify working vertical slices. Test integrations in sandbox mode before live activation. Where credentials or provider access are missing, use development-only adapters and document the exact blocker; never report a mock as a live integration.

## 14. Acceptance tests and release gates

Create automated tests demonstrating that:

- Users cannot access another community's data through guessed IDs, hostnames, search, exports, file links, jobs, caches, or real-time channels.
- Residents in the same community cannot access another person's private notices, payment details, or restricted attachments.
- Duplicate and simultaneous registrations are blocked, and only audited approval permits a legitimate shared-address exception.
- New board members can receive verified authority without recreating the HOA; revoked users lose privileges; new occupants do not inherit prior occupants' private correspondence.
- Resident payments use the correct HOA account and configured platform fee. Duplicate webhooks do not duplicate accounting effects. Pending or returned ACH payments are not treated as final success.
- Invalid/unverified custom domains cannot serve a tenant or capture an authentication callback. Removed mappings cannot be reclaimed without fresh verification.
- Moderation actions preserve an appeal trail and do not unintentionally disable essential records, payment, or notice access.
- An authorized organizer can publish a Halloween party, announce it to the correct community, receive RSVPs, and post updates. Eligible residents can find the event, RSVP, and discuss it inside its event page.
- Draft, board-only, and invitation-only events and their discussions, RSVP identities, attachments, and exports remain inaccessible to unauthorized users, including through feed previews and notifications. Resident submissions cannot bypass approval, and removed members cannot receive future private event messages.
- Recurring meetings retain their intended local times across daylight-saving changes. Single-occurrence edits do not inadvertently change the whole series, and canceled occurrences do not send obsolete reminders.
- Rescheduled/canceled events update calendar views and feed cards and notify eligible recipients without duplicate messages. RSVP retries and concurrent capacity checks do not create duplicate attendance entries or overbook social events.
- Key signup, manager, treasurer, resident, payment, notice, event-publishing, RSVP, and event-discussion workflows pass end-to-end tests. Database migrations, build, lint, type checks, backups, and restore procedures are verified or explicitly reported as unverified.

A production launch requires a documented security review, payment-provider activation, approved business/legal policies, successful recovery testing, and a pilot with test or authorized community data. Do not claim production readiness based only on a successful build.

## 15. Documentation and first task

Create or update project-specific README.md, .env.example, a concise AGENTS.md, architecture documentation, the authorization matrix, payment-flow documentation, domain-onboarding documentation, event publishing/moderation/notification documentation, deployment instructions, and an implementation checklist. Keep this full product brief in a dedicated document rather than bloating AGENTS.md.

Keep documentation aligned with actual setup, scripts, environment variables, routes, APIs, integrations, deployment, features, and known limitations. Never include secrets. If GitHub Releases are used, document versioning, tags, publishing, and changelog conventions. Include a Team section only when real team names, roles, and responsibilities are provided.

Respect the existing branch workflow. Avoid unrelated edits, destructive Git commands, unsolicited commits, or production deployment. Add comments only for non-obvious decisions and complex logic. Include a suggested Git commit message with every implementation summary.

Start now by inspecting the existing directory, identifying the current stack and gaps, recording the architecture and assumptions, and implementing the first secure foundation slice.

At the end of this working session, report the files changed, commands/tests actually run, results, unresolved external setup, remaining scope, and a suggested commit message. Do not stop after presenting only a plan.
