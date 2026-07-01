#!/usr/bin/env node
// decides the next step from state + roadmap. emits a small JSON object
// that generate-chunk-spec.js substitutes into the template. never blocks
// the runner: failure here means state.json is broken; fall back to a marker.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOOP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = path.join(LOOP_DIR, "state.json");

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

// Sequence list. The runner treats this as the authoritative ordered queue
// — extend as new chunks land. Phase 5d (in-flight) lives at the head to
// ride on the Wave 1a provider shipping.
const SEQUENCE = [
  // ── Phase 5d: in-flight pieces (rides on Wave 1a) ──
  { id: "5d.1b.1", phaseLabel: "Wave 1b",      stepTitle: "customer_notification_prefs table + migration 0012",         goal: "Add per-customer notification preferences table with channel opt-outs and quiet hours. Wire enum-derivation pattern. Migration + journal entry." },
  { id: "5d.1b.2", phaseLabel: "Wave 1b",      stepTitle: "automation/preferences.ts gating helpers + routes",        goal: "isChannelOptedOut + inQuietHours + shouldFire functions. /api/customers/:id/prefs GET/PATCH." },
  { id: "5d.1b.3", phaseLabel: "Wave 1b",      stepTitle: "Wire prefs gate into evaluateRulesForEvent",               goal: "Modify events.ts::evaluateRulesForEvent to insert status='skipped' with error='channel_opt_out'|'quiet_hours' BEFORE the audit claim, never calling provider.send()." },
  { id: "5d.1b.4", phaseLabel: "Wave 1b",      stepTitle: "Unsubscribe token endpoint + customer profile UI",        goal: "GET /u/:token landing + POST /u/:token/confirm flip opt-out. Customer page gets notification-prefs section + toggle UI." },

  // ── Wave 2: delivery analytics ──
  { id: "5d.2.1", phaseLabel: "Wave 2",       stepTitle: "ALTER automation_runs ADD delivery tracking columns",      goal: "provider_message_id TEXT NULL, delivered_at/opened_at/clicked_at/bounced_at TIMESTAMPTZ NULL. Migration 0013 + journal entry. Per-status named indexes." },
  { id: "5d.2.2", phaseLabel: "Wave 2",       stepTitle: "Wire evaluateRulesForEvent to record provider_message_id", goal: "After notify() success, UPDATE automation_runs SET provider_message_id = result.messageId. Throws on race idempotency path are no-ops already." },
  { id: "5d.2.3", phaseLabel: "Wave 2",       stepTitle: "Webhooks route (HMAC + per-provider parsing)",            goal: "POST /api/webhooks/inbound with body signed by SendGrid or Twilio. Verify HMAC. Match provider_message_id against automation_runs and set delivered_at/opened_at/etc." },

  // ── Wave 3: visual workflow builder ──
  { id: "5d.3.1", phaseLabel: "Wave 3",       stepTitle: "ALTER automation_rules ADD workflow_ast JSONB",           goal: "Migration 0014 nullable. Backfill no-op — existing rules keep plain eventKey/templateId columns." },
  { id: "5d.3.2", phaseLabel: "Wave 3",       stepTitle: "packages/shared/src/workflow.ts Zod AST + evaluate",       goal: "Schema for {trigger, condition: {field, op, value}, action: {channel, templateId, variantLabel?}}; condition ops: == != > < >= <= in; pure JS evaluator true/false." },
  { id: "5d.3.3", phaseLabel: "Wave 3",       stepTitle: "Wire workflowAst into rules.ts + events.ts",              goal: "PATCH /api/automation/rules/:id accepts workflowAst (Zod-validated). events.ts::evaluateRulesForEvent: if ast.condition evaluates false → insert audit 'skipped' with error='condition_failed'." },

  // ── Phase 6: Multi-Tech & Dispatch ──
  { id: "6a",      phaseLabel: "Phase 6a",    stepTitle: "Multi-tech assignment schema + API",                       goal: "New job_assignments junction table. appointmentRoutes accepts technicianIds[]. 3 tests." },
  { id: "6b",      phaseLabel: "Phase 6b",    stepTitle: "Dispatch board (read-only grid)",                          goal: "/schedule becomes 7-day grid: rows = techs, columns = days. Render-only; no drag yet." },
  { id: "6c",      phaseLabel: "Phase 6c",    stepTitle: "Drag-and-drop write-back",                                  goal: "Drag appointment card → reassign + emit appointment.rescheduled event." },

  // ── Phase 7: Field Operations ──
  { id: "7a",      phaseLabel: "Phase 7a",    stepTitle: "Time tracking schema + API",                                goal: "time_entries table + POST/GET endpoints. wire appointment.rescheduled event." },
  { id: "7b",      phaseLabel: "Phase 7b",    stepTitle: "GPS ping ingest",                                          goal: "gps_pings table + worker queue + GET latest route." },
  { id: "7c",      phaseLabel: "Phase 7c",    stepTitle: "Tech time report",                                        goal: "/reports adds \"Technician time\" panel." },

  // ── Phase 8: Portal + Agreements ──
  { id: "8a",      phaseLabel: "Phase 8a",    stepTitle: "Agreements schema + CRUD",                                  goal: "agreements table + /api/agreements routes." },
  { id: "8b",      phaseLabel: "Phase 8b",    stepTitle: "Agreement-driven visits",                                  goal: "Worker tick materializes visits from active agreements." },
  { id: "8c",      phaseLabel: "Phase 8c",    stepTitle: "Portal depth (history + reschedule + pay)",                goal: "/portal/history, /portal/upcoming, secure payment link from /portal/invoices/:id." },

  // ── Phase 9: Growth & Admin ──
  { id: "9a",      phaseLabel: "Phase 9a",    stepTitle: "Customer custom fields + lead capture",                    goal: "customer_field_definitions + lead_forms + public POST endpoint." },
  { id: "9b",      phaseLabel: "Phase 9b",    stepTitle: "Multi-option estimates",                                   goal: "estimate_options table + migrate existing totals + option chips in editor." },
  { id: "9c",      phaseLabel: "Phase 9c",    stepTitle: "QuickBooks foundation",                                    goal: "qb_connections table + /api/integrations/quickbooks/push endpoint." },

  // ── Phase 10: Polish & Advanced ──
  { id: "10a",     phaseLabel: "Phase 10a",   stepTitle: "Bulk campaign scheduler",                                  goal: "campaigns + campaign_recipients + throttled dispatcher." },
  { id: "10b",     phaseLabel: "Phase 10b",   stepTitle: "Custom job checklists",                                    goal: "template_checklists + job_checklist_completions." },
  { id: "10c",     phaseLabel: "Phase 10c",   stepTitle: "Customer tagging + segmentation",                           goal: "customer_tags + tag_assignments." },
];

const r = process.argv[2] || false;        // --reason dry flag
const pending = SEQUENCE.find((s) => !state.history.some((h) => h.id === s.id && h.status === "success"));
if (!pending) {
  console.log(JSON.stringify({ done: true, history: state.history.length }));
  process.exit(0);
}
const out = {
  id: pending.id,
  phaseLabel: pending.phaseLabel,
  stepTitle: pending.stepTitle,
  goal: pending.goal,
};
console.log(JSON.stringify(out, null, 2));
if (r === "--reason") process.exit(0);
