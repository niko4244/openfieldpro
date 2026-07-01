// Phase 5b: notification template content + the merge-field catalogue shared
// between the API (renderer), the worker (rendered sends), and the web editor
// (insertable tokens).

/** Channel a template targets. */
export type TemplateChannel = "email" | "sms";

/**
 * Source-of-truth tuple so the web editor (and any non-DB consumer) can list
 * channels without pulling in drizzle's pgEnum. Keep in sync with
 * `template_channel` enum in packages/db/src/schema.ts.
 */
export const TEMPLATE_CHANNELS = ["email", "sms"] as const;

/**
 * Stable event keys templates can bind to. Kept as a const tuple so the API
 * can validate in Zod. Add new entries here when the trigger engine grows.
 * ponytail: events hard-coded, not user-defined. Ceiling: when orgs want custom
 * event kinds, swap the zod enum for a `template_keys` table.
 */
export const TEMPLATE_KEYS = [
  "appointment.reminder.24h",
  "appointment.reminder.2h",
  "appointment.on_my_way",
  "invoice.created",
  "invoice.due_soon",
  "invoice.overdue",
  "invoice.paid",
  "review.request",
  "job.scheduled",
  "job.completed",
  "job.canceled",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** One template row as the web editor consumes it. */
export interface TemplateDTO {
  id: string;
  orgId: string;
  key: string;
  channel: TemplateChannel;
  name: string;
  subject: string | null;
  body: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One A/B subject variant row. When at least one variant exists for a
 * template, pickVariant() selects one of these deterministically and
 * `subject` overrides the parent TemplateDTO.subject.
 */
export interface TemplateSubjectDTO {
  id: string;
  orgId: string;
  templateId: string;
  label: string;
  weight: number;
  subject: string;
  createdAt: string;
}

/** Context the renderer expects. Every field is optional; missing -> empty. */
export interface TemplateContext {
  customer?: { name?: string; email?: string; phone?: string } | null;
  job?: {
    id?: string;
    title?: string;
    status?: string;
    scheduledAt?: string | null;
    total?: string | number | null;
  } | null;
  appointment?: {
    id?: string;
    startsAt?: string | null;
    endsAt?: string | null;
  } | null;
  invoice?: {
    id?: string;
    number?: string;
    total?: string | number | null;
    dueAt?: string | null;
  } | null;
  org?: { name?: string; timezone?: string } | null;
}

/**
 * Field catalogue. Source of truth for what merge tokens are valid; rendered
 * as an "Insert field" picker in the editor. Add a row here when handlers add
 * a new context shape.
 */
export const TEMPLATE_FIELDS: ReadonlyArray<{
  group: string;
  field: string;
  example: string;
  mustache: string;
}> = [
  { group: "Customer", field: "name", example: "Jane Smith", mustache: "{{customer.name}}" },
  { group: "Customer", field: "email", example: "jane@example.com", mustache: "{{customer.email}}" },
  { group: "Customer", field: "phone", example: "555-0101", mustache: "{{customer.phone}}" },
  { group: "Job", field: "id", example: "a1b2…", mustache: "{{job.id}}" },
  { group: "Job", field: "title", example: "AC tune-up", mustache: "{{job.title}}" },
  { group: "Job", field: "status", example: "scheduled", mustache: "{{job.status}}" },
  { group: "Job", field: "scheduledAt", example: "2026-07-04 09:00", mustache: "{{job.scheduledAt}}" },
  { group: "Job", field: "total", example: "$189.00", mustache: "{{job.total}}" },
  { group: "Appointment", field: "startsAt", example: "2026-07-04 09:00", mustache: "{{appointment.startsAt}}" },
  { group: "Appointment", field: "endsAt", example: "2026-07-04 11:00", mustache: "{{appointment.endsAt}}" },
  { group: "Invoice", field: "number", example: "INV-1042", mustache: "{{invoice.number}}" },
  { group: "Invoice", field: "total", example: "$189.00", mustache: "{{invoice.total}}" },
  { group: "Invoice", field: "dueAt", example: "2026-07-18", mustache: "{{invoice.dueAt}}" },
  { group: "Org", field: "name", example: "Acme HVAC", mustache: "{{org.name}}" },
  { group: "Org", field: "timezone", example: "America/New_York", mustache: "{{org.timezone}}" },
];

// SMS size limits (GSM-7 encoding, Twilio default). ponytail: GSM-7 only.
// Ceiling: Unicode/CJK -> UCS-2 (70 single, 67 multi). Upgrade: detect charset
// at compose time and surface a different counter.
export const SMS_SINGLE_SEGMENT_MAX = 160;
export const SMS_TWO_SEGMENT_MAX = 306; // 2 * 153
export const SMS_HARD_LIMIT = 480;     // 3 segments; anything above is too costly to send passively.

/** Standard SMS segment counts from total chars. */
export function smsSegmentCount(chars: number): number {
  if (chars <= SMS_SINGLE_SEGMENT_MAX) return 1;
  if (chars <= SMS_TWO_SEGMENT_MAX) return 2;
  return Math.ceil(chars / 153);
}

// ── A/B subject variant picker (deterministic per recipient) ──
//
// ponytail: a tiny deterministic FNV-1a hash, then `mod totalWeight`, then a
// cumulative-weight walk. Stable per `(recipientKey, templateId)` pair even
// across re-deploys and safe to import in the browser bundle. Ceiling:
// at very high QPS a fully-sql `LIMIT 1 ORDER BY md5(template_id || salt)`
// pick in Postgres avoids the worker round-trip; for v1 the in-memory pick
// is negligible (<1µs) and avoids coupling the worker to per-event queries.
//
// ponytail: interval convention is half-open `[sumSoFar, sumSoFar + weight)`.
//   A hash equal to a variant boundary lands in the NEXT variant's bucket.
//   Edge case: last variant gets its right-edge closed via a fall-through
//   so totalWeight=0 doesn't crash. Empty -> null (caller falls back).

function hashStringToU32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Pick one variant deterministically by hashing recipientKey + templateId. */
export function pickVariant(
  variants: ReadonlyArray<TemplateSubjectDTO>,
  recipientKey: string,
): TemplateSubjectDTO | null {
  // Sanitize: weight >= 1, drop empties so total > 0.
  const weighted = variants.filter((v) => v.weight > 0);
  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return null;

  const hashInput = `${recipientKey}|${weighted[0].templateId}`;
  const u32 = hashStringToU32(hashInput);
  const bucket = u32 % totalWeight;

  // Half-open intervals [cursor, cursor+weight). Because bucket is in
  // [0, totalWeight), the loop always returns for a well-formed input;
  // a defensive fall-through exists only to harden against a future
  // change that breaks the invariant above.
  let cursor = 0;
  for (const v of weighted) {
    const next = cursor + v.weight;
    if (bucket < next) return v;
    cursor = next;
  }
  return weighted[weighted.length - 1];
}
