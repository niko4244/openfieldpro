# OpenFieldPro — Feature Comparison, Gap Analysis & Improvement Plan

_Generated 2026-06-28. Source of truth: the running build at `C:\Users\nikma\openfieldpro`
(web on :3000, served by Next 15 / PID confirmed). Goal is **not** to clone incumbent
field-service SaaS. It is to ship a leaner, open, profitability-first alternative that wins on
price transparency, open extensibility, visible margins, and data ownership._

---

## 0. How this was assessed (and one caveat)

- **Codebase** is the authoritative surface: `packages/db/src/schema.ts` (13 tables), all 15
  API routes in `apps/api/src/routes/`, the 10 nav sections in `apps/web/lib/nav.ts`, every
  `page.tsx` (200–570 lines each, plus `[id]` detail pages), the `apps/worker` reminder loop,
  and the README roadmap.
- **Live UI**: the web frontend renders, but every data panel shows **"API unreachable."**
  Root cause found: this checkout (`~/openfieldpro` @ `6223a28`) still ships the buggy
  `isMain` guard in `apps/api/src/server.ts:41` —
  `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows (drive-letter +
  backslash vs `file:///C:/…` forward-slash URL), so `.listen()` is never called and the API
  never binds :3001. The `pathToFileURL()` fix exists only in the parallel `~/openfieldpro-app`
  checkout and was never merged here. **One-line fix** unblocks the live stack — call it Quick
  Win #0.

---

## 1. What OpenFieldPro has today (the 10 tabs + backend)

| Tab / module | Backend | Status |
|---|---|---|
| **Dashboard** | reports summary | KPI cards |
| **Pipeline** | `jobs` grouped by status | **read-only** kanban (no drag) |
| **Jobs** (work orders) | `jobs` + `line_items` CRUD, margin via `unit_cost`/`labor_cost_cents` | solid; detail page |
| **Customers** (CRM) | `customers` + `properties` + `activities` timeline | basic fields only; detail page |
| **Schedule** | `appointments` API (`?from&to`, PATCH reschedule/reassign) | calendar **view**; no drag-drop board |
| **Estimates** | `estimates` (just `total` + `accepted` bool) | **no line items, no options, no e-sign** |
| **Invoices** | `invoices` + `payments` (manual cash/check/card) + Stripe `/checkout` + signed webhook | no PDF/email/reminders |
| **Price Book** | **none** — browser `localStorage` only | not real; no cost/markup/images/link |
| **Reviews** | `reviews` (rating 1–5 + comment) | manual only; no request automation |
| **Reports** | one `/api/reports/summary` (rev, AR, margin, pipeline, rating) | single snapshot, no trends |
| Public booking | `POST /api/public/:orgId/book` → `lead` job (unauth) | works; bare form |
| Recurring jobs | `recurring_jobs` materialized by worker | works |
| Notifications | `worker` + pluggable `notify()` (ntfy/console) | stub; no SMS/email provider |
| Mobile | Expo tech **job list**; Phase-5a offline scoped | read-only |
| Auth/Tenancy | JWT (scrypt), org-scoped, roles owner/dispatcher/technician | solid |

**Genuine strengths to build on:** integer-cents money everywhere, **per-job cost & margin in
the schema** (`unit_cost`, `labor_cost_cents` — HCP hides this), a **unified `activities`
timeline** (HCP scatters this), `properties` with `lat/lng` ready for mapping, MinIO/Redis
already wired in infra, and a clean schema→route→page vertical-slice methodology.

---

## 2. Per-tab gap analysis (HCP has → we lack)

Priority: **P0** = table-stakes parity, **P1** = strong differentiator/high ROI, **P2** = later.

### Schedule / Dispatch
- P0 **Drag-drop dispatch board** (UI on existing `PATCH /appointments`), color-coded by tech.
- P0 **Technician availability / working hours** + double-booking guard.
- P1 **Map view of the day's jobs** + **route optimization** (lat/lng already present).
- P1 **"On my way" / arrival-window** auto-texts; multi-tech jobs; job duration blocking.
- P2 GPS live tech tracking.

### Customers / CRM
- P0 **Tags + custom fields**; **lead source / attribution**.
- P0 **Equipment / asset tracking per property** (unit, model, serial, install date, warranty) —
  the single biggest field-service CRM feature OFP is missing.
