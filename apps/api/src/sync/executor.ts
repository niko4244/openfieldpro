// Phase 5a PR 1 — sync executor.
// Pure dispatcher: takes (db, orgId, ops[]) and returns SyncResultDTO[].
// Each op runs in its own DB transaction so one bad op never poisons the
// batch. Update/delete use a version predicate so concurrent server writes
// can't slip a stale update through (race-safe against the BEFORE UPDATE
// trigger that bumps version on every column change).
//
// Race detection beyond the WHERE predicate: UPDATE and DELETE both use
// `.returning({ v: table.version })` so a 0-row outcome (someone else's
// write raced us) surfaces as `conflict` instead of `ok:true`.
//
// Version-read path uses raw SQL via `tx.execute(sql\`...\`)`. Two reasons:
//   1. The fake test rig can read the entityId directly from sql-template
//      params — no need to introspect drizzle's `eq()` internals.
//   2. Avoids dragging 7 pgTable column-types through the type system when
//      we only need `id` + `version`.
//
// Ordering for update/delete: version-check FIRST, payload parse SECOND. A
// bad payload from a buggy mobile build should still surface as `conflict`
// (mobile's newest knowledge of the row conflicts with the server's), not as
// a `validate` error that masks the actual conflict signal.
//
// Error categorization: SyncResultDTO.error is a SyncErrorDTO with `kind` so
// mobile (PR 2/3 outbox) can decide retry policy.
//
// Ponytail: per-table Zod schemas kept inline. Ceiling: if payload shapes
// grow past ~40 fields per table, split into per-table files.

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import * as dbSchema from "@ofp/db/schema";
import type {
  SyncOpDTO,
  SyncResultDTO,
  SyncOpTable,
  SyncErrorKind,
} from "@ofp/shared";

type Db = NodePgDatabase<typeof dbSchema>;

// ── helpers ──────────────────────────────────────────────────────────────────

function err(
  opId: string,
  kind: SyncErrorKind,
  message: string,
): SyncResultDTO {
  return { opId, ok: false, error: { kind, message } };
}

function conflict(opId: string, currentVersion: number): SyncResultDTO {
  return { opId, ok: false, conflict: { currentVersion } };
}

// Map low-level throwables to a SyncErrorKind. Ponytail: classification is
// conservative — unknown throws get kind=unknown so mobile logs but doesn't
// retry-loop blindly. Ceiling: real classification should look at SQLSTATE
// codes (40P01 deadlock, 40001 serialization, 08006 connection).
function classifyError(e: unknown): SyncErrorKind {
  const msg = (e as Error)?.message ?? "";
  if (!msg) return "unknown";
  if (/parse/i.test(msg)) return "validation";
  if (/deadlock|lock|serialization|conflict/i.test(msg)) return "retryable";
  if (/connection|closed|econnreset/i.test(msg)) return "fatal";
  return "unknown";
}

// Per-table payload schemas. Keys match the camelCase column accessors in
// @ofp/db/schema.ts. Fields the user can't set from mobile (id, orgId,
// version, createdAt, updatedAt) are deliberately omitted.
const JobShape = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z
    .enum(["lead", "scheduled", "in_progress", "completed", "canceled"])
    .default("lead"),
  scheduledAt: z.string().datetime().nullable().optional(),
  total: z.number().int().min(0).default(0),
  laborCostCents: z.number().int().min(0).default(0),
});

const LineItemShape = z.object({
  jobId: z.string().uuid(),
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int().min(0).default(0),
  unitCost: z.number().int().min(0).default(0),
});

const InvoiceShape = z.object({
  jobId: z.string().uuid(),
  number: z.string().min(1),
  status: z.enum(["draft", "sent", "paid", "void"]).default("draft"),
  total: z.number().int().min(0).default(0),
  dueAt: z.string().datetime().nullable().optional(),
});

const AppointmentShape = z.object({
  jobId: z.string().uuid(),
  technicianId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const CustomerShape = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const EstimateShape = z.object({
  jobId: z.string().uuid(),
  total: z.number().int().min(0).default(0),
  accepted: z.boolean().default(false),
});

const PaymentShape = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().int().min(1),
  method: z.enum(["manual", "card", "cash", "check"]).default("manual"),
  reference: z.string().nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
});

const PAYLOAD_SCHEMAS: Record<SyncOpTable, z.ZodTypeAny> = {
  jobs: JobShape,
  line_items: LineItemShape,
  invoices: InvoiceShape,
  appointments: AppointmentShape,
  customers: CustomerShape,
  estimates: EstimateShape,
  payments: PaymentShape,
};

