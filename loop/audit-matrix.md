# OFP-vs-HCP Audit Matrix

Snapshot: 2026-06-30, post-Phase 5c (triggers shipped), Wave 1a providers ready.
Pessimistic by design — a 🟢 only when OFP depth matches HCP depth.

## 1. Scheduling & Dispatch

| Feature | Status | Parity Depth (OFP today vs HCP) | Surface | Blockers / Notes |
|---|---|---|---|---|
| Drag-and-drop calendar | 🔴 | HCP has interactive calendar with reassign-on-drop. OFP has `/schedule` page = appointment list grouped by tech. | W | Need multi-tech first |
| Team calendar views (multi-tech toggle) | 🔴 | HCP toggles per-tech / multi-tech views; OFP shows one tech at a time via `appointments.technicianId`. | W, API | Phase 6a |
| Color-coded scheduling | 🔴 | OFP doesn't have job tags/colors. | W | After schema tags |
| Recurring jobs (visits) | 🟢 | HCP schedules recurring; OFP has `recurring_jobs` table + worker `materializeRecurring` tick. | DB, Wkr | ✓ parity |
| HCP Map (real-time tech locations) | 🔴 | HCP shows tech + job on a map; OFP has no GPS ingest. | DB, API, W | Phase 7 |
| Route optimization | 🔴 | HCP auto-plans route; OFP has no routing. | M, W | Future |
| Unscheduled Job Inbox | 🟡 | HCP central inbox; OFP pipeline page covers leads but not unassigned confirmed bookings. | W | Phase 6 |
| Color tags | 🔴 | HCP supports job-level color tags; OFP has no tags. | DB | Phase 6 |

## 2. Customer Management (CRM)

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Centralized customer profile | 🟡 | HCP shows contact + job hist + estimates + invoices + payments on one card; OFP has customer + related jobs/invoices but in disconnected routes. | W | Polish phase |
| Custom fields | 🔴 | HCP supports custom per-org data fields; OFP customers table is fixed (name/email/phone/notes only). | DB | Phase 9 |
| Communication history | 🟡 | HCP auto-logs SMS/email/note exchanges; OFP has `activities` table but no UI surface. | DB, W | After Phase 6 |
| Customer tagging | 🔴 | HCP tags customers for segmentation; OFP has no tag table. | DB | Phase 9 |
| Property profiles | 🟢 | OFP has a `properties` table; HCP equivalent covered. | DB | ✓ |
| Multiple properties per customer | 🟢 | OFP FK customer_id; HCP covered. | DB | ✓ |

## 3. Jobs / Work Orders

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Job status lifecycle (lead, scheduled, in_progress, completed, canceled) | 🟢 | OFP parity. | DB, API | ✓ |
| Customizable digital statuses | 🔴 | HCP lets each org rename the lifecycle stages; OFP enum is hard-coded. | DB | After property settings |
| Electronic checklists (pre/post-job) | 🔴 | HCP supports checkable items per template; OFP has no template-checklist linking. | DB, API | Phase 10 |
| Custom intake forms | 🔴 | HCP supports filled-out forms on booking; OFP doesn't. | W, DB | Phase 9 |
| Job photos / documents | 🟢 | OFP has `photos` table + upload route + `jobPhotos()` web binding. | DB, API, W | ✓ |
| Task / job notes (internal) | 🟡 | HCP shows internal notes alongside customer-facing; OFP has partial via `activities`. | DB, W | After Phase 6 |
| Job costing + margin | 🟢 | OFP `jobs.laborCostCents` + `lineItems.unitCost` + `jobMargin()` shared helper. | DB, API | ✓ |
| Job checklists (linked to template) | 🔴 | HCP attaches pre/post-job checklists to a template; OFP has none. | DB | Phase 10 |
| Job urgency / priority | 🔴 | HCP ladder priority; OFP no priority column. | DB | After simple needs |

## 4. Estimates & Invoicing

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Single-option estimates | 🟢 | OFP parity (single total + accepted bool). | DB, API, W | ✓ |
| Multi-option estimates (Good / Better / Best) | 🔴 | HCP supports multiple price tiers in one estimate; OFP stores only one total. | DB, API, W | Phase 9 |
| Digital estimate approval (in email / portal) | 🟡 | HCP customer signs from email link; OFP has estimate accepted bool but no approval surface. | DB, API | Phase 8 |
| Flexible invoicing (from price book) | 🟢 | OFP invoices today, line items from free-text or catalog. | DB, API, W | ✓ |
| Partial payments | 🔴 | HCP supports deposits and partial payments on a single invoice; OFP `recordPayment` is full or overpay. | DB, API | Phase 9 |
| Batch invoicing | 🔴 | HCP can invoice multiple jobs at once; OFP inverts only one-at-a-time. | UI, API | Polish |
| Automated payment reminders | 🟡 | HCP schedules reminders; OFP triggers via Phase 5c but no customer-payment state machine. | DB, W | Wave 2 |
| Invoice PDF generation | 🔴 | HCP auto-PDFs each invoice; OFP relies on web view only. | API | Phase 9 |
| Estimate → invoice conversion | 🟢 | OFP supports via the existing invoice creation flow. | API | ✓ |

