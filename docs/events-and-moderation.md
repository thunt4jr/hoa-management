# Events, publishing, moderation, and delivery

This is the phase 2 implementation contract. There is no event, RSVP, discussion,
calendar export, reminder job, or email delivery integration in the foundation.
Do not interpret the `events.organize` permission as a delivered events module.

Use one canonical timezone-aware event and location record for official meetings
and social events; meeting records reference it. Separate series identity, local
recurrence/timezone, occurrences, and single-occurrence exceptions. Preserve local
wall time through DST and require explicit single-occurrence versus whole-series
edits. Store drafts, pending review, published, canceled, and archived states.
Only approved publishers may publish official meetings. Resident proposals require
review. Record organizers, edits, approvals, explicit public versions, and archives.

Event pages need description, category, organizer contact preferences, covers,
attachments, dates/timezone, location/virtual link, and attendance instructions.
Block-party access/parking/closure notes are information supplied by organizers;
publishing does not grant permission to close a street. Calendar, upcoming list,
dashboard, and feed cards reference the event so edits remain consistent.

Default audiences are community members. Board and invitation-only audiences
require resource-level checks for previews, posts, attachments, exports, search,
RSVP data, and notifications. Invitations to one event do not grant workspace access.
Public versions omit sensitive meeting links, attendee identities, private threads,
and restricted attachments. Never share calendars across tenants without explicit
portfolio authorization.

Each event owns organizer updates and resident posts/replies. Distinguish them
visually and in authorization. Closed comments preserve event details, RSVP, and
essential meeting materials. Conduct rules cover harassment, threats, personal
attacks, discriminatory abuse, spam, and exposing private information. Criticism
of leadership and complaints are not misconduct. Implement reports, rate limits,
warnings, posting restrictions, human moderation decisions, removed-content ACLs,
and appeals. A posting restriction does not revoke essential membership access.
AI processing is off unless explicitly configured, disclosed, and minimized; it
cannot silently rewrite posts, impose fines, or make final high-impact decisions.

Going/Maybe/Not Going responses are unique per eligible member and occurrence.
Optional guest counts collect no children's names. Social capacities, deadlines,
and waitlists require row locks/transactional counters and idempotent retries.
Organizers see authorized identities; attendees see approved aggregate counts.
Do not let social RSVP limits exclude entitled members from official meetings.
RSVPs do not prove attendance, quorum, votes, or proxies.

Use a PostgreSQL outbox and idempotent retrying jobs for publication, organizer
updates, reminders, material changes, and cancellations. Schedule jobs against
event revision and occurrence identity. A reschedule/cancellation invalidates
older jobs transactionally. Recheck audience, current membership, preferences,
and required-notice policy immediately before each send. Track attempts, accepted
delivery, bounces, views, and acknowledgments separately. Sensitive alerts use
generic subjects/previews and authenticated links. Provider delivery does not
prove legal service or reading. Reminders do not replace formal meeting notice.

Authorized `.ics` downloads include allowed event details only, without private
files or attendees. Explain that downloads are snapshots and subsequent changes
need notifications. Secure revocable subscriptions, SMS, volunteer and potluck
signups are later enhancements.

Required tests: Halloween publication and feed linkage; eligible discussion/RSVP;
draft/board/invitation isolation; no publication bypass; revoked-member delivery
denial; capacity races and retry deduplication; DST recurrence; occurrence edits;
canceled jobs; changed feed/calendar details; private export and attachment ACLs.
