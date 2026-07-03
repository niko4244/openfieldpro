# OpenFieldPro — open-source & monetization model

Decided 2026-07-02. OpenFieldPro stays fully open source; revenue comes from
optional licenses, with zero infrastructure to operate. The free product is
complete, trustworthy, and production-usable — Pro is polish, never
crippleware.

## The model

- **License: AGPL-3.0** (`LICENSE` at repo root). Anyone can self-host free.
  Anyone who offers a modified OpenFieldPro as a hosted service must publish
  their changes. As copyright holder you can still sell licenses/exceptions
  ([COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md)).
- **Free tier** — the complete product, self-hosted, with one honest,
  non-tracking **sponsor slot** on the dashboard
  ([SPONSOR_SLOT.md](SPONSOR_SLOT.md)). No ad networks, no telemetry.
- **Paid tiers** — an **offline-signed license key** removes the sponsor
  slot and unlocks premium polish. Verification is local (Ed25519 signature
  against a public key baked into `apps/api/src/lib/license.ts`); there is
  **no license server and no phone-home**. Hands-off by design.
  Mechanics: [LICENSES.md](LICENSES.md).

## Never charge for / never add

Per-technician pricing · per-user pricing · per-job pricing · per-customer
pricing · telemetry · phone-home · a license server · any dependence on
OpenFieldPro infrastructure. Core HCP parity stays free forever.

## Tiers

| | Free ($0) | Pro (~$10/mo · $96/yr) | **Founder ($249 once)** | Business (~$29/mo · $290/yr) |
|---|---|---|---|---|
| Complete job-to-cash workflow | ✔ | ✔ | ✔ | ✔ |
| Unlimited jobs, customers, techs | ✔ | ✔ | ✔ | ✔ |
| Dispatch + GPS, mobile, automations | ✔ | ✔ | ✔ | ✔ |
| Sponsor slot on dashboard | shown | removed | removed | removed |
| Branding, themes, advanced exports/analytics, packs | — | ✔ | ✔ | ✔ |
| Premium plugins (pro-tier) | — | ✔ | ✔ | ✔ |
| Business connectors (QuickBooks, Zapier, ERP/API) | — | — | — | ✔ |
| Term | forever | annual | **lifetime** | annual |

**Founder's License — lifetime Pro access for early supporters.** The
first-customer offer: everything Pro has, never expires, displays as
*Founder* in the UI. Same offline key system (a key with no `exp`).

**Business** is placeholder-plus: the tier, `businessIntegrations` feature
flag, and QuickBooks/Zapier plugin gates exist; deeper connectors land later.

Full feature matrix: [PRO_FEATURES.md](PRO_FEATURES.md).

## Selling keys (no hosting required)

1. Create a payment link — Stripe Payment Links, Polar, Gumroad, GitHub
   Sponsors tiers, or a manual invoice. All zero-ops; the app itself needs
   no payment-provider integration.
2. On purchase, issue a key from the repo root:

   ```bash
   pnpm license:generate --tier pro --name "Acme HVAC" --email owner@acme.example --expires 2027-07-01
   pnpm license:generate --tier founder --name "Early Supporter" --email owner@acme.example --lifetime
   pnpm license:generate --tier business --name "BigCo" --expires 2027-07-01 --json  # JSON for records
   pnpm license:verify  --key "OFP1...."   # sanity-check before sending
   ```

3. Send the key. The buyer pastes it in **Settings → General → Plan &
   License**; their server verifies it locally, forever. No phone-home.

The signing **private key** lives at `~/.ofp/license-signing-key.pem`
(created on first run) — back it up; never commit it. The public key in the
repo is not a secret.

## What gates on the plan today

- `orgs.plan` + `orgs.license_key` columns (migrations `0017`, `0018`).
  Entitlement is **re-verified from the stored key on every read**
  (`resolvePlan` in `apps/api/src/lib/license.ts`), so lapsed annual keys
  fall back to Free locally — data untouched.
- Central flags: `featuresForPlan()` in `packages/shared/src/features.ts`;
  ranking helper `planAtLeast()` (`free < pro < founder < business`).
- Sponsor slot renders only on `free` (web + mobile).
- Email footer attribution ("Powered by OpenFieldPro") drops on `pro`+.
- Premium plugins (`REQUIRED_PLAN` map in `apps/api/src/routes/plugins.ts`) —
  install/enable return 402 below the required plan; the catalog exposes
  `requiredPlan`/`planSatisfied` and the Integrations UI shows a tier badge.
- Redemption: `POST /api/org/license` verifies + stores the key;
  `DELETE /api/org/license` reverts to Free.
  Checks: `apps/api/test/license.test.ts`, `apps/api/test/features.test.ts`.

## Where future Pro features go

Prefer shipping extended features as **first-party plugins** (plugin portal)
or **packs** (`packages/shared/src/packs.ts`): the core app stays complete
and AGPL; premium value lands as plugins/packs whose enablement checks the
feature flags. Candidates: advanced reporting exports, QuickBooks sync, SMS
bundles, AI CSR/dispatcher, flat-rate builder, multi-location.

ponytail: keys are not org-bound (one key activates any install) — the
honesty-box model. Ceiling: piracy at scale. Upgrade: embed orgId in the
payload at purchase and compare at redemption.
