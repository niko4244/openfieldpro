# OpenFieldPro product parity gap audit

Status: release blocker.

OpenFieldPro is not ready for public sponsor outreach or broad public release while the business-configuration, invoice, estimate, payment, and customer-facing workflows remain at foundation level.

This is not a branding problem. It is a product-depth problem.

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

OpenFieldPro is **no-go for public sponsor outreach** until the P0 parity repair below is implemented and validated with Marco's Appliance Repair Company as the owner-test profile.

The sponsor slot may remain in local testing, but no external company should be contacted while the app lacks the configuration depth needed to make the sponsor conversation credible.

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
