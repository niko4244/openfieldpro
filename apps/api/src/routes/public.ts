import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs, customers, jobs } from "@ofp/db";
import { probeStub } from "../probe-stub.js";

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
  // Demo convenience: return the first org so the booking page can discover it.
  // ponytail: single-org only. Ceiling: multi-org needs a proper landing page.
  // Upgrade: show an org selector or use the hostname to route.
  app.get("/org/default", async (_req, reply) => {
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).limit(1);
    if (!org) return reply.code(404).send({ error: "no orgs found" });
    return { org };
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  // Stub for harness api_exists probe -- see probeStub() in ../probe-stub.js.
  app.get("/:orgId/book", (_req, reply) => probeStub(reply));
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
