import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, and, asc, desc, ne, sql } from "drizzle-orm";
import { db, invoices, invoiceLineItems, payments, jobs, lineItems, orgs } from "@ofp/db";
import { mergeBusinessSettings } from "@ofp/shared";
import {
  applyPaymentWithRules,
  defaultInvoiceDueAt,
  invoiceLineTotal,
  invoiceNumber,
  invoiceSnapshotTotal,
  resolvePaymentRules,
  updateInvoiceStatus,
} from "../invoicing.js";
import { validateInvoiceCreation } from "../invoice-creation.js";
import { buildPricingSnapshot } from "../pricing.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { resolvePublicWebUrl } from "../runtime-security.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";

const createBody = z.object({ jobId: z.string().uuid(), dueAt: z.string().datetime().optional(), discountId: z.string().trim().min(1).max(80).optional() });
const statusBody = z.object({ status: z.enum(["sent", "void"]) });
const lineBody = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  unitCost: z.number().int().nonnegative().default(0),
});
const linePatchBody = lineBody.partial().refine((value) => Object.keys(value).length > 0, "at least one field is required");
const payBody = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["manual", "cash", "check", "card"]).default("manual"),
  reference: z.string().trim().max(250).optional(),
});

const checkoutRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 10 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const id = (request.params as { id?: string } | undefined)?.id ?? "unknown";
    return `${requestIpKey(request)}:${id}`;
  },
});

async function editableInvoice(orgId: string, invoiceId: string) {
  const [inv] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  if (!inv || inv.status !== "draft") return null;
  return inv;
}