// ponytail: tables are stored as `any` because the static type of every
// pgTable instance differs (column refs are uniqued per table). We only
// dispatch on `.insert/.update/.delete` and pull a single field across the
// sql template — losing type narrowing here is fine for a hot-loop router.
// Ceiling: if the executor needs to introspect per-table column shapes
// (e.g. to compute FK on cascade), split into per-table executors.
const TABLES: Record<SyncOpTable, any> = {
  jobs: dbSchema.jobs,
  line_items: dbSchema.lineItems,
  invoices: dbSchema.invoices,
  appointments: dbSchema.appointments,
  customers: dbSchema.customers,
  estimates: dbSchema.estimates,
  payments: dbSchema.payments,
};

export async function applyOps(
  db: Db,
  orgId: string,
  ops: SyncOpDTO[],
): Promise<SyncResultDTO[]> {
  const out: SyncResultDTO[] = [];
  for (const op of ops) {
    try {
      // Each op in its own tx so a partial failure doesn't roll back peers.
      const result = await db.transaction(async (tx) => applyOne(tx, orgId, op));
      out.push(result);
    } catch (e) {
      out.push({
        opId: op.opId,
        ok: false,
        error: {
          kind: classifyError(e),
          message: (e as Error).message ?? "unknown",
        },
      });
    }
  }
  return out;
}

async function applyOne(
  tx: unknown,
  orgId: string,
  op: SyncOpDTO,
): Promise<SyncResultDTO> {
  const table = TABLES[op.table];
  if (!table) {
    return err(op.opId, "validation", `unknown table: ${op.table}`);
  }
  // ponytail: tx is `any` to escape the generic per-table Tx type. The set
  // of methods we call on it is bounded by the call sites below.
  const x = tx as any;

  if (op.type === "create") {
    const parsed = PAYLOAD_SCHEMAS[op.table].safeParse(op.payload);
    if (!parsed.success) {
      return err(
        op.opId,
        "validation",
        "payload parse: " + (parsed.error.issues[0]?.message ?? "invalid"),
      );
    }
    await x
      .insert(table)
      .values({ id: op.entityId, orgId, ...(parsed.data as Record<string, unknown>) })
      .execute();
    return { opId: op.opId, ok: true };
  }

  if (op.type !== "update" && op.type !== "delete") {
    return err(op.opId, "validation", `unknown op.type: ${op.type}`);
  }

  if (typeof op.baseVersion !== "number") {
    return err(op.opId, "validation", "baseVersion required for update/delete");
  }

  // version-check first — so a malformed payload still surfaces the conflict.
  const { rows } = await x.execute(
    sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} LIMIT 1`,
  );
  const cur = rows[0];
  if (!cur) {
    return err(op.opId, "validation", "not found");
  }
  if (cur.version !== op.baseVersion) {
    return conflict(op.opId, cur.version);
  }

  if (op.type === "update") {
    const parsed = PAYLOAD_SCHEMAS[op.table].safeParse(op.payload);
    if (!parsed.success) {
      return err(
        op.opId,
        "validation",
        "payload parse: " + (parsed.error.issues[0]?.message ?? "invalid"),
      );
    }
    const returned = await x
      .update(table)
      .set(parsed.data as Record<string, unknown>)
      .where(
        and(eq(table.id, op.entityId), eq(table.version, op.baseVersion)),
      )
      .returning({ v: table.version });
    if (!Array.isArray(returned) || returned.length === 0) {
      // 0 rows affected: a concurrent writer beat us. Re-read to surface the
      // now-current version so mobile can present the user with the truth,
      // not a stale value. Ponytail: the second SELECT is one round-trip —
      // accept it for the correctness guarantee. Ceiling: gate by txn-level
      // SELECT FOR UPDATE later to remove the second query.
      const { rows: rows2 } = await x.execute(
        sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} LIMIT 1`,
      );
      return conflict(op.opId, rows2[0]?.version ?? op.baseVersion);
    }
    return { opId: op.opId, ok: true };
  }

  // delete: version predicate + .returning() so 0-row race surfaces honestly.
  const returned = await x
    .delete(table)
    .where(
      and(eq(table.id, op.entityId), eq(table.version, op.baseVersion)),
    )
    .returning({ v: table.version });
  if (!Array.isArray(returned) || returned.length === 0) {
    const { rows: rows2 } = await x.execute(
      sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} LIMIT 1`,
    );
    return conflict(op.opId, rows2[0]?.version ?? op.baseVersion);
  }
  return { opId: op.opId, ok: true };
}
