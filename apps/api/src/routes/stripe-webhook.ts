import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db, invoices, payments, stripeWebhookEvents } from "@ofp/db";
import { applyPayment, isDuplicatePayment, paymentIdentity } from "../invoicing.js";
import { checkoutSessionPaymentCommand, validateCheckoutSessionCommand } from "../stripe-webhook-logic.js";

// Encapsulated plugin: registers a RAW body parser scoped to just this route so
// Stripe signature verification works, without changing JSON parsing elsewhere.
// Gated on STRIPE_WEBHOOK_SECRET — returns 501 if unconfigured.
export async function stripeWebhookRoute(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
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

    const [existingEvent] = await db.select().from(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id));
    if (existingEvent?.status === "processed") return { received: true, duplicate: true };

    if (!existingEvent) {
      await db.insert(stripeWebhookEvents).values({
        eventId: event.id,
        eventType: event.type,
        status: "received",
      });
    }

    if (event.type !== "checkout.session.completed") {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "ignored", processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
      return { received: true, ignored: true };
    }

    const command = checkoutSessionPaymentCommand(event.id, event.data.object as Parameters<typeof checkoutSessionPaymentCommand>[1]);
    const validationError = validateCheckoutSessionCommand(command);
    if (validationError) {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "failed", error: validationError, processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
      return reply.code(400).send({ error: validationError });
    }

    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, command.orgId!), eq(invoices.id, command.invoiceId!)));
    if (!inv) {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "failed", orgId: command.orgId!, invoiceId: command.invoiceId!, error: "invoice not found", processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
      return reply.code(404).send({ error: "invoice not found" });
    }

    const prior = await db.select().from(payments).where(and(eq(payments.orgId, command.orgId!), eq(payments.invoiceId, command.invoiceId!)));
    const priorPaid = prior.reduce((a, p) => a + p.amount, 0);
    if (isDuplicatePayment(command, prior)) {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "processed", orgId: command.orgId!, invoiceId: command.invoiceId!, processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
      return { received: true, duplicate: true };
    }

    let result;
    try {
      result = applyPayment(inv.total, priorPaid, command.amount, inv.status);
    } catch (e) {
      const error = (e as Error).message;
      await db
        .update(stripeWebhookEvents)
        .set({ status: "failed", orgId: command.orgId!, invoiceId: command.invoiceId!, error, processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
      return reply.code(400).send({ error });
    }

    const identity = paymentIdentity(command);
    await db.insert(payments).values({
      orgId: command.orgId!,
      invoiceId: command.invoiceId!,
      amount: command.amount,
      method: command.method,
      reference: command.reference,
      provider: identity.provider,
      providerPaymentId: identity.providerPaymentId,
      idempotencyKey: identity.idempotencyKey,
    });
    await db.update(invoices).set({ status: result.status }).where(and(eq(invoices.orgId, command.orgId!), eq(invoices.id, command.invoiceId!)));
    await db
      .update(stripeWebhookEvents)
      .set({ status: "processed", orgId: command.orgId!, invoiceId: command.invoiceId!, processedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, event.id));

    return { received: true, duplicate: false, status: result.status, remaining: result.remaining, overpaid: result.overpaid };
  });
}
