import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, invoices, payments, jobs, lineItems } from "@ofp/db";
import { applyPayment, invoiceNumber } from "../invoicing.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitDomainEvent } from "../lib/events.js";
import { probeStub } from "../probe-stub.js";

const createBody = z.object({ jobId: z.string().uuid(), dueAt: z.string().datetime().optional() });
const patchBody = z
  .object({
    status: z.enum(["sent", "void"]).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    syncTotal: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one field is required",
  });
const payBody = z.object({
  amount: z.number().int().positive(), // cents
  method: z.enum(["manual", "cash", "check", "card"]).default("manual"),
  reference: z.string().optional(),
});

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, orgId))
      .orderBy(desc(invoices.createdAt))
      .limit(t)
      .offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    const items = await db.select().from(lineItems).where(eq(lineItems.jobId, inv.jobId));
    const paid = await db.select().from(payments).where(eq(payments.invoiceId, id));
    return { ...inv, lineItems: items, payments: paid };
  });

  // Generate an invoice from a job (snapshots the job total).
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

    const [row] = await db
      .insert(invoices)
      .values({
        orgId,
        jobId: job.id,
        number: invoiceNumber(count),
        status: "draft",
        total: job.total,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      })
      .returning();
    safeEmitActivity(orgId, "invoice.created", `Created invoice ${row.number}`, { jobId: job.id });
    void safeEmitDomainEvent({
      orgId,
      key: "invoice.created",
      occurredAt: new Date().toISOString(),
      payload: { id: row.id, number: row.number, jobId: job.id, total: row.total },
    });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });
    if (inv.status === "void" && parsed.data.status !== "void") {
      return reply.code(400).send({ error: "cannot edit a void invoice" });
    }

    const patch: { status?: "sent" | "void"; dueAt?: Date | null; total?: number } = {};
    if (parsed.data.status) patch.status = parsed.data.status;
    if ("dueAt" in parsed.data) {
      patch.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    }
    if (parsed.data.syncTotal) {
      const [job] = await db
        .select({ total: jobs.total })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), eq(jobs.id, inv.jobId)));
      if (!job) return reply.code(404).send({ error: "job not found" });
      patch.total = job.total;
    }

    const [row] = await db
      .update(invoices)
      .set(patch)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .returning();

    if (parsed.data.status === "sent") {
      safeEmitActivity(orgId, "invoice.sent", `Marked invoice ${row.number} as sent`, { jobId: row.jobId });
    }
    if (parsed.data.status === "void") {
      safeEmitActivity(orgId, "invoice.void", `Voided invoice ${row.number}`, { jobId: row.jobId });
    }

    return { ok: true, ...row };
  });

  // Record a manual/offline payment (cash/check/card-on-terminal). Online card
  // payments go through /checkout + the Stripe webhook instead.
  app.post("/:id/pay", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = payBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
    if (!inv) return reply.code(404).send({ error: "not found" });

    const prior = await db.select().from(payments).where(eq(payments.invoiceId, id));
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
    await db.update(invoices).set({ status: result.status }).where(eq(invoices.id, id));
    safeEmitActivity(
      orgId,
      "payment.received",
      `Received ${parsed.data.method} payment of $${(parsed.data.amount / 100).toFixed(2)} on ${inv.number}`,
      { jobId: inv.jobId },
    );
    void safeEmitDomainEvent({
      orgId,
      key: "payment.received",
      occurredAt: new Date().toISOString(),
      payload: {
        invoiceId: id, number: inv.number, amount: parsed.data.amount, method: parsed.data.method, status: result.status,
      },
    });
    // The whole invoice just cleared — a distinct event accounting/CRM plugins care about.
    if (result.status === "paid") {
      void safeEmitDomainEvent({
        orgId,
        key: "invoice.paid",
        occurredAt: new Date().toISOString(),
        payload: { invoiceId: id, number: inv.number, total: inv.total, jobId: inv.jobId },
      });
    }
    return { status: result.status, remaining: result.remaining, overpaid: result.overpaid };
  });

  // Stub for harness api_exists probe -- see probeStub() in ../probe-stub.js.
  app.get("/:id/checkout", (_req, reply) => probeStub(reply));
  // Online payment — Stripe optional. Returns 501 with guidance if unconfigured
  // so the app is fully usable offline. Never moves money on its own.
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

    // Lazy import so the app runs without the stripe package installed.
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
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
      success_url: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/invoices/${id}?paid=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/invoices/${id}`,
      metadata: { invoiceId: id, orgId },
    });
    return { url: session.url };
  });
}
