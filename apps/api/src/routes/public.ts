import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, orgs, customers, jobs, estimates, lineItems } from "@ofp/db";
import { safeEmitActivity } from "../activities.js";

// Public, UNAUTHENTICATED online-booking endpoint. A prospect submits a request
// and it lands as a `lead` job + customer for the org. No auth by design; the
// orgId is the public booking handle. Rate-limiting belongs in front (Caddy).
const bookBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
});

export async function publicRoutes(app: FastifyInstance) {
  app.get("/estimates/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [estimate] = await db.select().from(estimates).where(eq(estimates.publicToken, token));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });

    const [job] = await db
      .select({ id: jobs.id, title: jobs.title, description: jobs.description, customerId: jobs.customerId, orgId: jobs.orgId })
      .from(jobs)
      .where(and(eq(jobs.orgId, estimate.orgId), eq(jobs.id, estimate.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.orgId, estimate.orgId), eq(customers.id, job.customerId)));
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, estimate.orgId));
    const items = await db
      .select({ description: lineItems.description, quantity: lineItems.quantity, unitPrice: lineItems.unitPrice })
      .from(lineItems)
      .where(and(eq(lineItems.orgId, estimate.orgId), eq(lineItems.jobId, estimate.jobId)));

    return { estimate, job, customer, org, lineItems: items };
  });

  app.post("/estimates/:token/accept", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [estimate] = await db.select().from(estimates).where(eq(estimates.publicToken, token));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    if (estimate.accepted) return { ...estimate, jobStatus: "scheduled" };

    const [accepted] = await db
      .update(estimates)
      .set({ accepted: true })
      .where(and(eq(estimates.orgId, estimate.orgId), eq(estimates.id, estimate.id)))
      .returning();
    await db.update(jobs).set({ status: "scheduled" }).where(and(eq(jobs.orgId, estimate.orgId), eq(jobs.id, estimate.jobId)));
    safeEmitActivity(
      estimate.orgId,
      "estimate.accepted.public",
      `Customer accepted estimate for $${(estimate.total / 100).toFixed(2)}`,
      { jobId: estimate.jobId },
    );
    return { ...accepted, jobStatus: "scheduled" };
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  app.post("/:orgId/book", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const parsed = bookBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });

    const { name, email, phone, title, description } = parsed.data;
    const [customer] = await db.insert(customers).values({ orgId, name, email, phone }).returning();
    const [job] = await db
      .insert(jobs)
      .values({ orgId, customerId: customer.id, title, description, status: "lead" })
      .returning();
    return reply.code(201).send({ ok: true, requestId: job.id });
  });
}