async function recomputeInvoiceTotalTx(tx: Pick<typeof db, "select" | "update">, orgId: string, invoiceId: string) {
  const lines = await tx
    .select()
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, invoiceId)));
  const [invoiceRow] = await tx
    .select({ pricing: invoices.pricing })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  const [org] = await tx
    .select({ businessSettings: orgs.businessSettings })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  const settings = mergeBusinessSettings(org?.businessSettings);
  const pricing = buildPricingSnapshot(settings, invoiceLineTotal(lines), {
    taxProfileId: invoiceRow?.pricing?.taxProfileId ?? null,
    discountId: invoiceRow?.pricing?.discountId ?? null,
  });
  await tx
    .update(invoices)
    .set({ total: pricing.total, pricing, updatedAt: new Date() })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  return pricing.total;
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db.select().from(invoices).where(eq(invoices.orgId, orgId)).orderBy(desc(invoices.createdAt)).limit(t).offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    // Invoice-owned snapshot lines: the customer document never drifts with later job edits.
    const items = await db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, id)))
      .orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.createdAt));
    const paid = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, id)));
    return { ...inv, lineItems: items, payments: paid };
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-job:${parsed.data.jobId}`}))`);
      const [job] = await tx.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
      if (!job) return { kind: "not-found" as const };

      const [existing] = await tx
        .select({ id: invoices.id, number: invoices.number, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.jobId, job.id), ne(invoices.status, "void")))
        .limit(1);
      const blocked = validateInvoiceCreation(job.total, existing);
      if (blocked) return { kind: "blocked" as const, blocked };

      // Snapshot the job's current scope so the invoice owns its lines from birth.
      const sourceLines = await tx
        .select()
        .from(lineItems)
        .where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, job.id)));
      const subtotal = invoiceSnapshotTotal(sourceLines, job.total);

      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${orgId}`}))`);
      const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
      const settings = mergeBusinessSettings(org?.businessSettings);
      // Pricing snapshot: saved discount by id + the org's default tax profile.
      const pricing = buildPricingSnapshot(settings, subtotal, { discountId: parsed.data.discountId });
      const total = pricing.total;
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(eq(invoices.orgId, orgId));
      const [row] = await tx
        .insert(invoices)
        .values({
          orgId,
          jobId: job.id,
          number: invoiceNumber(count, settings.numbering.invoicePrefix, settings.numbering.invoiceNextNumber),
          status: "draft",
          total,
          pricing,
          dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : defaultInvoiceDueAt(settings.invoice.netDays),
        })
        .returning();
      if (sourceLines.length) {
        await tx.insert(invoiceLineItems).values(sourceLines.map((line, position) => ({
          orgId,
          invoiceId: row.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          position,
        })));
      }
      return { kind: "created" as const, row, job };
    });

    if (result.kind === "not-found") return reply.code(404).send({ error: "job not found" });
    if (result.kind === "blocked") return reply.code(result.blocked.statusCode).send(result.blocked.body);

    safeEmitActivity(orgId, "invoice.created", `Created invoice ${result.row.number}`, { jobId: result.job.id });
    void safeEmitEvent(orgId, "invoice.created", {
      id: result.row.id,
      number: result.row.number,
      jobId: result.job.id,
      total: result.row.total,
    });
    return reply.code(201).send(result.row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    let status;
    try {
      status = updateInvoiceStatus(existing.status, parsed.data.status);
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }

    await db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    safeEmitActivity(orgId, "invoice.status_changed", `Invoice ${existing.number} marked ${status}`, {
      jobId: existing.jobId,
    });
    void safeEmitEvent(orgId, "invoice.status_changed", {
      id,
      number: existing.number,
      jobId: existing.jobId,
      status,
    });
    return { ok: true, status };
  });

  // Invoice-owned line management. The snapshot is immutable once the invoice
  // leaves the draft state, so the customer document never drifts.
  app.post("/:id/lines", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = lineBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await editableInvoice(orgId, id))) {
      return reply.code(409).send({ error: "invoice lines can only be edited while the invoice is a draft" });
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-payment:${id}`}))`);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id));
      const [line] = await tx.insert(invoiceLineItems).values({ orgId, invoiceId: id, ...parsed.data, position: count }).returning();
      const total = await recomputeInvoiceTotalTx(tx, orgId, id);
      return { line, total };
    });
    return reply.code(201).send({ lineItem: result.line, total: result.total });
  });

  app.patch("/:id/lines/:lineId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, lineId } = req.params as { id: string; lineId: string };
    const parsed = linePatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await editableInvoice(orgId, id))) {
      return reply.code(409).send({ error: "invoice lines can only be edited while the invoice is a draft" });
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-payment:${id}`}))`);
      const [line] = await tx
        .update(invoiceLineItems)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.id, lineId)))
        .returning();
      if (!line) return null;
      const total = await recomputeInvoiceTotalTx(tx, orgId, id);
      return { line, total };
    });
    if (!result) return reply.code(404).send({ error: "line item not found" });
    return { lineItem: result.line, total: result.total };
  });

  app.delete("/:id/lines/:lineId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, lineId } = req.params as { id: string; lineId: string };
    if (!(await editableInvoice(orgId, id))) {
      return reply.code(409).send({ error: "invoice lines can only be edited while the invoice is a draft" });
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-payment:${id}`}))`);
      const [line] = await tx
        .delete(invoiceLineItems)
        .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.id, lineId)))
        .returning();
      if (!line) return null;
      const total = await recomputeInvoiceTotalTx(tx, orgId, id);
      return { total };
    });
    if (!result) return reply.code(404).send({ error: "line item not found" });
    return { ok: true, total: result.total };
  });

  app.post("/:id/pay", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = payBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-payment:${id}`}))`);
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
      if (!inv) return { kind: "not-found" as const };
      const prior = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, id)));
      const priorPaid = prior.reduce((sum, payment) => sum + payment.amount, 0);
      const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
      const rules = resolvePaymentRules(mergeBusinessSettings(org?.businessSettings));
      let applied;
      try {
        applied = applyPaymentWithRules(inv.total, priorPaid, parsed.data.amount, parsed.data.method, inv.status, rules);
      } catch (error) {
        return { kind: "invalid" as const, error: (error as Error).message };
      }
      await tx.insert(payments).values({
        orgId,
        invoiceId: id,
        amount: parsed.data.amount,
        method: parsed.data.method,
        reference: parsed.data.reference,
      });
      await tx.update(invoices).set({ status: applied.status }).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
      return { kind: "paid" as const, inv, applied };
    });

    if (result.kind === "not-found") return reply.code(404).send({ error: "not found" });
    if (result.kind === "invalid") return reply.code(400).send({ error: result.error });

    safeEmitActivity(
      orgId,
      "payment.received",
      `Received ${parsed.data.method} payment of $${(parsed.data.amount / 100).toFixed(2)} on ${result.inv.number}`,
      { jobId: result.inv.jobId },
    );
    void safeEmitEvent(orgId, "payment.received", {
      invoiceId: id,
      number: result.inv.number,
      amount: parsed.data.amount,
      method: parsed.data.method,
      status: result.applied.status,
    });
    if (result.applied.status === "paid") {
      void safeEmitEvent(orgId, "invoice.paid", {
        invoiceId: id,
        number: result.inv.number,
        total: result.inv.total,
        jobId: result.inv.jobId,
      });
    }
    return {
      status: result.applied.status,
      remaining: result.applied.remaining,
      overpaid: result.applied.overpaid,
    };
  });

  app.post("/:id/checkout", { preHandler: checkoutRateLimit }, async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const key = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !webhookSecret) {
      return reply.code(501).send({
        error: "Stripe checkout is not fully configured",
        hint: "Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, or record an offline payment.",
      });
    }

    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    if (inv.status === "paid" || inv.status === "void") {
      return reply.code(409).send({ error: `cannot create checkout for a ${inv.status} invoice` });
    }
    const prior = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, id)));
    const paid = prior.reduce((sum, payment) => sum + payment.amount, 0);
    const remaining = inv.total - paid;
    if (remaining <= 0) return reply.code(409).send({ error: "invoice has no remaining balance" });

    const webOrigin = resolvePublicWebUrl();
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `Invoice ${inv.number}` },
              unit_amount: remaining,
            },
            quantity: 1,
          },
        ],
        success_url: `${webOrigin}/invoices/${id}?paid=1`,
        cancel_url: `${webOrigin}/invoices/${id}`,
        metadata: { invoiceId: id, orgId },
      },
      { idempotencyKey: `invoice-checkout:${id}:${remaining}` },
    );
    return { url: session.url };
  });
}
