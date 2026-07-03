# Unreleased

## Added

- Added `docs/competitive-intelligence/housecallpro-feature-matrix.md` as the
  canonical Housecall Pro benchmark matrix for OpenFieldPro.
- Added `docs/roadmap.md` as the canonical competitive-evolution roadmap,
  linking the feature matrix to the existing implementation plan.

## Fixed (post-audit hardening)

- **Auth**: the API now refuses to boot in production when `JWT_SECRET` is
  unset or still the placeholder, and `infra/compose.prod.yml` requires it
  (was: silently signed tokens with a public default → forgeable tokens).
- **Auth**: the unauthenticated dev fallback (`x-org-id`/first-org) is now
  gated to `NODE_ENV=development` only; unset/unknown env is locked down.
- **API errors**: added global error + not-found handlers. Malformed ids
  (Postgres `22P02`) and validation failures return a sanitized 400 / JSON 404
  instead of a 500 that leaked the internal DB message (reachable unauthed on
  the public booking routes).
- **Billing**: Stripe webhook is now idempotent (partial unique index on card
  `payments.reference` + `ON CONFLICT DO NOTHING`) — redelivered events no
  longer double-count revenue — and it now emits `payment.received` /
  `invoice.paid` so automations and plugins fire for card payments too.
- **Billing**: invoice numbers are unique per org (`invoices_org_number_idx`)
  with create-time retry; the manual `/pay` path runs under a `SELECT … FOR
  UPDATE` row lock so concurrent payments can't silently overpay. Checkout is
  blocked on void/paid invoices and redirects to the web app, not the API.
- **Worker**: appointment reminders dedupe via `appointments.reminded_at`
  (was: re-sent every 60s tick); recurring jobs now materialize at their
  occurrence time as `scheduled` with `scheduledAt` (was: dateless leads).
- **Web**: license activation errors show the API's message, not a raw
  `400: {json}` string.
- Migrations `0019`–`0021`; `closeDb()` added to `@ofp/db` for graceful
  shutdown / test teardown. New tests: `server-boot`, `error-handler`.

## Notes

- This cycle was research and documentation only. Product-code implementation is
  gated on approval of a short design note, with Job Photo Report v1 recommended
  as the next safe, high-value OpenFieldPro-native improvement.
