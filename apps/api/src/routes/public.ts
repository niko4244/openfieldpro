import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs, customers, jobs } from "@ofp/db";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { getOrgLogo } from "../uploads.js";

const bookBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(5_000).optional(),
});

const bookingRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const orgId = (request.params as { orgId?: string } | undefined)?.orgId ?? "unknown";
    return `${requestIpKey(request)}:${orgId}`;
  },
});

export async function publicRoutes(app: FastifyInstance) {
  app.get("/:orgId/logo", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const logo = await getOrgLogo(orgId);
    if (!logo) return reply.code(404).send({ error: "logo not found" });
    reply.header("Cache-Control", "public, max-age=300, immutable");
    return reply.type(logo.contentType).send(logo.buffer);
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  app.post("/:orgId/book", { preHandler: bookingRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const parsed = bookBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });

    const { name, phone, title, description } = parsed.data;
    const email = parsed.data.email?.toLowerCase();
    const job = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({ orgId, name, email, phone }).returning();
      const [createdJob] = await tx
        .insert(jobs)
        .values({ orgId, customerId: customer.id, title, description, status: "lead" })
        .returning();
      return createdJob;
    });

    return reply.code(201).send({ ok: true, requestId: job.id });
  });
}
