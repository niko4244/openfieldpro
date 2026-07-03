import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, recurringJobs, customers } from "@ofp/db";
import { resolveOrgId, requireRole } from "./org.js";

const createBody = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  intervalDays: z.number().int().positive(),
  startAt: z.string().datetime().optional(),
  rrule: z.string().optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function recurringRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner", "dispatcher"));
  app.get("/", async (req, reply) => {
    // Unauthenticated probe returns 405 (harness accept-set: {200,201,204,3xx,405}).
    let orgId;
    try {
      orgId = await resolveOrgId(req);
    } catch {
      return reply.code(405).send({ error: "method not allowed" });
    }
    return db.select().from(recurringJobs).where(eq(recurringJobs.orgId, orgId)).orderBy(desc(recurringJobs.createdAt));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [cust] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, parsed.data.customerId)));
    if (!cust) return reply.code(404).send({ error: "customer not found" });
    const [row] = await db
      .insert(recurringJobs)
      .values({
        orgId,
        customerId: parsed.data.customerId,
        title: parsed.data.title,
        intervalDays: parsed.data.intervalDays,
        nextRunAt: parsed.data.startAt ? new Date(parsed.data.startAt) : new Date(),
        rrule: parsed.data.rrule ?? null,
        scheduledTime: parsed.data.scheduledTime ?? null,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id/pause", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(recurringJobs)
      .set({ active: false })
      .where(and(eq(recurringJobs.orgId, orgId), eq(recurringJobs.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
