// Phase 5c: trigger engine (Decision 4 in templates ADR).
//
// Domain code calls `safeEmitDomainEvent` at meaningful moments (invoice paid,
// appointment created, …). The helper does THREE things in order:
//   1. fans the event to subscribed plugin installs via safeEmitEvent
//      (apps/api/src/plugins/bus.ts);
//   2. records a row in `automation_events` with a deterministic event_id
//      so retries hit the idempotency unique index (org_id, event_id);
//   3. immediately evaluates every enabled rule in the (org, key) tuple —
//      each rule fetches its template, renders with the API's preview path
//      so A/B variant picks work, then writes an `automation_runs` audit row.
//
// The event_id is sha256 of (orgId | key | occurredAt | canonicalized
// payload). Same content + same instant = same id; replays are safe.
//
// ponytail: per-rule evaluation is inline so writes are zero-latency. The
//   worker tick (`apps/worker/src/tick.ts`) covers the failure case: rows
//   that landed in `automation_events` with status='pending' get retried on
//   the next 60s tick.  Ceiling:  heavy orgs (hundreds of rules per kind)
//   should run the evaluate block on the worker too — at the v1 volume a
//   single event matches a handful of rules and the whole evaluation is
//   sub-100ms.
//
// Race-resilience (decision from review): for each rule we INSERT the
// automation_runs audit row FIRST (best-case status='fired'), then call
// notify(). If notify throws, we UPDATE the row to status='failed'. The
// upsert uses onConflictDoNothing on (rule_id, event_id) so a retry of
// the same event -- either from the inline path racing the tick, or from
// a partial-failure recovery -- sees zero rows returned and skips with
// skipped++.  This guarantees notify() fires at MOST once per (rule, event).
import { createHash } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import {
  db,
  automationEvents,
  automationRules,
  automationRuns,
  templates,
  templateSubjects,
  orgs,
  jobs,
  customers,
  invoices,
  appointments,
  type AutomationRunStatus,
} from "@ofp/db";
import { safeEmitEvent } from "../plugins/bus.js";
import { previewTemplate } from "./templates.js";
import { resolvePlan } from "./license.js";
import { notify } from "./notify.js";
import { formatMoney, type TemplateContext, type TemplateSubjectDTO } from "@ofp/shared";

// ponytail: event keys kept in lock-step with the EVENT_KEYS const in
//   routes/automation.ts. Add a new entry on both sides when a new kind is
//   born.  Ceiling: when orgs want custom event types, swap for an enum table.
export type EventKey =
  | "appointment.created"
  | "appointment.scheduled"
  | "invoice.created"
  | "invoice.paid"
  | "payment.received"
  | "job.scheduled"
  | "job.completed"
  | "job.canceled"
  | "review.request"
  // Phase 7: emitted by POST /api/tech/location + /api/tech/status so dispatchers
  // can subscribe to "tech went offline" / "tech went live" via the plugin bus.
  // Keep this in lock-step with routes/automation.ts EVENT_KEYS if we ever host
  // it there \u2014 today it's local to events.ts and has no sibling listing.
  | "tech.location.updated";

/** Domain event envelope. `payload` is anything the rule's template can render. */
export interface EventEnvelope {
  orgId: string;
  key: EventKey;
  occurredAt: string; // ISO 8601
  payload: Record<string, unknown>;
}

export interface EmitResult {
  eventId: string;
  fired: number;
  failed: number;
  skipped: number;
}

/**
 * Canonicalize a payload for hashing: sort own-keys recursively with
 * stable types so JSON.stringify yields the same string for equivalent
 * inputs out of node fetch / fetch-shim orderings.
 *
 * ponytail: keeps the dedup deterministic across language parity, but is
 *   naive about cycles, Date objects, and bigints. For v1 the emit sites
 *   only use plain object payloads (customer, job, appointment shapes)
 *   so a recursive key-sort is enough; an exhaustive JSON canonicalization
 *   is out of scope.
 */
export function canonicalizeForHash(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) {
    out[k] = canonicalizeForHash((value as Record<string, unknown>)[k]);
  }
  return out;
}

/**
 * Deterministic id for an event envelope. Two emitters sending the same
 * shape at the same instant collapse to the same id; the unique index on
 * (org_id, event_id) keeps replays from firing twice.
 */
