import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, estimates, jobs, lineItems, orgs } from "@ofp/db";
import { mergeBusinessSettings } from "@ofp/shared";
import { defaultEstimateExpiresAt, estimateNumber } from "../estimates.js";
import { resolveOrgId } from "./org.js";

const createBody = z.object({ jobId: z.string().uuid() });
const acceptBody = z.object({ customerName: z.string().trim().min(1).max(160).optional() }).default({});

export async function estimateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(estimates)
      .where(eq(estimates.orgId, orgId))
      .orderBy(desc(estimates.createdAt))
      .limit(t)
      .offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [estimate] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!estimate) return reply.code(404).send({ error: "not found" });
    const items = await db.select().from(lineItems).where(eq(lineItems.jobId, estimate.jobId));
    return { ...estimate, lineItems: items };
  });

  // Create an estimate snapshotting the current job total.
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
      if (!job) return { kind: "missing-job" as const };

      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-number:${orgId}`}))`);
      const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
      const settings = mergeBusinessSettings(org?.businessSettings);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(estimates)
        .where(eq(estimates.orgId, orgId));
      const [row] = await tx.insert(estimates).values({
        orgId,
        jobId: job.id,
        number: estimateNumber(count, settings.numbering.estimatePrefix, settings.numbering.estimateNextNumber),
        total: job.total,
        expiresAt: defaultEstimateExpiresAt(settings.estimate.expirationDays),
      }).returning();
      return { kind: "created" as const, row };
    });
    if (result.kind === "missing-job") return reply.code(404).send({ error: "job not found" });
    const row = result.row;
    return reply.code(201).send(row);
  });

  // Accept an estimate → moves the job from lead to scheduled (ready to dispatch).
  app.post("/:id/accept", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = acceptBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [existing] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
      return reply.code(409).send({ error: "estimate expired" });
    }
    const [est] = await db
      .update(estimates)
      .set({
        accepted: true,
        acceptedAt: new Date(),
        acceptedByName: parsed.data.customerName,
        updatedAt: new Date(),
      })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)))
      .returning();
    if (!est) return reply.code(404).send({ error: "not found" });
    await db.update(jobs).set({ status: "scheduled" }).where(eq(jobs.id, est.jobId));
    return { ...est, jobStatus: "scheduled" };
  });
}
