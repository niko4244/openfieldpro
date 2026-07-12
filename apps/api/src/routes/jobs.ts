import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, jobs } from "@ofp/db";
import { JOB_STATUS } from "@ofp/shared";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";
import { jobResponseForRole } from "../field-financials.js";
import {
  technicianJobPatchAllowed,
  verifiedClaims,
  type UserRole,
} from "../operational-authorization.js";

const createBody = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional().default(0),
});

export const jobPatchBody = z.object({
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional(),
});

function validTechnicianTransition(current: string, next: unknown) {
  return (
    (current === "scheduled" && next === "in_progress") ||
    (current === "in_progress" && next === "completed")
  );
}

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    const scope = claims.role === "technician"
      ? and(eq(jobs.orgId, orgId), eq(jobs.assignedTo, claims.userId))
      : eq(jobs.orgId, orgId);
    const rows = await db
      .select()
      .from(jobs)
      .where(scope)
      .orderBy(desc(jobs.createdAt))
      .limit(t)
      .offset(s);
    return rows.map((row) => jobResponseForRole(row, claims.role as UserRole));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const scope = claims.role === "technician"
      ? and(eq(jobs.orgId, orgId), eq(jobs.id, id), eq(jobs.assignedTo, claims.userId))
      : and(eq(jobs.orgId, orgId), eq(jobs.id, id));
    const [row] = await db.select().from(jobs).where(scope).limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    return jobResponseForRole(row, claims.role as UserRole);
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;
    const [row] = await db
      .insert(jobs)
      .values({
        orgId,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      })
      .returning();
    safeEmitActivity(orgId, "job.created", `Created job: ${row.title}`, {
      customerId: row.customerId,
      jobId: row.id,
    });
    void safeEmitEvent(orgId, "job.created", {
      id: row.id,
      title: row.title,
      customerId: row.customerId,
      status: row.status,
    });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { id } = req.params as { id: string };
    const parsed = jobPatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    if (claims.role === "technician") {
      if (!technicianJobPatchAllowed(parsed.data as Record<string, unknown>)) {
        return reply.code(403).send({
          error: "technicians may only start or complete their assigned jobs",
        });
      }
      const [current] = await db
        .select({ assignedTo: jobs.assignedTo, status: jobs.status })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
        .limit(1);
      if (!current) return reply.code(404).send({ error: "not found" });
      if (current.assignedTo !== claims.userId) {
        return reply.code(403).send({ error: "job is not assigned to this technician" });
      }
      if (!validTechnicianTransition(current.status, parsed.data.status)) {
        return reply.code(409).send({
          error: "invalid technician job transition",
          currentStatus: current.status,
          requestedStatus: parsed.data.status,
        });
      }
    }

    const { scheduledAt, ...rest } = parsed.data;
    const [row] = await db
      .update(jobs)
      .set({
        ...rest,
        ...(scheduledAt !== undefined
          ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
          : {}),
      })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    if (parsed.data.status) {
      const label = parsed.data.status.replaceAll("_", " ");
      safeEmitActivity(orgId, "job.status_changed", `Job marked ${label}: ${row.title}`, {
        customerId: row.customerId,
        jobId: row.id,
      });
      void safeEmitEvent(orgId, "job.status_changed", {
        id: row.id,
        customerId: row.customerId,
        status: row.status,
      });
    }

    return jobResponseForRole(row, claims.role as UserRole);
  });
}
