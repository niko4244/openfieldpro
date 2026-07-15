# OpenFieldPro v2 Product Specification

## Product definition

OpenFieldPro is an open-source, self-hostable field service management platform. It is intended to cover the operational workflow businesses expect from established field-service platforms while preserving data ownership, extensibility, and deployability.

The universal product is the operations system:

- CRM and customer history
- properties and equipment
- scheduling and dispatch
- work orders and technician execution
- estimates and approvals
- invoices, payments, and receipts
- documents and photos
- reviews and service plans
- reporting and integrations
- technician mobile workflows
- customer-facing links and portal experiences

Appliance-specific technical records are an optional vertical module. They may enrich work orders and equipment history, but they do not redefine the product or replace commercial job state.

## Primary users

### Owner / operator

- Reviews today’s workload, revenue, receivables, and business health
- Manages customers, jobs, price book, service plans, documents, and integrations
- Configures users, branding, payments, notifications, and self-hosting operations

### Dispatcher / office staff

- Creates customers, properties, equipment, and work orders
- Schedules visits and manages an unassigned queue
- Balances technician workload and reassigns appointments
- Tracks job status, return visits, estimates, approvals, invoices, and customer communication

### Technician

- Sees assigned visits and customer/equipment context
- Starts and completes work orders
- Records notes, photos, parts, signatures, estimates, and payments
- Works through temporary connectivity loss with visible sync state

### Customer

- Confirms or reschedules appointments
- Approves or declines estimates
- Pays invoices and views receipts
- Accesses appropriate service history, documents, and service-plan status

## Core operational model

### Customer

A person, household, landlord, property manager, or commercial account.

### Property

The service location. A customer may own or manage multiple properties.

### Equipment

An installed asset at a property. Equipment history persists across work orders.

### Job

The commercial work order. It owns status, assignment, line items, estimates, invoices, customer communication, and completion records.

### Appointment

A scheduled visit for a job with start/end times and an optional technician assignment.

### Estimate

A customer-facing proposal built from line items. It can be approved, declined, revised, or converted into an invoice/work workflow.

### Invoice and payment

The financial record for completed or billable work, including partial payment, balance due, receipts, voids, and reconciliation.

## Required product workflows

### Lead to scheduled job

1. Capture customer and service request.
2. Create or match property and equipment.
3. Create the work order.
4. Schedule an appointment.
5. Assign or leave in the dispatcher’s unassigned queue.
6. Confirm the visit with the customer.

### Dispatch

1. View a selected day.
2. See unassigned visits and technician lanes.
3. Review workload counts and job states.
4. Reassign by drag-and-drop or accessible assignment controls.
5. Detect overlaps and route pressure.
6. Preserve assignment and schedule audit history.

### Technician execution

1. Open the assigned visit.
2. Review customer, property, equipment, complaint, and prior history.
3. Start the job.
4. Record internal notes, customer-facing notes, photos, parts, and labor.
5. Create or revise an estimate when required.
6. Capture approval, signature, and payment.
7. Complete, pause, cancel, or create a return visit.

### Estimate to payment

1. Build estimate from price-book or custom line items.
2. Send secure approval link.
3. Capture approval/decline and audit metadata.
4. Convert approved work into invoiceable line items.
5. Send invoice and collect full or partial payment.
6. Generate receipt and update receivables/reporting.

### Customer lifecycle

1. Send confirmations and reminders.
2. Provide appointment, estimate, invoice, receipt, and service-plan access.
3. Request and manage reviews after completion.
4. Preserve service history across future visits.

## Operations-first release priorities

1. Dispatch and schedule conflict detection
2. Technician completion workflow
3. Customer portal and secure public links
4. Estimate approval and payment lifecycle
5. Reliable email/SMS delivery status
6. Service-plan lifecycle
7. Accounting export and adapters
8. Permissions, audit log, release packaging, backup, and restore validation

## Optional appliance-service module

The optional module may add:

- exact appliance model and serial
- customer complaint and technician observation
- technical readings, notes, photos, and disposition
- equipment service history
- return-visit continuity
- technician and customer summaries

It must remain subordinate to the work order and must not introduce unrelated diagram-segment authoring concepts into the core field-service product.

## Non-goals for the universal operations core

- Requiring appliance-specific diagnostic workflows for ordinary job management
- Treating wire diagrams or selectable route segments as a central product primitive
- Blocking scheduling, invoicing, or payment on vertical-specific technical data
- Making unsupported performance or diagnostic-accuracy claims

## Release gate

A release is operationally credible when a real service company can complete the full loop:

1. customer intake
2. property/equipment record
3. work order
4. schedule and dispatch
5. technician execution
6. estimate approval
7. invoice and payment
8. customer communication and service history
9. reporting and export
10. backup, restore, and safe upgrade