- P1 Multiple contacts per customer; communication log (2-way SMS/email) on the timeline.
- P2 Segments, do-not-service flags, customer LTV.

### Jobs / Work orders
- P0 **Photos & attachments** (MinIO is wired; needs `attachments` table + presigned upload + UI).
- P0 **Checklists / custom job forms**; job tags; signatures.
- P1 **Job costing view** (materials vs labor vs margin — data already exists).
- P1 Job templates; per-line-item type (labor/material/discount/fee); purchase orders.
- P2 Multi-day jobs, time tracking per job (see Time Tracking).

### Estimates
- P0 **Estimate line items** (estimates currently store only a `total` — no breakdown).
- P0 **Good / Better / Best multi-option** proposals.
- P0 **E-signature + online approve** via customer portal; PDF; expiration; deposit-on-accept.
- P1 Templates; photos; financing display.

### Invoices
- P0 **PDF generation + email delivery**; **automated payment reminders** (dunning).
- P0 Deposits / partial-payment schedules; tips.
- P1 **Service plans / memberships** (recurring billing via Stripe subscriptions).
- P1 ACH; consumer financing (Wisetack-style, as a plugin); late fees; batch invoicing.
- P1 **QuickBooks / accounting sync** (plugin).

### Price Book
- P0 **Real catalog table** (`services`/`materials`): name, category, **price + cost**, markup,
  taxable, image, active — replacing the localStorage hack.
- P0 **Insert catalog item → job/estimate line item** (autocomplete).
- P1 Bundles / packages; CSV import; cost-update propagation.

### Reports
- P0 **Revenue over time** (trend charts), **AR aging**, **estimate→job→invoice conversion funnel**.
- P0 **Technician scorecards** (jobs, revenue, avg ticket, rating, close rate).
- P1 **Lead-source / marketing ROI**; per-customer LTV; **CSV/PDF export**; custom date ranges.
- P1 Commission / payroll report.

### Reviews
- P0 **Automated review request** on `job.completed` (worker hook → SMS/email with link).
- P1 Google/Facebook review deep-links + monitoring; embeddable review widget.

### Pipeline / Sales
- P0 **Drag jobs between stages** (currently read-only).
- P1 **Lead management**: follow-up tasks/reminders, won/lost reasons, sales stages distinct from
  job status.

---

## 3. Cross-cutting gaps (whole modules HCP has, OFP has no tab for)

1. **Communication hub** — 2-way SMS (Twilio) + transactional email (Resend) behind the existing
   `notify()` sink: appointment reminders, on-the-way, job-complete, estimate-sent, invoice-sent,
   payment-receipt, review-request. Templates + per-event toggles. _This is also the plugin event
   backbone (§6)._
2. **Marketing** — email campaigns, automations, postcards, Local-Services-Ads — mostly plugins.
3. **Team & Settings** — company profile, business hours, tax rates, service areas, team CRUD,
   **roles/permissions editor**, notification settings, branding. (No settings UI exists at all.)
4. **Time tracking & timesheets** — clock in/out per job → payroll export.
5. **Customer portal** — `public_token` plumbing exists; needs the actual self-service portal
   (approve estimate, pay invoice, see history, manage membership).
6. **Mobile field app depth** — take payment, photos, signatures, line-item editing, navigation
   (extend the scoped Phase-5a offline work).
7. **Integrations / App marketplace** — the **Plugin Portal** the user asked for (§6).

---

## 4. "Better, not a clone" — where OFP should leapfrog HCP

- **Open plugin architecture** (§6): a documented manifest + event bus + scoped tokens so the
  community builds connectors — vs HCP's closed, partner-gated store.
- **Profitability-first**: margin/cost is already in the schema. Make per-job, per-tech, per-
  service-type profit a headline product surface, not a hidden field.
- **AI layer** (you already run a local LLM/Brainz stack): AI estimate drafting from a job
  description, AI dispatch/route suggestions, AI review responses, AI comms drafting, demand
  forecasting. Ship these as first-party plugins so they're optional and composable.
- **Self-host + data ownership + flat pricing** — no per-seat gouging, full export.
- **Local-first / offline mobile** (already scoped) — works in basements with no signal.

