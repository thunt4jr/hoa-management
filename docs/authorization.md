# Authorization matrix

All permissions require current verified identity. Community permissions also
require an active, date-valid, non-revoked membership in the selected community.
Privileged roles and organization/platform administration require verified MFA.
RLS and server services enforce the same matrix. No client or hostname can select
a role. The runtime cannot directly insert or update memberships.

| Role | Community identity | Manage members | Board records | Publish governance | Finance | Organize events | Moderate | Manage private notices |
|---|---|---|---|---|---|---|---|---|
| Community administrator | Yes | Yes | Yes | Yes | No | Yes | Yes | No |
| Board member | Yes | No | Yes | No | No | Yes | No | No |
| Treasurer | Yes | No | Yes | No | Yes | No | No | No |
| Moderator | Yes | No | No | No | No | No | Yes | No |
| Homeowner | Yes | No | No | No | No | No | No | No |
| Tenant/resident | Yes | No | No | No | No | No | No | No |

Only identity access and member revocation have resource routes in this slice.
Other permission names reserve explicit boundaries; they do not imply implemented
finance, event, document, discussion, or notice modules. No current role receives
`notices.manage`; define specifically authorized staff and recipient ACLs when
private cases are implemented. Board title and moderation rights confer no private
correspondence rights. Finance remains treasurer-scoped, including for community
administrators until an explicit reviewed grant system is added.

Platform administrators review registration/authority claims with MFA and cannot
approve their own submissions. They do not receive community permissions from
their platform role. No exceptional resident-content support access exists yet.

Organization administrators require a current organization membership, MFA, an
active dated assignment, and `allow_portfolio=true` for each portfolio item. This
permits only a community-name summary. It does not grant tenant resource access.

Revocation requires `members.manage`, a reason, and a scoped membership ID. It
is transactional and audited. The last active community administrator cannot be
revoked before a verified successor exists. A complete grant/leadership handover
workflow is not implemented; do not edit roles through an ordinary client.

Future tenant-to-tenant references must use composite keys including community ID.
Private correspondence and attachments must additionally authorize exact people,
not households, properties, or the next occupant. Posting restrictions must be
separate from membership, finance, essential records, notices, and appeals.
