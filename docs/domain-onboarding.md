# Default routing and future custom domains

Approved communities receive a unique reserved-safe slug. Runtime routing accepts
`<slug>.<COMMUNITY_BASE_DOMAIN>` only on the configured origin port, looks up an
active community, and serves a minimal public identity page. Creating the row does
not create DNS or certificates. Configure wildcard DNS and TLS outside this app.
Use `sample-courtyard.localhost:3000` locally; no registrar access is assumed.

Authenticated routes and Cognito callbacks run only at `PLATFORM_ORIGIN`. Cookies
are host-only. The public community page links to that central origin. No
cross-domain cookie, unaudited token exchange, or arbitrary return URL is used.
Changing Host never grants membership. Unknown/custom domains cannot serve an HOA
or capture a callback, and forwarded host headers do not select communities.

## Cloudflare for SaaS evaluation

Cloudflare supports [custom hostnames and a fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/).
Its [custom-origin behavior](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/custom-origin/)
requires validating DNS, origin Host/SNI, and plan-specific settings. The proposed
AWS origin is ALB/ECS, not Amplify Hosting. There is no provisioned ALB, Cloudflare
zone, or customer DNS access to verify compatibility. The provider is therefore a
candidate; there is no Cloudflare SDK, wizard, API call, active mapping, or claim
of completed integration.

Before implementation, prove this path in staging:

1. Create a controlled fallback hostname and TLS certificate on the ALB. Use
   Full (strict), preserve validated customer Host, and verify TLS SNI selection.
   [ALB host preservation is configurable](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html).
2. Restrict origin access so a public caller cannot bypass the trusted edge. If
   metadata headers are required, strip caller copies at the edge and authenticate
   the edge-to-origin transport before accepting them. Do not trust arbitrary headers.
3. Validate provider quota, plan, certificate renewal, failure/retry behavior, and
   apex support/cost. Default to a customer subdomain CNAME; never promise apex
   support or registrar edits without verified capability and explicit authority.
4. Implement a mapping state machine: pending, verified, certificate-pending,
   active, failed, disconnected. Require exact ownership challenge, provider active
   state, DNS target, and TLS checks before routing. Keep hostname uniqueness global.
5. Generate provider-returned DNS records exactly. Copy/verify records unless a
   supported DNS account is authorized. Never overwrite MX or email authentication.
6. On disconnect, stop tenant routing first, remove the provider mapping, retain a
   takeover-prevention tombstone, and require a new ownership challenge before reuse.
7. Keep sign-in central, with fixed callbacks and allowlisted returns. Any future
   authenticated customer-domain experience needs its own reviewed session design.

Certificate status polling, automated provisioning jobs, canonical redirects, and
domain reassignment tests are phase 4 work. No custom-host data is accepted now.