## 5. Payments

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Card-on-file | 🔴 | HCP stores customer card for later charge; OFP has no Stripe-customer binding. | DB, API | Phase 9 |
| Text-to-Pay | 🟡 | HCP sends SMS with secure payment link; OFP has Phase 5d Wave 1a providers (SendGrid/Twilio stub) but no Stripe payment link yet. | API, M | After Stripe integration |
| ACH / Direct Debit | 🔴 | HCP supports bank-to-bank; OFP has only card-via-Stripe today. | API | After Stripe plans |
| Customer financing (GreenSky partners) | 🔴 | HCP offers in-app financing; OFP not offered. | API | Out of scope |
| Stripe card charge (basic) | 🟡 | OFP has `stripe-webhook` route + recordPayment; not as deep as HCP's bundle. | API | ✓ core path |
| Mobile card reader hardware | 🔴 | HCP integrates Bluetooth readers; OFP has no mobile. | M | Out of scope |
| QuickBooks two-way sync | 🔴 | HCP auto-pushes invoices/payments/customers; OFP has no QB integration. | API | Phase 9 |
| Refund flow | 🔴 | HCP supports refunds against a captured charge; OFP doesn't. | API | After Stripe |

## 6. Communications / Marketing

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Email send (templated) | 🟢 | OFP Phase 5b + A/B variants + Wave 1a provider wiring. | API, DB, W | ✓ |
| SMS send (templated) | 🟢 | OFP Phase 5b + Wave 1a provider wiring. | API, DB, W | ✓ with phone-numbers |
| Twilio provider (real) | 🟡 | Wave 1a stub provider; real Twilio env-keyed + tested once. | shared | Need OFP_TWILIO_* env at deploy |
| SendGrid provider (real) | 🟡 | Wave 1a stub provider; real SendGrid env-keyed + tested once. | shared | Need OFP_SENDGRID_API_KEY at deploy |
| Automated drip campaigns | 🔴 | HCP has multi-step campaigns; OFP has single-template rules. | DB, API | Phase 10 |
| Review request automation | 🟢 | OFP has `review.request` event key + automation rules can fire post-job. | DB, API, W | ✓ |
| Marketing dashboard | 🔴 | HCP shows campaign ROI; OFP automation audit but not campaign. | W | Phase 10 |
| Postcard marketing (physical) | 🔴 | HCP prints + mails; OFP not offered. | API | Out of scope |
| Custom SMS number (Twilio sub-account) | 🔴 | HCP provisions per-org number; OFP uses one FROM. | DB, API | Phase 10 |
| Bulk SMS / email blast | 🔴 | HCP sends to filtered lists; OFP single-message path only. | API, DB | Phase 10 |

## 7. Field Service Mobile App

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Offline data capture | 🟢 | OFP Phase 5a offline sync (mobile supplies UUID, queues ops). | M, API | ✓ |
| Job dispatch notifications | 🟡 | HCP pushes to mobile; OFP has no `notifications` push to a mobile channel yet. | M, API | After notifications |
| In-app time tracking | 🔴 | HCP clock-in/out; OFP no time + GPS. | DB, API, M | Phase 7 |
| Map / GPS tracking | 🔴 | HCP shows tech on map; OFP has no GPS ingest. | DB, API, W | Phase 7 |
| Technician-led estimates (on-site) | 🔴 | HCP techs build + present estimates in app; OFP has no mobile UI. | M, W | Phase 10 |
| Photo capture from device camera | 🟢 | OFP supports multimedia upload from any source. | API, M | ✓ |
| Job notes on mobile | 🔴 | HCP tech notes per job; OFP no mobile. | M | Phase 7 |

## 8. Reporting & BI

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Revenue rollup | 🟢 | OFP `ReportSummaryDTO` includes revenue collected + accounts receivable + margin. | DB, API, W | ✓ |
| Technician performance | 🟡 | HCP drill-down per tech; OFP reports aggregate only. | DB, API | Phase 6 |
| Service agreement revenue tracker | 🔴 | HCP shows MRR from agreements; OFP has no agreements table. | DB, API | Phase 8 |
| Revenue source tracking (lead-source attribution) | 🟡 | HCP maps $ to source; OFP has it as an optional concept but no UI. | DB, W | Phase 9 |
| Custom dashboards | 🔴 | HCP lets owner build dashboards; OFP has fixed `/reports`. | W | Polish |
| Job-source attribution report | 🔴 | HCP surfaces lead-source → job conversion; OFP no captures. | DB, API | Phase 9 |

