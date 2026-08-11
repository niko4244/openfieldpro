export * from "./sponsors.js";
export * from "./documents.js";
export * from "./business-settings.js";
export * from "./operations.js";
export * from "./message-templates.js";

// Shared domain enums + DTO types used by api, web, and mobile.

export const JOB_STATUS = [
  "lead",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const INVOICE_STATUS = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const SERVICE_PLAN_STATUS = ["active", "paused", "canceled", "expired"] as const;
export type ServicePlanStatus = (typeof SERVICE_PLAN_STATUS)[number];

export const SERVICE_VISIT_STATUS = ["planned", "scheduled", "completed", "skipped"] as const;
export type ServiceVisitStatus = (typeof SERVICE_VISIT_STATUS)[number];

export const PORTAL_LINK_SCOPES = ["balance", "checkout", "receipts", "service_plans"] as const;
export type PortalLinkScope = (typeof PORTAL_LINK_SCOPES)[number];

export type Money = number; // cents, integer

/** Render integer cents as a dollar string. Canonical formatter for web/mobile. */
export function formatMoney(cents: Money): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface CustomerDTO {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  customerId: string;
  title: string;
  description?: string | null;
  status: JobStatus;
  scheduledAt?: string | null;
  assignedTo?: string | null;
  total: Money;
  createdAt: string;
}

export interface RecurringJobDTO {
  id: string;
  orgId: string;
  customerId: string;
  title: string;
  intervalDays: number;
  nextRunAt: string;
  active: boolean;
  rrule: string | null;
  scheduledTime: string | null;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "owner" | "dispatcher" | "technician";
  active: boolean;
  createdAt: string;
}

export interface ServicePlanDTO {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  includedVisitsPerTerm: number;
  termMonths: number;
  priceCents: Money;
  priorityScheduling: boolean;
  benefits: string[];
  active: boolean;
  createdAt: string;
}

export interface CustomerServicePlanDTO {
  id: string;
  orgId: string;
  customerId: string;
  servicePlanId: string;
  status: ServicePlanStatus;
  startsAt: string;
  renewsAt?: string | null;
  renewalReminderAt?: string | null;
  visitsIncluded: number;
  visitsCompleted: number;
  notes?: string | null;
  createdAt: string;
}

export interface ServicePlanVisitDTO {
  id: string;
  orgId: string;
  customerServicePlanId: string;
  jobId?: string | null;
  title: string;
  status: ServiceVisitStatus;
  dueAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

/** One row of the unified org/customer/job activity timeline. */
export interface ActivityDTO {
  id: string;
  customerId?: string | null;
  jobId?: string | null;
  kind: string;
  summary: string;
  createdAt: string;
}

/** Owner dashboard rollup returned by GET /api/reports/summary. */
export interface ReportSummaryDTO {
  jobsByStatus: Partial<Record<JobStatus, number>>;
  revenueCollectedCents: Money;
  accountsReceivableCents: Money;
  rating: { average: number; count: number };
  /** Gross margin sum per status (cents; negative = loss). */
  marginByStatus: Partial<Record<JobStatus, Money>>;
  /** Margin on `completed` jobs only — the realized P&L. Sign-preserving. */
  realizedMarginCents: Money;
  /** Margin on every job except `canceled` — the in-flight opportunity. */
  pipelineMarginCents: Money;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 5a — offline mobile sync. PR 1 wireformat shared by server + mobile.
// Ponytail: flat payload keeps DTO light; per-table validation happens in the
// executor (apps/api/src/sync/executor.ts) using Zod. Adding a new table = add
// a row to TABLES there. No TypeScript union gymnastics here.  Ceiling: if a
// table's row shape grows past ~30 fields, swap to typed DTOs per table.
// ──────────────────────────────────────────────────────────────────────────────

/** Tables that participate in offline sync. Source-of-truth = packages/db/src/schema.ts. */
export const SYNC_TABLES = [
  "jobs",
  "line_items",
  "invoices",
  "appointments",
  "customers",
  "estimates",
  "payments",
] as const;
export type SyncOpTable = (typeof SYNC_TABLES)[number];

export type SyncOpType = "create" | "update" | "delete";

/**
 * One mobile-originated mutation. The mobile client constructs these offline
 * from its local SQLite mirror and POSTs them to /api/sync in batches.
 */
export interface SyncOpDTO {
  /** Client-generated op id; echoed back verbatim so mobile can stitch acks. */
  opId: string;
  type: SyncOpType;
  table: SyncOpTable;
  /** Server-known entity id. For `create`, this is the client-supplied UUID
   *  (idClient on hot-path tables). For `update`/`delete`, the server fetches
   *  the row by this id. */
  entityId: string;
  /** Required for `update`/`delete`. Mobile keeps this echo from the last
   *  delta-pulse download. If the server's current version differs, the
   *  op returns `{ ok: false, conflict: { currentVersion } }`. */
  baseVersion?: number;
  /** Flat payload — keys match schema.ts column camelCase. Validated per
   *  table in the executor. */
  payload: Record<string, unknown>;
}

export interface SyncConflictDTO {
  /** Server's current version — mobile merges or shows a conflict banner. */
  currentVersion: number;
}

/**
 * Discriminated error so mobile (PR 2/3) can decide retry policy:
 *   - validation  → bad payload; mobile drops the op, surfaces a toast.
 *   - retryable   → transient DB error (deadlock, connection blip); mobile retries.
 *   - fatal       → connection lost mid-batch; mobile aborts and reconnects.
 *   - unknown     → unclassified; mobile logs and surfaces.
 */
export type SyncErrorKind = "validation" | "retryable" | "fatal" | "unknown";

export interface SyncErrorDTO {
  kind: SyncErrorKind;
  message: string;
}

export interface SyncResultDTO {
  opId: string;
  ok: boolean;
  conflict?: SyncConflictDTO;
  /** Structural error (validation / retryable / fatal / unknown). */
  error?: SyncErrorDTO;
}

export interface SyncRequestDTO {
  ops: SyncOpDTO[];
}

/** 200 OK with per-op results. Mobile iterates and acks each opId locally. */
export interface SyncResponseDTO {
  results: SyncResultDTO[];
}
