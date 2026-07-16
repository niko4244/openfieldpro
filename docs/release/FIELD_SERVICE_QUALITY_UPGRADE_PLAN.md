# OpenFieldPro field-service quality upgrade plan

Status: active implementation
Product owner: Nikolas Marconcini
Validation profile: Marco's Appliance Repair Company

## Outcome

OpenFieldPro must feel credible for daily use by an independent service company, not merely demonstrate that the underlying records exist. The benchmark is the operational depth users expect from mature field-service software while preserving OpenFieldPro's own product promise: self-hostable, practical, data-owned, and free of artificial core limits.

This plan closes the gap through small vertical slices. Each slice must leave a real workflow working end to end, include failure and mobile states, and pass the public release gates.

## Product rules

- Keep the AGPL core operationally complete.
- Use practical field-service language; do not copy competitor branding or UI text.
- Default to light mode on every new session.
- Never show an empty state when the real condition is an API failure.
- Financial documents must remain internally coherent after later job edits.
- Settings must affect operational behavior, not exist as decorative toggles.
- Every mutation needs a pending, success, failure, and safe retry state.
- Every primary workflow must work with keyboard navigation and at 390px width.

## Current baseline

Already credible:

- task-oriented Today dashboard;
- conflict-aware drag-and-drop dispatch with a native assignment fallback;
- job closeout through invoice creation;
- persistent organization, invoice, estimate, payment, tax, messaging, numbering, portal, and team settings;
- branded estimate and invoice previews;
- manual partial payments and invoice lifecycle actions;
- customer portal foundation;
- release CI covering API, web, mobile, dependency safety, database parity, and browser visual tests.

Release-critical gaps:

1. Estimate and invoice detail currently reads live job lines while retaining a frozen total. Later job edits can make a customer document inconsistent.
2. Estimates lack document-owned Good/Better/Best options, option line editing, decline, signature enforcement, and deliberate approved-scope conversion.
3. Settings does not yet protect drafts, validate business hours, expose work days, or treat service areas as structured values.
4. Schedule data failures can masquerade as an empty day, and important controls are not fully keyboard or URL-state complete.
5. Customer payment, signed portal links, real delivery history, deposits, immutable financial events, AR aging, and mobile closeout depth remain later slices.

## Delivery waves

### Wave 1 — trust and transaction depth

These slices are independent and may be implemented in parallel.

#### A. Trustworthy company operations settings

Files: `apps/web/app/settings/page.tsx`, focused form helpers and tests.

Deliver:

- grouped responsive settings navigation with deep links;
- separate profile, hours, service-area, and team destinations;
- editable work days and validated opening/closing times;
- timezone synchronization;
- normalized, deduplicated service-area tokens;
- dirty-state detection, pristine Save disabling, draft-preserving failures, and unsaved-navigation confirmation;
- accessible selected state and save/error announcements.

Acceptance:

- at least one work day is required;
- opening time precedes closing time;
- a failed save preserves the draft and explains recovery;
- deep links restore the selected section;
- desktop and 390px layouts have no horizontal overflow.

#### B. Document-owned multi-option estimates

Files: estimate schema/migration, estimate API, estimate editor/preview/portal, document renderer, and focused tests.

Deliver:

- estimate-owned options and option-owned lines;
- configured Good/Better/Best labels at creation;
- recomputed option and estimate totals;
- draft, sent, approved, declined, and expired lifecycle;
- exactly-one-option customer selection;
- signature enforcement when configured;
- idempotent approval/decline;
- explicit action to copy only approved scope to the linked job;
- no automatic scheduling on approval;
- backward-compatible reading of existing estimates where practical.

Acceptance:

- job edits cannot silently change an existing estimate's displayed scope;
- cross-organization reads and writes are denied;
- expired or unsigned required approvals fail safely;
- repeated approval does not duplicate scope;
- copying an approved option updates job lines and total atomically;
- desktop, mobile, preview, and portal paths are covered.

#### C. Trustworthy schedule-to-dispatch day flow

Files: schedule, dispatch, focused shared empty-state support, and browser tests.

Deliver:

- distinguish appointment outage from partial job-title degradation;
- actionable retry, New Job, and Open Dispatch actions;
- field-ready empty-state copy;
- accessible Day/Week/Month controls and labeled search;
- URL-persisted view, date, and search state;
- keyboard assignment fallback;
- live save and conflict feedback.

Acceptance:

- failures never render as a false empty day;
- retry recovers without a page reload;
- view switching and assignment work by keyboard;
- URL reload restores the operator's context;
- 390px layout has no horizontal overflow.

### Wave 2 — customer money flow

Order: after Wave 1 estimate schema stabilizes.

1. Invoice-owned line snapshots and immutable totals.
2. Payment rules that enforce accepted methods, partial-payment configuration, and no overpayment.
3. Signed customer portal links with invoice balance, checkout, receipt, and service-plan views.
4. Deposit collection connected to the approved estimate option.
5. Real send workflow with recipient, message preview, delivery attempts, timestamps, retry, and history.
6. Server-generated durable documents suitable for email and accounting records.

### Wave 3 — owner control and reporting

1. Roles and permission editor with final-owner and self-removal safeguards.
2. Configurable tax profiles and saved fixed/percent discounts applied in estimate and invoice calculations.
3. Message templates with validated variables and per-event delivery toggles.
4. AR aging, estimate conversion, revenue trend, technician scorecards, and CSV export.
5. Audit log for financial and permission mutations.

### Wave 4 — field execution depth

1. Technician photos, signatures, line editing, payment collection, and completion checklist.
2. Arrival windows, business-hours conflict rules, and reassignment audit.
3. Offline completion conflict handling and replay evidence.
4. Route/map work only after the schedule and address data are dependable.

## Verification architecture

```text
settings ────────────────┐
                        ├─ API validation ─ DB migration/parity
estimate editor ─ portal┤
                        ├─ unit/API tests ─ browser journeys
schedule ─── dispatch ──┘
                                  │
                                  └─ public release CI + visual evidence
```

Each slice must pass:

- focused unit and route tests;
- database migration-history and schema-parity checks when schema changes;
- API and web builds;
- desktop and 390px browser journeys;
- keyboard and accessible-name checks for changed controls;
- clean browser console;
- repository safety and production dependency audit.

Marco's release dataset must prove one editable multi-option estimate, one customer-selected and signed option, one approved scope copied to the job, one sent invoice, one partial payment, one paid invoice, and the configured portal/sponsor behavior.

## Explicitly not in Wave 1

- copying a competitor's visual identity or wording;
- arbitrary third-party code execution;
- SMS/email provider selection;
- accounting synchronization;
- financing;
- GPS tracking;
- marketing automation;
- claims of production adoption by Marco's Appliance Repair Company.

## Decision log

| Decision | Classification | Rationale |
|---|---|---|
| Repair financial document ownership before adding more send/payment polish | Safety | A polished inconsistent document is still unsafe. |
| Implement options as a vertical estimate workflow | Product depth | It closes a visible revenue workflow rather than adding isolated controls. |
| Keep settings storage shape for the first settings slice | Simplicity | The existing API is adequate; the immediate gap is trustworthy interaction. |
| Preserve native assignment controls alongside drag-and-drop | Accessibility | Dispatch must remain usable without pointer gestures. |
| Sequence portal payment and delivery after estimate schema stabilization | Dependency | Avoid building customer flows on records that are still changing shape. |