## 9. Price Book / Catalog

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Hierarchical organization | 🟢 | OFP has `catalog_categories` → `catalog_items` two-level hierarchy. | DB, API, W | ✓ |
| Line item details (image, accounting code, units) | 🟡 | HCP supports per-line item extras; OFP has basic name/desc/price/cost/taxable. | DB, API | 🐴 Polish |
| Favorite / pinned items | 🔴 | HCP per-tech favorites; OFP no favorites. | DB, API | Polish |
| Flat-rate mapping | 🟢 | OFP `priceCents` covers flat or hourly (workmode is up to the line item). | DB, API | ✓ |
| Image attachments to catalog item | 🔴 | HCP stores product images; OFP no image field. | DB, API | Polish |

## 10. Service Agreements / Memberships

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Agreement record (contract per customer) | 🔴 | HCP formal agreement; OFP no `agreements` table. | DB | Phase 8 |
| Recurring billing tied to agreement | 🔴 | HCP cycles charges via agreement; OFP has `recurring_jobs` for visits but not billing. | DB, API, Wkr | Phase 8 + Phase 9 |
| Maintenance schedule from agreement | 🟡 | HCP auto-creates visit items; OFP `recurring_jobs` covers visits but not agreement-driven scheduling. | DB, Wkr | Phase 8 |
| Auto-renewal | 🔴 | HCP renews agreements at period end; OFP has no renewal. | DB, Wkr | Phase 8 |

## 11. Inventory & Fleet

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Material management (assign parts to jobs) | 🔴 | HCP tracks cost-of-goods per job; OFP has `lineItems.unitCost` but no per-tech allocation. | DB, API | Phase 10 |
| Truck inventory control | 🔴 | HCP logs parts used per vehicle; OFP has no truck/inventory-tracking. | DB, API | Phase 10 |
| Vehicle fleet management (plates/insurance) | 🔴 | HCP tracks vehicles; OFP none. | DB | Phase 10 |

## 12. Customer Self-Service Portal

| Feature | Status | Parity Depth | Surface | Blockers / Notes |
|---|---|---|---|---|
| Client self-booking | 🟢 | OFP has `/api/public/:orgId/book` + `/portal`. | W, API | ✓ |
| View past estimates / invoices | 🔴 | HCP portal shows history; OFP portal is booking-only. | W, API | Phase 8 |
| Self-reschedule / cancel | 🔴 | HCP portal allows; OFP has no customer-side reschedule. | W, API | Phase 8 |
| Secure payment link from portal | 🔴 | HCP portal pays via Stripe; OFP portal doesn't. | W, API | After Stripe + Phase 8 |
| E-signature from portal | 🔴 | HCP ties DocuSign-style signing; OFP has no signature flow. | W, API | Phase 10 |
| Customer referral sharing | 🔴 | HCP has referral link tracking; OFP none. | DB, API | Phase 10 |
| Property manager view (multi-property) | 🔴 | HCP tenant view; OFP doesn't surface `properties` to portal users. | W, API | Phase 8 |

## Addendum: Hidden / Non-Marketing Capabilities

| Feature | Status | Parity Depth | Surface | Notes |
|---|---|---|---|---|
| AI Assistant (HCP Assist) | 🔴 | HCP calls AI for chat summaries, scripts; OFP none. | API | Out of v-v1 scope |
| Interactive Voice Response (IVR) | 🔴 | HCP auto-attendant; OFP none. | API | Out of scope |
| Chat / in-app messaging | 🔴 | HCP in-app chat; OFP none. | DB, API | Polish phase |
| Websites by HCP (built-in SEO sites) | 🔴 | OOO; OFP remains a back-office tool, no built-in site. | W, API | Out of scope |
| Custom SMS number provisioning | 🔴 | HCP per-org sub-number; OFP single FROM. | DB, API | Phase 10 |
| E-signatures for legal / job completion | 🔴 | HCP captures; OFP no signing. | W, API | Phase 10 |

## Phase 5d in queue (separate from HCP-parity roadmap)

Applies regardless of HCP. Already-queued work that's part of phase 5d, not "Phase 6+":

- [ ] **Wave 1b** Customer preferences (table + endpoints)
- [ ] **Wave 2** Delivery analytics (provider_message_id columns + webhooks route)
- [ ] **Wave 3** Visual workflow builder (workflow_ast column + DnD UI)

These three live phases are scheduler-priority because they ride on the freshly-shipped Wave 1a providers.