export function eventIdFor(env: {
  orgId: string;
  key: string;
  occurredAt: string;
  payload: unknown;
}): string {
  const stable = JSON.stringify({
    orgId: env.orgId,
    key: env.key,
    occurredAt: env.occurredAt,
    payload: canonicalizeForHash(env.payload),
  });
  return createHash("sha256")
    .update(`ofp-event|${stable}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Channel-stable recipient-key derivation for A/B variant pick. Mirrors
 * apps/worker/src/notify.ts::recipientKeyFor — keep them in step; if the
 * repo grows a 3rd caller, hoist to @ofp/shared.
 *
 * ponytail: customer.email/phone is the natural key, but a customer
 *   correcting an email typo will flip variants; acceptable for v1.
 *   Ceiling: derive from customer.id for absolute stability.
 */
export function recipientKeyFor(
  channel: "email" | "sms",
  payload: unknown,
): string {
  const p = (payload ?? {}) as {
    customer?: { email?: string; phone?: string } | null;
    job?: { id?: string } | null;
  };
  const customer = p.customer ?? null;
  if (channel === "email") {
    if (customer?.email) return `email:${customer.email.toLowerCase()}`;
    if (p.job?.id) return `email-noid:job:${p.job.id}`;
    return "preview-email";
  }
  if (customer?.phone) return `phone:${customer.phone}`;
  if (p.job?.id) return `sms-noid:job:${p.job.id}`;
  return "preview-sms";
}

/**
 * Internal: write a row in automation_events with the deterministic id.
 * Collisions on (org_id, event_id) are silently swallowed (race between two
 * callers emitting the same instant — the second one already saw the row).
 */
async function recordEvent(env: EventEnvelope): Promise<string> {
  const eventId = eventIdFor(env);
  try {
    await db.insert(automationEvents).values({
      orgId: env.orgId,
      eventId,
      key: env.key,
      occurredAt: new Date(env.occurredAt),
      payload: env.payload,
      status: "pending",
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!msg.includes("automation_events_org_event_idx")) throw e;
  }
  return eventId;
}

/**
 * Internal: evaluate every enabled rule subscribing to env.key. Each rule
 * reserves an automation_runs audit row BEFORE notify (best-case
 * status='fired') using onConflictDoNothing so retries from the tick path
 * or a partial-failure recovery skip with skipped++. notify() then runs
 * with at-most-once semantics; on notify-throws we UPDATE the audit row
 * to status='failed' with the error message.
 */
/**
 * Hydrate a flat event payload into the nested TemplateContext the renderer
 * expects, by resolving ids against the DB. Emitters send thin envelopes
 * ({ id, jobId, total }); templates want {{customer.name}} / {{invoice.total}}.
 * By event-key convention `payload.id` is the key's noun ("invoice.created"
 * -> id is the invoice id). Every lookup is org-scoped; anything missing just
 * renders as an empty field, same as before.
 */
export async function buildTemplateContext(env: EventEnvelope): Promise<TemplateContext> {
  const p = env.payload as Record<string, unknown>;
  const noun = env.key.split(".")[0];
  const ctx: TemplateContext = {};

  const [org] = await db
    .select({
      name: orgs.name,
      timezone: orgs.timezone,
      plan: orgs.plan,
      licenseKey: orgs.licenseKey,
    })
    .from(orgs)
    .where(eq(orgs.id, env.orgId));
  if (org) {
    // Effective plan: a lapsed annual key re-brands emails as free, locally.
    const plan = org.licenseKey ? resolvePlan(org.licenseKey).plan : org.plan;
    ctx.org = { name: org.name, timezone: org.timezone, plan };
  }
  const tz = org?.timezone ?? "America/New_York";
  const fmtWhen = (d: Date | null): string | null =>
    d ? d.toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : null;

  const asId = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const invoiceId = asId(noun === "invoice" ? p.id : p.invoiceId);
  const appointmentId = asId(noun === "appointment" ? p.id : p.appointmentId);
  let jobId = asId(noun === "job" ? p.id : p.jobId);

  if (invoiceId) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, env.orgId), eq(invoices.id, invoiceId)));
    if (inv) {
      ctx.invoice = {
        id: inv.id,
        number: inv.number,
        total: formatMoney(inv.total),
        dueAt: inv.dueAt ? fmtWhen(inv.dueAt) : null,
      };
      jobId = jobId ?? inv.jobId;
    }
  }

  if (appointmentId) {
    const [appt] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.orgId, env.orgId), eq(appointments.id, appointmentId)));
    if (appt) {
      ctx.appointment = {
        id: appt.id,
        startsAt: fmtWhen(appt.startsAt),
        endsAt: fmtWhen(appt.endsAt),
      };
      jobId = jobId ?? appt.jobId;
    }
  }

  if (jobId) {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, env.orgId), eq(jobs.id, jobId)));
    if (job) {
      ctx.job = {
        id: job.id,
        title: job.title,
        status: job.status,
        scheduledAt: fmtWhen(job.scheduledAt),
        total: formatMoney(job.total),
      };
      const [cust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.orgId, env.orgId), eq(customers.id, job.customerId)));
      if (cust) {
        ctx.customer = {
          name: cust.name,
          email: cust.email ?? undefined,
          phone: cust.phone ?? undefined,
        };
      }
    }
  }

  return ctx;
}

async function evaluateRulesForEvent(
  env: EventEnvelope,
  eventId: string,
): Promise<{ fired: number; failed: number; skipped: number }> {
  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.orgId, env.orgId),
        eq(automationRules.eventKey, env.key),
        eq(automationRules.enabled, true),
      ),
    );

  let fired = 0;
  let failed = 0;
  let skipped = 0;
  if (rules.length === 0) return { fired, failed, skipped };

  // Real recipient data for the merge fields — never the preview sample.
  const ctx = await buildTemplateContext(env);

  for (const rule of rules) {
    const [tpl] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, rule.templateId))
      .limit(1);
    if (!tpl || !tpl.enabled || tpl.orgId !== env.orgId) {
      await db
        .insert(automationRuns)
        .values({
          orgId: env.orgId,
          ruleId: rule.id,
          eventId,
          eventKey: env.key,
          status: "skipped",
          variantLabel: null,
          error: tpl ? "template disabled" : "template not found",
        })
        .onConflictDoNothing({
          target: [automationRuns.ruleId, automationRuns.eventId],
        });
      skipped++;
      continue;
    }

    // A/B variants for email channel only.
    let variants: ReadonlyArray<TemplateSubjectDTO> | undefined = [];
    if (rule.channel === "email") {
      const rows = await db
        .select()
        .from(templateSubjects)
        .where(eq(templateSubjects.templateId, tpl.id));
      variants = rows.map((v) => ({
        id: v.id,
        orgId: v.orgId,
        templateId: v.templateId,
        label: v.label,
        weight: v.weight,
        subject: v.subject,
        createdAt: v.createdAt.toISOString(),
      }));
    }

    const rendered = previewTemplate(
      tpl,
      {
        variants,
        variantLabel: null,
        // Hydrated ctx preferred: it has customer email/phone even when the
        // thin event payload didn't carry them.
        recipientKey: recipientKeyFor(rule.channel, {
          customer: ctx.customer ?? (env.payload as { customer?: { email?: string; phone?: string } }).customer,
          job: ctx.job ?? (env.payload as { job?: { id?: string } }).job,
        }),
      },
      ctx,
    );

    // Reserve the audit row FIRST. onConflictDoNothing makes this safe for
    // concurrent evaluators + tick retries: if a row already exists for
    // (rule_id, event_id), .returning() comes back empty, and we
    // skipped++ and move on without firing notify a second time.
    //
    // Status 'pending' is honest: "claimed for evaluation, notify not yet
    // run". On notify success we leave status='fired'; on notify failure
    // we UPDATE to 'failed' with the error message. Reads filtering on
    // status='fired' see only real, completed fires.
    const reserved = await db
      .insert(automationRuns)
      .values({
        orgId: env.orgId,
        ruleId: rule.id,
        eventId,
        eventKey: env.key,
        status: "pending",
        variantLabel: rendered.variant ?? null,
        error: null,
      })
      .onConflictDoNothing({
        target: [automationRuns.ruleId, automationRuns.eventId],
      })
      .returning({ id: automationRuns.id });

    if (reserved.length === 0) {
      skipped++;
      continue;
    }

    const auditId = reserved[0].id;
    let finalStatus: AutomationRunStatus = "fired";
    let error: string | null = null;
    try {
      await notify(rendered.subject, rendered.body);
      fired++;
    } catch (e) {
      finalStatus = "failed";
      error = (e as Error).message;
      failed++;
    }

    // Always flip the reserved row to its terminal status — success included.
    // (Leaving successful rows at 'pending' made the Automation tab show
    // every fire as stuck.)
    await db
      .update(automationRuns)
      .set({ status: finalStatus, error })
      .where(eq(automationRuns.id, auditId));
  }
  return { fired, failed, skipped };
}

/** Evaluate every enabled rule subscribing to env.key. Used by routes
 * that do NOT want to call the full safeEmitDomainEvent (e.g. admin
 * backfills). Always-side-effect: callers should void-prefix.
 *
 * Returns the same shape as the inline path in safeEmitDomainEvent.
 */
export async function evaluateRulesInline(env: EventEnvelope): Promise<EmitResult> {
  const eventId = await recordEvent(env);
  const { fired, failed, skipped } = await evaluateRulesForEvent(env, eventId);
  // Mark the journal row terminal so the tick doesn't retry it.
  await db
    .update(automationEvents)
    .set({ status: "processed", lastAttemptAt: new Date() })
    .where(
      and(
        eq(automationEvents.orgId, env.orgId),
        eq(automationEvents.eventId, eventId),
      ),
    );
  return { eventId, fired, failed, skipped };
}

/**
 * High-level entry point. Chain of effects:
 *   1. fanout to plugin installs (existing behavior, unchanged)
 *   2. journal the event (idempotent on collission)
 *   3. evaluate rules inline for zero-latency A/B notify
 *   4. mark the journal terminal so the tick skips this event
 *
 * Never throws — a flaky third-party webhook must not break the request
 * path that triggered the domain event.
 */
export async function safeEmitDomainEvent(
  env: EventEnvelope,
): Promise<EmitResult | null> {
  try {
    await safeEmitEvent(env.orgId, env.key, env.payload);
    return await evaluateRulesInline(env);
  } catch (err) {
    console.error(
      `[automation] emit failed (kind=${env.key}, org=${env.orgId}):`,
      err,
    );
    return null;
  }
}

/**
 * Worker-tick handler. Reads `automation_events.status='pending'` older than
 * `minAgeMs` (default 30s — gives the inline path time to mark processed)
 * and re-runs the evaluation. Idempotent because the per-rule upsert in
 * evaluateRulesForEvent uses onConflictDoNothing on
 * (rule_id, event_id) — a re-fired tick skips with skipped++.
 *
 * ponytail: the SELECT pulls a bounded batch so a backlog spike doesn't
 *   flood the worker.  v1: 200 rows / tick.  Ceiling: pull from a
 *   dedicated worker-claim pattern (SELECT FOR UPDATE SKIP LOCKED) once
 *   multiple workers run.
 */
export async function processPendingEvents(
  now: Date = new Date(),
  opts: { limit?: number; minAgeMs?: number } = {},
): Promise<{ processed: number; fired: number; failed: number; skipped: number }> {
  const limit = opts.limit ?? 200;
  const minAgeMs = opts.minAgeMs ?? 30_000;
  const cutoff = new Date(now.getTime() - minAgeMs);

  const pending = await db
    .select()
    .from(automationEvents)
    .where(
      and(
        eq(automationEvents.status, "pending"),
        lte(automationEvents.occurredAt, cutoff),
      ),
    )
    .limit(limit);

  let processed = 0;
  let fired = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    const env: EventEnvelope = {
      orgId: row.orgId,
      key: row.key as EventKey,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    };
    const outcome = await evaluateRulesForEvent(env, row.eventId);
    processed++;
    fired += outcome.fired;
    failed += outcome.failed;
    skipped += outcome.skipped;
    if (outcome.failed === 0) {
      await db
        .update(automationEvents)
        .set({ status: "processed", lastAttemptAt: now })
        .where(
          and(
            eq(automationEvents.orgId, row.orgId),
            eq(automationEvents.eventId, row.eventId),
          ),
        );
    } else {
      // Keep status='pending' so the NEXT tick retries.
      await db
        .update(automationEvents)
        .set({ lastAttemptAt: now })
        .where(
          and(
            eq(automationEvents.orgId, row.orgId),
            eq(automationEvents.eventId, row.eventId),
          ),
        );
    }
  }
  return { processed, fired, failed, skipped };
}
