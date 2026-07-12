import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, lineItems, jobs } from "@ofp/db";
import { sumLines, jobCost, jobMargin } from "../totals.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import {
  verifiedClaims,
  type UserRole,
} from "../operational-authorization.js";

const createBody = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().int().nonnegative(),
  unitCost: z.number().int().nonnegative().default(0),
});

type LineItemFinancialFields = {
  unitPrice: number;
  unitCost: number;
};

export function lineItemResponseForRole<T extends LineItemFinancialFields>(row: T, role: UserRole) {
  if (role !== "technician") return row;
  const { unitPrice: _unitPrice, unitCost: _unitCost, ...fieldItem } = row;
  return { ...fieldItem, financialsRestricted: true as const };
}

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

async function canAccessJob(orgId: string, jobId: string, role: string, userId: string) {
  const conditions = [eq(jobs.orgId, orgId), eq(jobs.id, jobId)];
  if (role === "technician") conditions.push(eq(jobs.assignedTo, userId));
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(...conditions));
  return Boolean(job);
}

export async function lineItemRoutes(app: FastifyInstance) {
  app.get("/jobs/:jobId/line-items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { jobId } = req.params as { jobId: string };
    if (!(await canAccessJob(orgId, jobId, claims.role, claims.userId))) {
      return reply.code(404).send({ error: "job not found" });
    }
    const rows = await db
      .select()
      .from(lineItems)
      .where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, jobId)));
    return rows.map((row) => lineItemResponseForRole(row, claims.role as UserRole));
  });

  app.post("/jobs/:jobId/line-items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { jobId } = req.params as { jobId: string };
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await canAccessJob(orgId, jobId, claims.role, claims.userId))) {
      return reply.code(404).send({ error: "job not found" });
    }

    const [row] = await db.insert(lineItems).values({ orgId, jobId, ...parsed.data }).returning();
    const { total, cost, margin } = await recomputeJobTotals(orgId, jobId);
    safeEmitActivity(orgId, "line_item.added", `Added line item: ${row.description}`, { jobId });
    return reply.code(201).send({
      lineItem: row,
      jobTotal: total,
      jobCostCents: cost,
      jobMarginCents: margin,
    });
  });

  app.delete("/line-items/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select({ id: lineItems.id, jobId: lineItems.jobId, description: lineItems.description })
      .from(lineItems)
      .where(and(eq(lineItems.orgId, orgId), eq(lineItems.id, id)));
    if (!existing || !(await canAccessJob(orgId, existing.jobId, claims.role, claims.userId))) {
      return reply.code(404).send({ error: "not found" });
    }

    const [removed] = await db
      .delete(lineItems)
      .where(and(eq(lineItems.orgId, orgId), eq(lineItems.id, id)))
      .returning();
    if (!removed) return reply.code(404).send({ error: "not found" });
    const { total, cost, margin } = await recomputeJobTotals(orgId, removed.jobId);
    safeEmitActivity(orgId, "line_item.removed", `Removed line item: ${removed.description}`, {
      jobId: removed.jobId,
    });
    return { ok: true, jobTotal: total, jobCostCents: cost, jobMarginCents: margin };
  });
}
