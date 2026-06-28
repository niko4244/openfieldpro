import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, lineItems, jobs } from "@ofp/db";
import { sumLines, jobCost, jobMargin } from "../totals.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

const createBody = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().int().nonnegative(),
  unitCost: z.number().int().nonnegative().default(0),
});

// Recompute the job's revenue, cost, and margin after line-item changes. Only
// jobs.total is persisted; cost and margin remain derived response fields.
async function recomputeJobTotals(orgId: string, jobId: string) {
  const [job] = await db
    .select({ laborCostCents: jobs.laborCostCents })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  const laborCents = job?.laborCostCents ?? 0;

  const items = await db
    .select()
    .from(lineItems)
    .where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, jobId)));
  const total = sumLines(items);
  const cost = jobCost(items, laborCents);
  const margin = jobMargin(total, cost);

  await db.update(jobs).set({ total }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  return { total, cost, margin };
}

export async function lineItemRoutes(app: FastifyInstance) {
  app.get("/jobs/:jobId/line-items", async (req) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    return db
      .select()
      .from(lineItems)
      .where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, jobId)));
  });

  app.post("/jobs/:jobId/line-items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [row] = await db.insert(lineItems).values({ orgId, jobId, ...parsed.data }).returning();
    const { total, cost, margin } = await recomputeJobTotals(orgId, jobId);
    safeEmitActivity(orgId, "line_item.added", `Added line item: ${row.description}`, { jobId });
    return reply.code(201).send({ lineItem: row, jobTotal: total, jobCostCents: cost, jobMarginCents: margin });
  });

  app.delete("/line-items/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [removed] = await db
      .delete(lineItems)
      .where(and(eq(lineItems.orgId, orgId), eq(lineItems.id, id)))
      .returning();
    if (!removed) return reply.code(404).send({ error: "not found" });
    const { total, cost, margin } = await recomputeJobTotals(orgId, removed.jobId);
    safeEmitActivity(orgId, "line_item.removed", `Removed line item: ${removed.description}`, { jobId: removed.jobId });
    return { ok: true, jobTotal: total, jobCostCents: cost, jobMarginCents: margin };
  });
}
