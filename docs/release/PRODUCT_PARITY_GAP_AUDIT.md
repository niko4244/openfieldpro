# OpenFieldPro product parity gap audit

Status: release candidate (v0.1.0-rc.1, 2026-08-22) — P0 parity repair substantially delivered; final release still gated on the remaining items below.

## Assessment record for v0.1.0-rc.1

Delivered on `ofp-monorepo` since this audit was written (see `CHANGELOG.md`):

- Business configuration center (grouped settings, work days/hours, service areas, team, messages, portal, payments) — closes the Settings gap.
- Estimate options, line items per option, approve/decline/sign lifecycle, approved-scope conversion, deposits — closes the estimate-options and estimate depth gaps.
- Payment rules (accepted methods, partial-payment configuration, no overpayment), portal links (balance/checkout/receipts/service plans), send workflow, durable PDF documents — closes the payments, portal, and document gaps.
- Roles & permissions editor with owner safeguards — closes the admin/trust gap's permission half.
- Validation profile proven with Marco's Appliance Repair Company across the Wave 1–3 slices (multi-option estimate, signed approval, sent invoice, partial payment, paid invoice, portal links).

Explicitly accepted for this candidate (remaining gaps, not release-blocking for an RC):

- Tax profiles and saved fixed/percent discounts — planned as the next slice (Wave 3 #2).
- AR aging, estimate conversion, revenue trend, technician scorecards, CSV export (Wave 3 #4) and the financial/permission audit log (Wave 3 #5) — planned.
- Arrival windows, business-hours conflict rules, reassignment audit, route/map depth (P1 dispatch) — planned.
- Mobile field execution depth (photos, signatures, offline completion) and native-device QA — planned.
- A public deployment and independent penetration test are required before the final release, not for this candidate.

This audit remains the source of truth for what must land before a non-candidate release.

## Benchmark

The comparison target is the operational depth expected from mature incumbent field-service software, especially:

- company and business settings;
- invoice customer-view settings;
- estimate customer-view settings;
- estimate options and templates;
- payments, deposits, taxes, discounts, reminders, and messaging;
- customer portal approval/payment flows;
- mobile technician completion;
- dispatch/schedule depth;
- reporting and accounting handoff.

OpenFieldPro should not copy a closed SaaS model, but it must meet the operational expectations that independent service businesses already understand.

## Benchmark

The comparison target is the operational depth expected from mature incumbent field-service software, especially:

- company and business settings;
- invoice customer-view settings;
- estimate customer-view settings;
- estimate options and templates;
- payments, deposits, taxes, discounts, reminders, and messaging;
- customer portal approval/payment flows;
- mobile technician completion;
- dispatch/schedule depth;
- reporting and accounting handoff.

OpenFieldPro should not copy a closed SaaS model, but it must meet the operational expectations that independent service businesses already understand.

## Current gap summary

| Area | Current OpenFieldPro state | Required state before public push |
|---|---|---|
| Settings | Team plus basic company branding | Full business configuration center |
| Invoice settings | Basic invoice list/detail/payment state | Customer-view defaults, due terms, visibility, messages, numbering, PDF/print settings |
| Estimate settings | Basic estimates and document preview | Customer-view defaults, expiration, approval behavior, options/templates, deposits, signatures |
| Price book | Foundation catalog exists, not fully central to estimates/invoices | Price-book-driven service/material entry, discounts, taxable defaults, cost/markup |
| Payments | Manual payment and Stripe foundation | Pay-online settings, deposits, partial payments, payment instructions, reconciliation rules |
| Taxes/discounts | Minimal line-item taxable flag | Tax profile, service-area rules, saved discounts, recurring discounts |
| Messages | No real configurable message center | Invoice/estimate/job/review templates with variables and per-event toggles |
| Customer portal | Scaffold | Estimate approval/decline/signature, invoice payment, receipts, service history, service-plan status |
| Dispatch/schedule | Implemented foundation | Arrival windows, business hours, conflict policy, reassignment audit, route/map depth |
| Mobile field flow | Foundation | Photos, signatures, line items, payments, offline completion, customer approval |
| Reporting | Summary snapshot | AR aging, conversion funnel, revenue trends, technician scorecards, export |
| Admin/trust | Role foundation | Permissions editor, audit log, immutable financial events, data export/import |

## Release decision

- For **v0.1.0-rc.1 (2026-08-22)**: accepted as a release candidate. The P0 repairs below are substantially implemented and validated with Marco's Appliance Repair Company as the owner-test profile; the remaining P0 item (tax/discount configuration) and the P1 items are tracked above and do not block the candidate.
- For **final public release**: still **no-go** until the remaining items above land, a clean deployment is exercised end to end, and an independent security review is completed.
- **Public sponsor outreach** remains paused until the final release gate, per the sponsorship playbook.

## P0 parity repair

These are the minimum public-facing repairs.

### 1. Business settings center

Replace the small Settings page with a structured business configuration area:

- Company profile
- Business hours
- Service areas
- Team and roles
- Invoice settings
- Estimate settings
- Payments
- Taxes and discounts
- Messages
- Numbering
- Portal settings
- Integrations

### 2. Invoice settings

Add persistent per-organization invoice settings:

- due term type: receipt, start of work, completion of work, or net days;
- default net terms: 3, 5, 7, 10, 14, 15, 20, 30, 40, 45, 60, 90;
- invoice format: email optimized or envelope optimized;
- visibility toggles for business, customer, job, technician, service, material, price, quantity, subtotal, payments, and balance;
- default invoice message with variables;
- default payment instructions;
- invoice numbering prefix and next number;
- reminder schedule defaults.

Invoices and previews must use these settings.

### 3. Estimate settings

Add persistent per-organization estimate settings:

- default expiration days;
- approval mode: single option or multiple option approval;
- signature required toggle;
- deposit required toggle and default amount/percent;
- estimate format: email optimized or envelope optimized;
- visibility toggles for business, customer, service, material, price, quantity, subtotal, technician, service date, and estimate message;
- default estimate message with variables;
- default option labels: Good, Better, Best;
- estimate numbering prefix and next number.

Estimates and previews must use these settings.

### 4. Estimate options and templates

The estimate model must support:

- multiple options per estimate;
- line items per option;
- template reuse;
- copy option;
- approve/decline/sign in customer portal;
- convert approved option into job/invoice flow.

### 5. Payment, tax, and discount configuration

Add org-level configuration for:

- online payment availability;
- accepted manual payment methods;
- deposits and partial-payment rules;
- tax rates and tax labels;
- saved fixed/percent discounts;
- recurring discounts;
- payment receipt behavior.

### 6. Customer portal completion

The portal must support:

- view estimate options;
- approve/decline/sign estimate;
- pay invoice;
- view receipts;
- view service history;
- view service-plan status;
- show sponsor slot only where allowed by entitlement/settings.

### 7. Validation profile

Marco's Appliance Repair Company is the first owner-test profile. The validation dataset must prove:

- company branding and public contact info;
- invoice defaults;
- estimate defaults;
- one multi-option estimate;
- one signed/approved estimate;
- one sent invoice;
- one paid invoice;
- customer portal view;
- sponsor-slot behavior.

## P1 parity repair

After P0:

- drag-and-drop dispatch polish;
- arrival windows and business-hour conflict rules;
- automated email/SMS templates;
- review request automation;
- AR aging and conversion reporting;
- accounting export;
- mobile completion depth.

## Engineering rule

Do not add sponsor/revenue language that implies the product is ready until this audit is resolved. Public docs may describe planned features only when they are clearly labeled as planned.
