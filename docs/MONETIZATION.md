# OpenFieldPro — open-source & monetization model

Decided 2026-07-02. OpenFieldPro stays fully open source; revenue comes from
optional Pro licenses, with zero infrastructure to operate.

## The model

- **License: AGPL-3.0** (`LICENSE` at repo root). Anyone can self-host free.
  Anyone who offers a modified OpenFieldPro as a hosted service must publish
  their changes. As copyright holder you can still sell licenses/exceptions.
- **Free tier** — the complete product, self-hosted, with one honest,
  non-tracking **sponsor slot** on the dashboard
  (`apps/web/components/sponsor-slot.tsx`). No ad networks, no telemetry.
- **Pro** — an **offline-signed license key** removes the sponsor slot and
  unlocks extended features. Verification is local (Ed25519 signature against
  a public key baked into `apps/api/src/lib/license.ts`); there is **no
  license server and no phone-home**. Hands-off by design.

## Selling keys (no hosting required)

1. Create a payment link (Stripe Payment Links, Polar, Gumroad, GitHub
   Sponsors tiers — all zero-ops).
2. On purchase, issue a key:
   `cd apps/api && npx tsx scripts/make-license-key.ts --note "buyer@email"`
   (add `--exp 2027-07-01` for subscription-style annual keys).
3. Send the key to the buyer. They paste it in **Settings → General → Plan**.

The signing **private key** lives at `~/.ofp/license-signing-key.pem` —
back it up; never commit it. The public key in the repo is not a secret.

## What gates on `plan` today

- `orgs.plan` column (`free` | `pro`), migration `0017_org_plan.sql`.
- Sponsor slot renders only on `free`.
- Redemption: `POST /api/org/license` → verifies key → flips plan.
  Checks: `apps/api/test/license.test.ts`.

## Where future Pro features go

Prefer shipping extended features as **first-party plugins** (the Phase E
plugin portal): the core app stays complete and AGPL, premium value lands as
plugins whose enablement can check `plan === "pro"`. Candidates: advanced
reporting exports, QuickBooks sync, SMS automation bundles, multi-location.

ponytail: keys are not org-bound (one key activates any install) — the
honesty-box model. Ceiling: piracy at scale. Upgrade: embed orgId in the
payload at purchase and compare at redemption.
