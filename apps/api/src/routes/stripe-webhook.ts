import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, invoices, payments } from "@ofp/db";
import { applyPayment } from "../invoicing.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitDomainEvent } from "../lib/events.js";

// Encapsulated plugin: registers a RAW body parser scoped to just this route so
// Stripe signature verification works, without changing JSON parsing elsewhere.
// Gated on STRIPE_WEBHOOK_SECRET — does nothing if unconfigured.
export async function stripeWebhookRoute(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body); // keep the raw Buffer for signature verification
  });

  app.post("/stripe/webhook", async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) return reply.code(501).send({ error: "Stripe webhook not configured" });

    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") return reply.code(400).send({ error: "missing signature" });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
    } catch (e) {
      return reply.code(400).send({ error: `signature verification failed: ${(e as Error).message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id?: string;
        metadata?: { invoiceId?: string; orgId?: string };
        amount_total?: number;
      };
      const invoiceId = session.metadata?.invoiceId;
      const orgId = session.metadata?.orgId;
      if (invoiceId && orgId && session.amount_total && session.amount_total > 0) {
        const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
        // Belt-and-braces: the metadata orgId must match the invoice's org.
        if (inv && inv.orgId === orgId && inv.status !== "void") {
          const prior = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
          const priorPaid = prior.reduce((a, p) => a + p.amount, 0);
          const result = applyPayment(inv.total, priorPaid, session.amount_total, inv.status);

          // Idempotency: Stripe retries deliveries. The partial unique index
          // payments_card_reference_idx (method='card', reference not null)
          // turns a redelivered session into a 0-row no-op — no double-counted
          // revenue, no status churn, and no 500 back to Stripe.
          const inserted = await db
            .insert(payments)
            .values({
              orgId: inv.orgId,
              invoiceId,
              amount: session.amount_total,
              method: "card",
              reference: session.id ?? event.id,
            })
            // Bare ON CONFLICT DO NOTHING: matches the partial unique index
            // without restating its WHERE predicate as a conflict target.
            .onConflictDoNothing()
            .returning({ id: payments.id });

          if (inserted.length > 0) {
            await db.update(invoices).set({ status: result.status }).where(eq(invoices.id, invoiceId));
            // Mirror the manual /pay path so automations and accounting/CRM
            // plugins fire for online card payments too.
            safeEmitActivity(
              inv.orgId,
              "payment.received",
              `Received card payment of $${(session.amount_total / 100).toFixed(2)} on ${inv.number}`,
              { jobId: inv.jobId },
            );
            void safeEmitDomainEvent({
              orgId: inv.orgId,
              key: "payment.received",
              occurredAt: new Date().toISOString(),
              payload: {
                invoiceId,
                number: inv.number,
                amount: session.amount_total,
                method: "card",
                status: result.status,
              },
            });
            if (result.status === "paid") {
              void safeEmitDomainEvent({
                orgId: inv.orgId,
                key: "invoice.paid",
                occurredAt: new Date().toISOString(),
                payload: { invoiceId, number: inv.number, total: inv.total, jobId: inv.jobId },
              });
            }
          }
        }
      }
    }
    return { received: true };
  });
}
