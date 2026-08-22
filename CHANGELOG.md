# Changelog

All notable changes to OpenFieldPro are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for release tags.

## [v0.1.0-rc.1] - 2026-08-22

First public release candidate. Implements the field-service quality-upgrade
plan validated against Marco's Appliance Repair Company as the owner-test
profile.

### Trust and transaction depth

- Business settings center with grouped navigation, editable work days and
  validated hours, normalized service areas, dirty-state detection, and
  draft-preserving failures.
- Multi-option estimates (Good/Better/Best) with option-owned line items,
  full lifecycle (draft, sent, approved, declined, expired), one-option
  customer selection, signature enforcement, and atomic approved-scope
  conversion to the job.
- Schedule-to-dispatch day flow that distinguishes outages from empty days,
  with retry, keyboard assignment fallback, and URL-persisted context.

### Customer money flow

- Invoice-owned line snapshots with immutable totals.
- Payment rules: accepted methods, partial-payment configuration, and
  overpayment prevention.
- Signed, expiring, revocable customer portal links (balance, checkout,
  receipts, service plans) with email delivery.
- Deposit collection tied to the approved estimate option.
- Real send workflow: recipient, message preview, delivery attempts,
  timestamps, retry, and history via SMTP.
- Server-generated durable PDF documents for invoices and estimates,
  attached to sends and re-attached on retry.

### Owner control

- Roles & permissions editor with final-owner and self-removal safeguards.
- Message templates with validated variables and live preview.
- Customer-facing payment-method preview and partial-payment warnings.

### Reliability and release engineering

- Maintenance-mode write gating and an operations controller contract for
  backup orchestration.
- Deterministic lockfile with digest verification, frozen installs, and a
  20-check release-safety gate including a committed-secret scan.
- Dependency audit against the npm advisory database with documented,
  expiring exceptions.
- CI actions pinned to commit SHAs and kept current by Dependabot.
- Dependency updates: fast-uri, js-yaml, nanoid, tar, brace-expansion,
  postcss, undici, and nodemailer 9 cleared their high/medium advisories.

### Known limitations (this candidate)

- Tax profiles and saved discounts (planned next slice) are not yet shipped.
- AR aging, conversion, and scorecard reporting are not yet shipped.
- Mobile field execution remains foundation-level; no native-device QA has
  been performed.
- No public demo deployment or independent penetration test has been run.
- The repository remains private; making it public is a separate decision.

[Unreleased]: https://github.com/niko4244/openfieldpro/compare/v0.1.0-rc.1...ofp-monorepo
[v0.1.0-rc.1]: https://github.com/niko4244/openfieldpro/tree/v0.1.0-rc.1
