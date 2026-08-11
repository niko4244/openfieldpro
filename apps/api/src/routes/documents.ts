// Durable document endpoints. GET returns the stored PDF (generating and
// storing it on first request); POST /regenerate explicitly replaces the
// stored snapshot from the current document data.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  documentView,
  ensureEstimateDocument,
  ensureInvoiceDocument,
  regenerateDocument,
  type StoredDocument,
} from "../documents.js";
import { safeEmitActivity } from "../activities.js";
import { resolveOrgId } from "./org.js";

function sendPdf(reply: FastifyReply, buffer: Buffer, filename: string) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .header("Content-Length", String(buffer.length))
    .send(buffer);
}

export async function documentRoutes(app: FastifyInstance) {
  app.get("/invoices/:id/document", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await ensureInvoiceDocument(orgId, id);
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    return sendPdf(reply, result.buffer, result.row.filename);
  });

  app.get("/estimates/:id/document", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await ensureEstimateDocument(orgId, id);
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    return sendPdf(reply, result.buffer, result.row.filename);
  });

  app.post("/invoices/:id/document/regenerate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await regenerateDocument(orgId, "invoice", id);
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    safeEmitActivity(orgId, "invoice.document_regenerated", `Regenerated invoice PDF for ${result.row.filename}`);
    return { document: documentView(result.row) as StoredDocument };
  });

  app.post("/estimates/:id/document/regenerate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await regenerateDocument(orgId, "estimate", id);
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    safeEmitActivity(orgId, "estimate.document_regenerated", `Regenerated estimate PDF for ${result.row.filename}`);
    return { document: documentView(result.row) as StoredDocument };
  });
}
