// Real send workflow endpoints. Preview renders the exact subject/body the
// customer would receive (without sending); send records a delivery attempt in
// message_logs; history lists attempts per document; retry re-sends a failed
// delivery from its stored snapshot.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildEstimateEmail,
  buildInvoiceEmail,
  deliverMessage,
  listMessages,
  MESSAGE_KINDS,
  messageLogView,
  retryMessage,
} from "../message-send.js";
import { safeEmitActivity } from "../activities.js";
import { resolveOrgId } from "./org.js";

const historyQuery = z.object({
  kind: z.enum(MESSAGE_KINDS).optional(),
  documentId: z.string().uuid().optional(),
});

export async function messageRoutes(app: FastifyInstance) {
  // ── History ──
  app.get("/messages", async (req) => {
    const orgId = await resolveOrgId(req);
    const parsed = historyQuery.safeParse(req.query);
    const { kind, documentId } = parsed.success ? parsed.data : {};
    const rows = await listMessages(orgId, { kind, documentId });
    return rows.map(messageLogView);
  });

  // ── Retry ──
  app.post("/messages/:id/retry", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await retryMessage(orgId, id);
    if ("statusCode" in result) return reply.code(result.statusCode).send({ error: result.error });
    if (result.status === "sent") {
      safeEmitActivity(
        orgId,
        "message.retried",
        `Retried and delivered email "${result.subject}" to ${result.recipient}`,
        { customerId: result.customerId },
      );
    }
    return result;
  });

  // ── Invoice email ──
  app.get("/invoices/:id/email-preview", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const draft = await buildInvoiceEmail(orgId, id);
    if (!draft.ok) return reply.code(draft.statusCode).send({ error: draft.error });
    return { to: draft.recipient, recipientName: draft.recipientName, subject: draft.subject, body: draft.body };
  });

  app.post("/invoices/:id/email", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const draft = await buildInvoiceEmail(orgId, id);
    if (!draft.ok) return reply.code(draft.statusCode).send({ error: draft.error });

    const log = await deliverMessage({
      orgId,
      kind: "invoice",
      documentId: id,
      customerId: draft.customerId,
      recipient: draft.recipient,
      subject: draft.subject,
      body: draft.body,
    });
    if (log.status === "sent") {
      safeEmitActivity(
        orgId,
        "invoice.email_sent",
        `Emailed invoice to ${draft.recipientName} (${draft.recipient})`,
        { customerId: draft.customerId },
      );
    }
    // The send was processed; the log row carries the delivery outcome
    // (sent vs failed). The client decides how to present it.
    return reply.send({
      log,
      draft: { to: draft.recipient, recipientName: draft.recipientName, subject: draft.subject, body: draft.body },
    });
  });

  // ── Estimate email ──
  app.get("/estimates/:id/email-preview", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const draft = await buildEstimateEmail(orgId, id);
    if (!draft.ok) return reply.code(draft.statusCode).send({ error: draft.error });
    return { to: draft.recipient, recipientName: draft.recipientName, subject: draft.subject, body: draft.body };
  });

  app.post("/estimates/:id/email", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const draft = await buildEstimateEmail(orgId, id);
    if (!draft.ok) return reply.code(draft.statusCode).send({ error: draft.error });

    const log = await deliverMessage({
      orgId,
      kind: "estimate",
      documentId: id,
      customerId: draft.customerId,
      recipient: draft.recipient,
      subject: draft.subject,
      body: draft.body,
    });
    if (log.status === "sent") {
      safeEmitActivity(
        orgId,
        "estimate.email_sent",
        `Emailed estimate to ${draft.recipientName} (${draft.recipient})`,
        { customerId: draft.customerId },
      );
    }
    // The send was processed; the log row carries the delivery outcome
    // (sent vs failed). The client decides how to present it.
    return reply.send({
      log,
      draft: { to: draft.recipient, recipientName: draft.recipientName, subject: draft.subject, body: draft.body },
    });
  });
}
