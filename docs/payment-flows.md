# Payment design: not implemented or activated

No Stripe SDK, Checkout endpoint, payment webhook, plan price, fee, subscription,
ledger, or resident collection account exists in this slice. These are phase 3
release blockers. Community approval cannot activate collection.

## Platform subscriptions

Use Stripe Billing with configurable monthly/annual per-community prices. The
billing customer can be an HOA or an authorized management organization. Store
community identity, subscription owner, and manager assignments independently.
Consolidated invoices must allocate each billed community and its entitlements.
Residents are not software subscription customers by default.

## Resident dues

The starting design is a direct charge created on the verified HOA connected
account, with a versioned, disclosed HOA-paid application fee deducted from
proceeds. Do not use the platform operating account to pool association funds.
The legally distinct HOA is the intended merchant/fund recipient; provider
agreements and business/legal review must approve that relationship before live use.
See [Stripe direct charges](https://docs.stripe.com/connect/direct-charges).

The connected-account controller configuration determines processing-fee payer,
dispute responsibilities, and negative-balance liability. The proposed starting
configuration has Stripe collecting processing fees from the HOA. Do not assume
that direct charges eliminate platform liability: loss allocation and dashboard
responsibilities must be confirmed for the selected account configuration.
[Stripe documents connected-account refund/dispute considerations](https://support.stripe.com/questions/what-should-i-know-about-using-direct-charges).

Refunds should reverse the matching obligation allocation and gross ledger
entries. Application-fee refunds must be an explicit policy and provider action,
tracked separately from resident principal and processing costs. No refund,
dispute, or fee policy is approved here. Never silently add a resident surcharge.

## Required sandbox slice

1. Configure provider-hosted onboarding and account-to-community mapping; wait for
   required collection and payout capabilities. Store no bank/KYC documents locally.
2. Model assessments, invoices, allocations, pending payment attempts, connected
   accounts, fee terms/consents, immutable minor-unit ledger entries, and reversals.
3. Compute collectible amounts and the effective authorized platform fee on the
   server. Show the disclosure and separate subscription charges.
4. Verify webhook signatures over raw request bytes and the connected-account ID.
   Persist provider event IDs and process transactionally with idempotency and
   out-of-order state handling. Redirect success is never payment confirmation.
5. Treat ACH processing as pending and returns as reversals. Track succeeded,
   failed, returned, refunded, and disputed states distinctly. Require explicit
   autopay consent and cancellation.
6. Reconcile gross payments, provider/application fees, refunds, and net settlements.
   Test duplicate webhooks, retries, wrong-account events, refunds, and disputes.
7. Define grace/read-only behavior on subscription lapse while preserving authorized
   exports, legally required records, existing payments, refunds, and disputes.

Required external decisions: Stripe account/controller model and API version,
provider activation, fee policy and effective terms, approved pricing and taxes,
refund/dispute responsibilities, and business/legal policies. This is not a
complete accounting system or an approved payment design.
