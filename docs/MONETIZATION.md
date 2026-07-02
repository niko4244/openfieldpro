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

## Tiers

| | Free ($0) | Pro (~$10/mo · $96/yr) | Business (~$29/mo · $290/yr) |
|---|---|---|---|
| Complete job-to-cash workflow | ✔ | ✔ | ✔ |
| Unlimited jobs, customers, techs | ✔ | ✔ | ✔ |
| Dispatch + GPS, mobile, automations | ✔ | ✔ | ✔ |
| Sponsor slot on dashboard | shown | removed | removed |
| "Powered by OpenFieldPro" on emails | shown | removed | removed |
| Premium plugins (QuickBooks, Zapier) | — | — | ✔ |

Never gate: user counts, job counts, or anything in the five HCP parity
buckets (core parity stays free — see the hcp-evaluator agent brief).
Optional: a Founder lifetime key (no `exp`, ~$249) for early supporters.

Issue tier keys with `--plan pro` or `--plan business`; annual
subscriptions are keys with `--exp`.

## What gates on `plan` today

- `orgs.plan` column (`free` | `pro` | `business`), migration `0017_org_plan.sql`;
  ranking helper `planAtLeast()` in `@ofp/shared`.
- Sponsor slot renders only on `free`.
- Email footer attribution ("Powered by OpenFieldPro") drops on `pro`+.
- Premium plugins (`REQUIRED_PLAN` map in `apps/api/src/routes/plugins.ts`:
  quickbooks, zapier → business) — install and enable return 402 below the
  required plan; the catalog exposes `requiredPlan`/`planSatisfied` and the
  Integrations UI shows a tier badge with an upgrade link.
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
