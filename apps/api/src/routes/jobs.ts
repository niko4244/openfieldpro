import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, customers, jobs, properties, users } from "@ofp/db";
import { JOB_STATUS } from "@ofp/shared";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";

const createBody = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional().default(0),
});

const patchBody = z.object({
  propertyId: z.string().uuid().nullable().optional(),
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
  // No .default(0) here: a PATCH that omits laborCostCents must not reset it.
  laborCostCents: z.number().int().nonnegative().optional(),
});

/** Property must exist in this org and belong to this customer. */
async function customerExists(orgId: string, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
  return !!row;
}

async function userExists(orgId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.id, userId)));
  return !!row;
}

async function propertyMatchesCustomer(
  orgId: string,
  propertyId: string,
  customerId: string,
): Promise<boolean> {
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(properties.id, propertyId),
        eq(properties.customerId, customerId),
      ),
    );
  return !!p;
}

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.orgId, orgId))
      .orderBy(desc(jobs.createdAt))
      .limit(t)
      .offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;
    if (!(await customerExists(orgId, rest.customerId))) {
      return reply.code(400).send({ error: "customer not found" });
    }
    if (
      rest.propertyId &&
      !(await propertyMatchesCustomer(orgId, rest.propertyId, rest.customerId))
    ) {
      return reply.code(400).send({ error: "property does not belong to this customer" });
    }
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
    void safeEmitEvent(orgId, "job.created", { id: row.id, title: row.title, customerId: row.customerId, status: row.status });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;
    if (rest.assignedTo && !(await userExists(orgId, rest.assignedTo))) {
      return reply.code(400).send({ error: "assigned user not found" });
    }
    if (rest.propertyId) {
      const [job] = await db
        .select({ customerId: jobs.customerId })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)));
      if (!job) return reply.code(404).send({ error: "not found" });
      if (!(await propertyMatchesCustomer(orgId, rest.propertyId, job.customerId))) {
        return reply.code(400).send({ error: "property does not belong to this customer" });
      }
    }
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
    return row;
  });
}
