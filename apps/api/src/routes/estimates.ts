import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, estimates, estimateOptions, jobs } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

const createBody = z.object({ jobId: z.string().uuid() });
const optionBody = z.object({
  tier: z.enum(["good", "better", "best", "custom"]).default("custom"),
  title: z.string().min(1),
  description: z.string().max(1000).default(""),
  total: z.number().int().nonnegative(),
  included: z.string().max(2000).default(""),
  sortOrder: z.number().int().default(0),
});

function defaultOptions(orgId: string, estimateId: string, total: number) {
  return [
    {
      orgId,
      estimateId,
      tier: "good" as const,
      title: "Good",
      description: "Essential scope to resolve the immediate issue.",
      total,
      included: "Core repair scope\nStandard workmanship terms\nCustomer approval before scheduling",
      sortOrder: 10,
    },
    {
      orgId,
      estimateId,
      tier: "better" as const,
      title: "Better",
      description: "Recommended scope with added reliability coverage.",
      total: Math.round(total * 1.25),
      included: "Everything in Good\nAdditional recommended parts or labor\nPriority scheduling flag",
      sortOrder: 20,
    },
    {
      orgId,
      estimateId,
      tier: "best" as const,
      title: "Best",
      description: "Complete premium scope for maximum long-term confidence.",
      total: Math.round(total * 1.5),
      included: "Everything in Better\nComprehensive related work\nExtended follow-up note after completion",
      sortOrder: 30,
    },
  ];
}

export async function estimateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(estimates).where(eq(estimates.orgId, orgId)).orderBy(desc(estimates.createdAt));
  });

  app.get("/:id/options", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [estimate] = await db.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    return db.select().from(estimateOptions).where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id))).orderBy(estimateOptions.sortOrder);
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });
    const [row] = await db
      .insert(estimates)
      .values({ orgId, jobId: job.id, total: job.total, publicToken: randomUUID() })
      .returning();
    await db.insert(estimateOptions).values(defaultOptions(orgId, row.id, row.total));
    safeEmitActivity(orgId, "estimate.created", `Created estimate for $${(row.total / 100).toFixed(2)}`, { jobId: job.id });
    return reply.code(201).send(row);
  });

  app.post("/:id/options", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = optionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [estimate] = await db.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    const [row] = await db.insert(estimateOptions).values({ ...parsed.data, orgId, estimateId: id }).returning();
    safeEmitActivity(orgId, "estimate.option.created", `Added ${row.title} proposal option`, { jobId: estimate.jobId });
    return reply.code(201).send(row);
  });

  app.post("/:id/options/:optionId/accept", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, optionId } = req.params as { id: string; optionId: string };
    const [option] = await db
      .select()
      .from(estimateOptions)
      .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id), eq(estimateOptions.id, optionId)));
    if (!option) return reply.code(404).send({ error: "option not found" });
    const [est] = await db
      .update(estimates)
      .set({ accepted: true, acceptedOptionId: option.id, total: option.total })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)))
      .returning();
    if (!est) return reply.code(404).send({ error: "estimate not found" });
    await db.update(jobs).set({ status: "scheduled", total: option.total }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, est.jobId)));
    safeEmitActivity(orgId, "estimate.option.accepted", `Accepted ${option.title} option for $${(option.total / 100).toFixed(2)}`, { jobId: est.jobId });
    return { ...est, acceptedOption: option, jobStatus: "scheduled" };
  });

  app.post("/:id/accept", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [est] = await db
      .update(estimates)
      .set({ accepted: true })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)))
      .returning();
    if (!est) return reply.code(404).send({ error: "not found" });
    await db.update(jobs).set({ status: "scheduled" }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, est.jobId)));
    safeEmitActivity(orgId, "estimate.accepted", `Accepted estimate for $${(est.total / 100).toFixed(2)}`, { jobId: est.jobId });
    return { ...est, jobStatus: "scheduled" };
  });
}