---

## 5. Phased improvement roadmap

Each row is one **schema → API route → web page** vertical slice (the existing method).
Effort: **S** ≈ 1–2 d · **M** ≈ 3–5 d · **L** ≈ 1–2 wk.

### Phase A — Close the glaring parity holes (unlocks sales + field ops)
| # | Slice | Effort | Why first |
|---|---|---|---|
| 0 | **Fix `isMain` (pathToFileURL) + merge the two checkouts** | S | live stack won't boot on Windows otherwise |
| 1 | **Settings & Team module** (company, hours, tax, service areas, roles/permissions) | M | everything else needs it |
| 2 | **Attachments/Photos** (`attachments` table + presigned MinIO upload + job/customer UI) | M | infra ready; mobile already does presigned PUT |
| 3 | **Price Book catalog** (real table; replace localStorage; link to line items) | M | backs estimates & invoices |
| 4 | **Estimate line items + Good/Better/Best + e-sign + portal approve + PDF** | L | core revenue gap |

### Phase B — Communication & automation backbone (= plugin event bus)
| # | Slice | Effort |
|---|---|---|
| 5 | **Event bus + Automations engine** (typed events from `activities`; trigger→action rules) | M |
| 6 | **Comms providers** (Twilio SMS + Resend email) behind `notify()`; templates; per-event toggles | M |
| 7 | **Customer portal** (approve estimate, pay invoice, history) on existing `public_token` | M |
| 8 | **Auto review-request** on `job.completed` + Google review link | S |

### Phase C — Dispatch & field ops
| # | Slice | Effort |
|---|---|---|
| 9 | **Drag-drop dispatch board** + tech availability/color-coding | M |
| 10 | **Map view + route optimization** (first map plugin) | M |
| 11 | **Time tracking** (clock in/out → timesheets → payroll export) | M |
| 12 | **Mobile depth** (payments, photos, signatures, line items, navigation) | L |

### Phase D — Financial depth & growth
| # | Slice | Effort |
|---|---|---|
| 13 | **Invoice PDF + email + automated reminders + deposits** | M |
| 14 | **Service plans / memberships** (Stripe subscriptions; extends `recurring_jobs`) | L |
| 15 | **Reporting suite** (trends, AR aging, conversion funnel, tech scorecards, exports) | L |
| 16 | **QuickBooks sync** + **consumer financing** (both as plugins) | L |

### Phase E — Plugin Portal (the marketplace) — see §6
| # | Slice | Effort |
|---|---|---|
| 17 | Plugin SDK + manifest spec + registry + install/consent + scoped tokens + signed webhooks | L |
| 18 | Integrations page (App Store UI) — install/configure/enable/logs | M |
| 19 | First-party plugins: **Google Maps/routing, Mailchimp, Twilio, QuickBooks, CompanyCam, Zapier, Stripe(wrap)** | L |
| 20 | Developer portal (sideload, manifest validate, delivery logs, sandbox) | M |

> Phases B and E are deliberately adjacent: the **event bus built in B is the same mechanism
> plugins subscribe to in E**. Build comms as the first "internal plugin" so the portal is
> dogfooded from day one.

---

## 6. Plugin Portal — design (the headline ask)

HCP has mapping, Mailchimp, QuickBooks, CompanyCam, Zapier, etc. behind a **closed** store.
OFP's edge is an **open, documented, self-serve** one. Recommended model: **manifest +
event/webhook + scoped token** first (safe, no arbitrary code in-process), with an optional
in-process runtime later.

### 6.1 Data model (new tables)
```
plugins            -- catalog of available plugins (id, slug, name, version, author,
                      manifest_json, official bool, listed bool)
plugin_installs    -- per-org install (org_id, plugin_id, enabled, config_json,
                      secret_ref, scopes[], installed_by, installed_at)
plugin_events      -- delivery log (install_id, event, payload_hash, status,
                      attempts, last_error, delivered_at)  ← reuses BullMQ/Redis
api_tokens         -- scoped tokens (install_id, scopes[], hashed_token, expires_at)
```

