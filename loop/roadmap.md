# OFP-vs-HCP Roadmap

Sequence derived from `audit-matrix.md`. Each Phase ends with a section of
HCP-parity rows turning from 🔴 → 🟡 → 🟢. Each sub-chunk (Phase letter) is
**one overnight Claude Code run** — schema migration + API/UI work + tests +
typecheck green.

## Phase 5d (in flight — separate from HCP track)
- Wave 1a providers ✅ ship-ready (115/115 tests green)
- Wave 1b customer preferences (next)
- Wave 2 delivery analytics
- Wave 3 visual workflow builder

## Phase 6 — Multi-Tech & Dispatch

Goal: the surface area that makes the rest of dispatch possible. Splits:

- **6a** Multi-tech assignment schema + API
  - New `job_assignments` junction table (job_id, user_id, lead boolean)
  - Migrate `jobs.assignedTo` → back-compat alias OR keep + assignments
  - `appointmentRoutes` accepts array of technicianIds
  - +3 tests (assign, unassign, conflict check)
  - Resolves: `#3` (multi-tech), `#21` (job urgency via lead bool), lays foundation for #1, #2

- **6b** Dispatch board (read-only grid)
  - Web `/schedule` becomes a 7-day grid: rows = techs, columns = days
  - Each cell = an appointment card
  - No drag-drop yet (read-only verified parity)
  - Resolves partial: `#2` team calendar views, `#7` unscheduled inbox section

- **6c** Drag-and-drop write-back in dispatch board
  - Drag appointment card → reassign tech / re-time
  - Validate via API; emit `appointment.rescheduled` event (new event key)
  - Resolves: `#1` drag-drop, completes `#2`, lays foundation for HCP Map

## Phase 7 — Field Operations (time + GPS + mobile notes)

- **7a** Time tracking schema + API
  - New `time_entries` table (job_id, user_id, kind: clock_in/travel/arrive/clock_out, ts)
  - `POST /api/time-entries` start/stop, `GET /api/time-entries?jobId=` history
  - Resolves: `#34` time tracking, `#35` job notes (internal)

- **7b** GPS ping ingest
  - New `gps_pings` table (user_id, lat, lng, ts, accuracy)
  - Worker queue: pings from mobile (mocked via curl for v1) → store
  - `GET /api/gps/latest?userId=` for tech's last 5 pings
  - Resolves: `#5` HCP Map data path, `#32` map/gps (#36, #37)

- **7c** HR-style time-tracking report
  - Web `/reports` adds "Technician time" panel: hours per tech per week
  - Resolves partial: `#28` tech performance

## Phase 8 — Customer Portal + Agreements

- **8a** Agreements schema
  - New `agreements` table (org_id, customer_id, kind, term_start, term_end, auto_renew, billing_cycle, status)
  - `GET/POST/PATCH/DELETE /api/agreements`
  - Resolves: `#39` agreement record

- **8b** Agreement-driven recurring visits
  - Worker tick: scan agreements whose `term_start <= now <= term_end`, materialize next visit if `interval_days` elapsed since last visit
  - Resolves: `#40` recurring visits billing tied to agreement, `#41` maint schedule
  - Touchpoint: existing `recurring_jobs` shadows agreements for non-billed recurring; agreements supersede for organic customers

- **8c** Customer self-service portal depth
  - Portal `/portal/history` (estimate/invoice history)
  - `/portal/upcoming` (reschedule/cancel with reason)
  - Secure payment link from `/portal/invoices/:id` (Stripe payment intent)
  - Resolves: `#44` history view, `#45` reschedule/cancel, `#46` payment link

## Phase 9 — Growth & Admin (custom forms + QuickBooks + multi-option estimates)

- **9a** Customer custom fields + lead capture
  - New `customer_field_definitions` (org-scoped schema)
  - New `lead_forms` (public POST endpoint, JSON payload to lead record)
  - Resolves: `#12` custom fields, `#14` custom intake forms, `#23` lead capture

- **9b** Multi-option estimates
  - New `estimate_options` table (estimate_id, label, total, sort_order)
  - Migrate existing single-total estimates into one default option
  - Editor: option chips in estimate form; preview shows all options
  - Resolves: `#17` multi-option estimates, partial `#18` digital approval (signature request later in 10)

- **9c** QuickBooks foundation (OAuth token store + manual push endpoint)
  - New `qb_connections` (org_id, realm_id, access_token_ciphertext, refresh_token_ciphertext, expires_at)
  - `POST /api/integrations/quickbooks/push` for invoices (manual for v1)
  - Resolves: `#27` QuickBooks two-way (push only; pull is Phase 11)

## Phase 10 — Polish & Advanced (campaigns, AI-light, custom fields, pet-features)

- **10a** Bulk SMS/email campaign scheduler
  - New `campaigns` table + `campaign_recipients` table (audience segment)
  - Existing template+send wiring reused; queue + throttled dispatcher
  - Resolves: `#31` bulk SMS/email, partial `#30` marketing dashboard

- **10b** Custom job checklists attached to templates
  - New `template_checklists` (template_id, sort_order, label, required)
  - New `job_checklist_completions` (job_id, checklist_id, status, ts)
  - Resolves: `#19` electronic checklists, `#21` checklists (linked to template)

- **10c** Customer tagging + segmentation
  - New `customer_tags` and `tag_assignments`
  - Resolves: `#14` customer tagging (movable to 9a if it's small enough)

## Phase 11+ (out of immediate loop scope)

- E-signature, DocuSign integration
- AI assistant / chat summaries
- IVR auto-attendant
- HCP Map (live tile rendering) — gated on sufficient GPS dataset
- Mobile card reader hardware
- Multi-language / locale variants
- Customer-facing chat widget

These are gated on real ROI signals (N customers asking for a feature).

## Sequencer

```bash
./start-loop.sh --status   # see current step
./start-loop.sh --next     # run ONE step
./start-loop.sh --forever  # loop until done or fail
```

Default sequence if state.json is fresh:
1. Wave 1b — customer preferences (3-4 chunks)
2. Wave 2 — analytics (3 chunks)
3. Wave 3 — workflow builder (4 chunks)
4. Phase 6a, 6b, 6c
5. Phase 7a, 7b, 7c
6. Phase 8a, 8b, 8c
7. Phase 9a, 9b, 9c
8. Phase 10a, 10b, 10c
