import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, activities } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import {
  verifiedClaims,
  type UserRole,
} from "../operational-authorization.js";
import { getAccessibleCustomer, getAccessibleJob } from "../field-access.js";
import { activityVisibleToRole } from "../field-record-redaction.js";

const queryParams = z
  .object({
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .refine((data) => Boolean(data.customerId) || Boolean(data.jobId), {
    message: "Provide customerId or jobId",
  });

const createBody = z
  .object({
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    kind: z.string().min(1).max(64),
    summary: z.string().min(1).max(500),
  })
  .refine((data) => Boolean(data.customerId) || Boolean(data.jobId), {
    message: "Provide customerId or jobId",
  });

async function validateActivityTarget(
  orgId: string,
  claims: Parameters<typeof getAccessibleJob>[1],
  target: { customerId?: string; jobId?: string },
) {
  const job = target.jobId ? await getAccessibleJob(orgId, claims, target.jobId) : null;
  if (target.jobId && !job) return { ok: false as const, error: "job not found" };

  if (target.customerId && !(await getAccessibleCustomer(orgId, claims, target.customerId))) {
    return { ok: false as const, error: "customer not found" };
  }
  if (job && target.customerId && job.customerId !== target.customerId) {
    return { ok: false as const, error: "job does not belong to customer" };
  }
  return { ok: true as const };
}

export async function activityRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = queryParams.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const access = await validateActivityTarget(orgId, claims, parsed.data);
    if (!access.ok) return reply.code(404).send({ error: access.error });

    const conditions = [eq(activities.orgId, orgId)];
    if (parsed.data.customerId) conditions.push(eq(activities.customerId, parsed.data.customerId));
    if (parsed.data.jobId) conditions.push(eq(activities.jobId, parsed.data.jobId));

    const role = claims.role as UserRole;
    const queryLimit = role === "technician"
      ? Math.min(200, Math.max(parsed.data.limit, parsed.data.limit * 4))
      : parsed.data.limit;
    const rows = await db
      .select()
      .from(activities)
      .where(and(...conditions))
      .orderBy(desc(activities.createdAt))
      .limit(queryLimit);

    return role === "technician"
      ? rows.filter((row) => activityVisibleToRole(row.kind, role)).slice(0, parsed.data.limit)
      : rows;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const access = await validateActivityTarget(orgId, claims, parsed.data);
    if (!access.ok) return reply.code(404).send({ error: access.error });

    await safeEmitActivity(orgId, parsed.data.kind, parsed.data.summary, {
      customerId: parsed.data.customerId,
      jobId: parsed.data.jobId,
    });
    return reply.code(201).send({ ok: true });
  });
}
