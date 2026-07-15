# OpenFieldPro Final Product Roadmap

OpenFieldPro is an open-source field service management platform for service businesses, with appliance-service workflows as one supported vertical.

The product advances two connected tracks:

1. **Operations parity** — the complete business workflow expected from a modern field-service platform.
2. **Appliance-service depth** — equipment history and technician diagnostic records connected to work orders when an appliance company uses those features.

The operations platform is the product foundation. Appliance-specific tools are optional workflow depth and must not displace CRM, scheduling, dispatch, estimates, invoices, payments, customer communication, reporting, or mobile field execution.

The current product parity gap audit is `docs/release/PRODUCT_PARITY_GAP_AUDIT.md`. That audit is release-blocking until the P0 business settings, invoice settings, estimate settings, payment/tax/discount configuration, and customer portal gaps are resolved.

## Product principles

- The free core remains operationally complete: customers, jobs, dispatch, estimates, invoices, payments, reviews, reporting, documents, service plans, and mobile technician workflow.
- The customer, property, equipment, and work order remain the central operational records.
- Technical notes or diagnostic sessions attach to the work order without replacing commercial job state.
- Sponsor or partner content must never affect service recommendations or customer records.
- Self-hosting is a deployment and control benefit, not a substitute for product value.
- Public copy should describe product mechanisms and present capabilities without generic hype.

## Current release tracks

| Track | Goal | Status |
|---|---|---|
| Product shell | Group navigation around Field, Operations, Quality, and System | Implemented |
| Today dashboard | Prioritize the next visit, customer, equipment, and work required | Implemented |
| CRM | Customers, properties, equipment, history, notes, and activity | Implemented foundation |
| Jobs | Intake, work orders, status, assignment, line items, and history | Implemented foundation |
| Schedule | Day, week, and month appointment views | Implemented foundation |
| Dispatch board | Unassigned queue, technician lanes, workload visibility, and reassignment | Implemented foundation |
| Estimates and invoices | Draft, approval, invoicing, payment, and document handoff | Implemented foundation |
| Customer portal | Estimate approval, invoice payment, appointment, and service records | In progress |
| Technician completion | Status, notes, photos, signature, parts used, and payment | In progress |
| Documents | Branded estimates, invoices, receipts, and completion reports | In progress |
| Service plans | Customer integration, renewal worker, included visits, and portal status | Foundation implemented |
| Accounting | CSV export first, then provider adapters | Planned |
| Integrations | API keys, event delivery, retry log, import/export, and partner workflows | Partially implemented |
| Trust | Permissions, audit log, immutable financial records, and rights controls | Partially implemented |
| Self-hosting | Install, update, backup, restore, release packaging, and upgrade tests | Foundation implemented |
| Appliance technical records | Equipment-linked diagnostic notes and evidence | Optional foundation |

## Priority sequence

### 0. Close the business-configuration parity gap

- Replace the small Settings page with a full business configuration center.
- Add persistent invoice settings for due terms, customer-view visibility, format, messages, numbering, reminders, and payment instructions.
- Add persistent estimate settings for expiration, approval mode, signatures, deposits, customer-view visibility, messages, option labels, and numbering.
- Add payment, tax, discount, and portal settings.
- Make customer-facing invoice and estimate previews obey those settings.
- Validate with Marco's Appliance Repair Company before sponsor outreach.

### 1. Finish daily operations

- Complete the dispatch board with unassigned work, technician lanes, reassignment, date navigation, and workload pressure.
- Add conflict detection for overlapping technician appointments.
- Add arrival windows, travel buffers, and appointment status.
- Make job status, assignment, customer, property, and equipment visible from every operational surface.
- Preserve a clear audit trail for schedule and assignment changes.

### 2. Complete technician job execution

- Start, pause, resume, complete, cancel, and return-visit states.
- Technician notes, customer-visible notes, photos, parts used, and signatures.
- On-site estimate creation, approval, invoice generation, and payment collection.
- Offline job access and durable queued writes.
- Clear sync, conflict, and retry states.

### 3. Complete the customer lifecycle

- Secure appointment confirmation and rescheduling links.
- Estimate approval and decline.
- Invoice payment and receipt access.
- Service history, documents, and service-plan status.
- Reliable email and SMS adapters with delivery status.

### 4. Complete financial operations

- Price-book-driven estimates and invoices.
- Deposits, partial payments, refunds, write-offs, and payment reconciliation.
- Tax configuration and service-area rules.
- CSV accounting export followed by provider adapters.
- Revenue, accounts receivable, margin, and technician performance reporting.

### 5. Finish service-plan lifecycle

- Customer enrollment and cancellation.
- Included visit scheduling and completion.
- Renewal reminders and recurring billing adapters.
- Priority scheduling and plan benefit visibility.
- Portal access to plan status and visit usage.

### 6. Harden administration and self-hosting

- Role-based permissions and audit logs.
- Import/export and data portability.
- Release packaging, migrations, backups, restore drills, and upgrade tests.
- Integration retry logs and operational alerts.
- Production security and observability review.

### 7. Expand vertical-specific workflows only after the core is reliable

- Preserve equipment history for appliance, HVAC, electrical, plumbing, and adjacent trades.
- Add optional vertical-specific forms, checklists, and technical records.
- Keep these modules separate from the universal operations workflow.
- Validate real field use before making accuracy, time-savings, callback, or revenue claims.

## Definition of done — operations core

A service business can:

1. Install or update OpenFieldPro without editing application code.
2. Create an organization, users, roles, branding, and service settings.
3. Add customers, properties, equipment, jobs, estimates, invoices, payments, reviews, and service plans.
4. Schedule and dispatch technicians while detecting assignment and time conflicts.
5. Let customers confirm appointments, approve estimates, pay invoices, and view appropriate service records.
6. Complete a work order from the technician mobile experience, including notes, photos, parts, signature, and payment.
7. Export accounting data and integrate through supported APIs or webhooks.
8. Back up and restore the full stack.
9. Operate core field workflows during temporary connectivity loss.
10. Review an audit trail for material customer, schedule, job, and financial changes.

## Definition of done — optional appliance-service workflow

An appliance-service company can additionally:

1. Attach the exact appliance model and serial to a work order.
2. Preserve complaint, technician observation, readings, notes, photos, and disposition.
3. Store the technical record in equipment service history.
4. Carry unresolved technical work into a return visit.
5. Produce technician and customer summaries without changing commercial job state.

## Release gate

OpenFieldPro is ready for broader use when the operations core supports a complete lead-to-payment loop:

- customer and property intake,
- scheduling and dispatch,
- technician execution,
- estimate approval,
- invoice and payment,
- customer communication,
- service history,
- reporting,
- offline resilience,
- and safe upgrade/restore procedures.

Vertical-specific technical modules must not block or redefine this operations release gate.