### 6.2 Manifest spec (`plugin.json`)
```jsonc
{
  "id": "ofp.mailchimp",
  "name": "Mailchimp",
  "version": "1.0.0",
  "description": "Sync customers to a Mailchimp audience and trigger campaigns on events.",
  "scopes": ["customers:read", "events:subscribe"],   // consent screen on install
  "config": {                                          // JSON-Schema → auto-rendered form
    "audienceId": { "type": "string", "title": "Audience ID", "required": true }
  },
  "secrets": ["MAILCHIMP_API_KEY"],                    // stored encrypted, never returned
  "auth": { "type": "apiKey" },                        // or "oauth2"
  "events": ["customer.created", "customer.updated", "job.completed"],
  "webhook": { "url": "https://…/hooks/ofp", "sign": "hmac-sha256" },
  "ui": [                                              // optional injected surfaces
    { "slot": "settings", "title": "Mailchimp" },
    { "slot": "customer.detail.panel", "title": "Audience status" }
  ]
}
```

### 6.3 Event bus (the hooks)
Promote `activities` into a typed event stream. Canonical events:
`customer.created/updated`, `job.created/scheduled/completed`, `estimate.sent/accepted`,
`invoice.sent/paid`, `payment.received`, `appointment.scheduled/rescheduled`, `review.left`.
On each event the worker fans out to every enabled install subscribed to it → **signed
(HMAC) webhook** with retries (BullMQ already present). Plugins call back via the OFP API
using their **scoped token**. This is the Zapier-grade integration layer for free.

### 6.4 Security (maps to our trust boundaries)
- **Consent screen** on install showing requested scopes (no silent permission grants).
- **Per-install scoped tokens** (least privilege), revocable, expiring.
- **Signed webhooks** (HMAC) so plugins can verify authenticity; verify inbound too.
- **Secrets encrypted at rest**, referenced by `secret_ref`, never returned via API.
- **Webhook-only first** (no third-party code in our process). An in-process runtime
  (sandboxed worker / WASM) is a later, opt-in upgrade for official plugins only.

### 6.5 Plugin SDK (`@ofp/plugin-sdk`)
Tiny TS package: the `Manifest` type, the `OfpEvent` union, a typed `OfpClient` (scoped-token
API wrapper), HMAC verify helper, and React slot components for the web (`<PluginSlot id=…>`).
Ship the first-party plugins as packages under `plugins/` to dogfood it.

### 6.6 UI — new **"Integrations"** nav tab
Grid of available plugins (official badge), **Install → consent → config (rendered from the
JSON-Schema) → enable**, plus per-install **health/delivery logs** and secret management.
A **Developer** sub-tab to sideload a manifest, validate it, and watch delivery logs.

### 6.7 First-party plugins to ship with the portal
- **Google Maps / Mapbox** — geocode `properties`, day-map, **route optimization**, ETA texts.
- **Mailchimp** — customers→audience sync, campaign triggers (user's named example).
- **Twilio** — 2-way SMS (also powers the §3 comms hub).
- **QuickBooks Online** — invoice/payment/customer sync.
- **CompanyCam** — job photos.
- **Zapier / generic webhooks** — open the long tail.
- **Stripe** — wrap the existing checkout as a managed plugin for consistency.

---

## 7. Quick wins (first 1–2 weeks)
1. **Fix `isMain`** → live stack boots (Quick Win #0, ~10 min).
2. **Pipeline drag-drop** (the PATCH backend already exists) — visible, cheap.
3. **Auto review-request** on `job.completed` via the worker (`notify()` already pluggable).
4. **Price Book catalog table** — kills the localStorage hack, immediately useful.
5. **Attachments/photos** — MinIO is wired; mobile already does presigned PUT.

## 8. Decisions needed from you
- **Repo**: merge `~/openfieldpro-app` and `~/openfieldpro` into one canonical checkout? (They've
  diverged — the API fix lives in one, the latest features in the other.)
- **Plugin model**: confirm **webhook + scoped-token + manifest** as v1 (recommended) vs trying to
  support in-process third-party code from the start (riskier).
- **Comms providers**: Twilio (SMS) + Resend (email) as the default first-party plugins?
- **AI scope**: which AI feature first — estimate drafting, dispatch suggestions, or review/comms
  drafting? (All can ride your existing local LLM stack.)
