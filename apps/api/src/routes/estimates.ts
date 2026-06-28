import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, estimates, jobs } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

const createBody = z.object({ jobId: z.string().uuid() });

export async function estimateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(estimates).where(eq(estimates.orgId, orgId)).orderBy(desc(estimates.createdAt));
  });

  // Create an estimate snapshotting the current job total.
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });
    const [row] = await db.insert(estimates).values({ orgId, jobId: job.id, total: job.total }).returning();
    safeEmitActivity(orgId, "estimate.created", `Created estimate for $${(row.total / 100).toFixed(2)}`, { jobId: job.id });
    return reply.code(201).send(row);
  });

  // Accept an estimate → moves the job from lead to scheduled (ready to dispatch).
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
