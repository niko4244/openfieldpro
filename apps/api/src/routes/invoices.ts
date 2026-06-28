import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, invoices, payments, jobs, lineItems, invoiceTemplates } from "@ofp/db";
import { applyPayment, invoiceNumber } from "../invoicing.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

const createBody = z.object({ jobId: z.string().uuid(), dueAt: z.string().datetime().optional(), poNumber: z.string().optional() });
const payBody = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["manual", "cash", "check", "card"]).default("manual"),
  reference: z.string().optional(),
});

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

function invoiceMath(input: { subtotal: number; discountCents: number; taxRateBps: number }) {
  const discount = Math.min(input.discountCents, input.subtotal);
  const taxable = Math.max(input.subtotal - discount, 0);
  const tax = Math.round((taxable * input.taxRateBps) / 10000);
  return { discount, tax, total: taxable + tax };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function invoiceStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(invoices).where(eq(invoices.orgId, orgId)).orderBy(desc(invoices.createdAt));
  });

  app.get("/export.csv", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(invoices).where(eq(invoices.orgId, orgId)).orderBy(desc(invoices.createdAt));
    const paidRows = await db.select().from(payments).where(eq(payments.orgId, orgId));
    const paidByInvoice = new Map<string, number>();
    for (const payment of paidRows) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
    const header = ["number", "status", "po_number", "total_cents", "paid_cents", "balance_cents", "due_at", "last_sent_at", "created_at"];
    const body = rows.map((invoice) => {
      const paid = paidByInvoice.get(invoice.id) ?? 0;
      return [
        invoice.number,
        invoiceStatusLabel(invoice.status),
        invoice.poNumber ?? "",
        invoice.total,
        paid,
        Math.max(invoice.total - paid, 0),
        invoice.dueAt?.toISOString() ?? "",
        invoice.lastSentAt?.toISOString() ?? "",
        invoice.createdAt.toISOString(),
      ].map(csvCell).join(",");
    });
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=ofp-invoices.csv");
    return [header.map(csvCell).join(","), ...body].join("\n");
  });

  app.get("/:id/reminder-plan", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).limit(1);
    const terms = template?.paymentTerms ?? "Due on receipt";
    const schedule = [0, 3, 7, 14].map((daysAfterDue) => ({
      daysAfterDue,
      channel: "email",
      message: daysAfterDue === 0 ? "Invoice due today" : `Invoice overdue by ${daysAfterDue} days`,
      enabled: inv.status === "sent" && Boolean(inv.dueAt),
    }));
    return { invoiceId: inv.id, number: inv.number, status: inv.status, dueAt: inv.dueAt, terms, schedule };
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    const items = await db.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, inv.jobId)));
    const paid = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, id)));
    return { ...inv, lineItems: items, payments: paid };
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.orgId, orgId));

    const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).limit(1);
    const items = await db.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, job.id)));
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) || job.total;
    const taxRateBps = template?.defaultTaxRateBps ?? 0;
    const discountCents = template?.defaultDiscountCents ?? 0;
    const math = invoiceMath({ subtotal, taxRateBps, discountCents });
    const prefix = template?.invoicePrefix ?? "INV";

    const [row] = await db
      .insert(invoices)
      .values({
        orgId,
        jobId: job.id,
        number: `${prefix}-${String(count + 1).padStart(4, "0")}`,
        poNumber: parsed.data.poNumber ?? null,
        status: "draft",
        total: math.total,
        taxRateBps,
        discountCents: math.discount,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      })
      .returning();
    safeEmitActivity(orgId, "invoice.created", `Created invoice ${row.number}`, { jobId: job.id });
    return reply.code(201).send(row);
  });

  app.post("/:id/send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    if (inv.status === "void" || inv.status === "paid") return reply.code(400).send({ error: `cannot send ${inv.status} invoice` });
    const [row] = await db
      .update(invoices)
      .set({ status: "sent", lastSentAt: new Date() })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .returning();
    safeEmitActivity(orgId, "invoice.sent", `Sent invoice ${row.number}`, { jobId: row.jobId });
    return row;
  });

  app.post("/:id/pay", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = payBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });

    const prior = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, id)));
    const priorPaid = prior.reduce((a, p) => a + p.amount, 0);

    let result;
    try {
      result = applyPayment(inv.total, priorPaid, parsed.data.amount, inv.status);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }

    await db.insert(payments).values({
      orgId,
      invoiceId: id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference,
    });
    await db.update(invoices).set({ status: result.status }).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    safeEmitActivity(
      orgId,
      "payment.received",
      `Received ${parsed.data.method} payment of $${(parsed.data.amount / 100).toFixed(2)} on ${inv.number}`,
      { jobId: inv.jobId },
    );
    return { status: result.status, remaining: result.remaining, overpaid: result.overpaid };
  });

  app.post("/:id/checkout", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return reply.code(501).send({
        error: "Stripe not configured",
        hint: "Set STRIPE_SECRET_KEY in .env, or use POST /:id/pay to record an offline payment.",
      });
    }
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const origin = publicAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Invoice ${inv.number}` },
            unit_amount: inv.total,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/invoices/${id}?paid=1`,
      cancel_url: `${origin}/invoices/${id}`,
      metadata: { invoiceId: id, orgId },
    });
    return { url: session.url };
  });
}
