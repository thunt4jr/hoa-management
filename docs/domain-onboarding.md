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
requires validating DNS, origin Host/SNI, and plan-specific settings. The selected
AWS origin is now Amplify Hosting with a custom Node compute bundle.
There is no owned wildcard domain, Cloudflare zone or customer DNS authorization
configured. The generated development amplifyapp.com hostname does not provide
arbitrary child subdomains. Cloudflare remains a candidate, with no SDK, wizard,
active mapping or claim of compatible origin behavior.

Before implementation, prove this path in an isolated staging environment:

1. Validate Amplify's custom-domain quotas, wildcard coverage, origin TLS/SNI,
   Host preservation and canonical routing. An edge provider must not forward
   unvalidated host metadata into tenant selection. The current app ignores it.
2. Establish authenticated edge-to-origin trust if any propagation header is
   required. Strip caller copies and prevent bypass. If the actual deployment
   cannot satisfy this, select a different documented origin integration.
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
