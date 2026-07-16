import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, activities } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

// A bare request is the organization-scoped recent feed used by the customer
// directory. The mandatory cap prevents an unbounded organization timeline.
export const activityQueryParams = z.object({
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const createBody = z
  .object({
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    kind: z.string().min(1).max(64),
    summary: z.string().min(1).max(500),
  })
  .refine((d) => Boolean(d.customerId) || Boolean(d.jobId), {
    message: "Provide customerId or jobId",
  });

export async function activityRoutes(app: FastifyInstance) {
  // Recent-first; index `activities_customer_idx (orgId, customerId, createdAt)`
  // covers the customerId filter (the trailing `createdAt` makes the desc sort
  // index-only). ponytail: the jobId filter uses `activities_job_idx (jobId)`
  // which has no trailing createdAt — the desc sort then needs a separate step
  // over the matching rows. Fine below ~1k activities per job; upgrade path is
  // a `(job_id, created_at desc)` index when the timeline page starts to lag.
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = activityQueryParams.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const conds = [eq(activities.orgId, orgId)];
    if (parsed.data.customerId) conds.push(eq(activities.customerId, parsed.data.customerId));
    if (parsed.data.jobId) conds.push(eq(activities.jobId, parsed.data.jobId));

    return db
      .select()
      .from(activities)
      .where(and(...conds))
      .orderBy(desc(activities.createdAt))
      .limit(parsed.data.limit);
  });

  // Manual note (e.g., "Called customer about quote"). safeEmit swallows errors.
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await safeEmitActivity(orgId, parsed.data.kind, parsed.data.summary, {
      customerId: parsed.data.customerId,
      jobId: parsed.data.jobId,
    });
    return reply.code(201).send({ ok: true });
  });
}
