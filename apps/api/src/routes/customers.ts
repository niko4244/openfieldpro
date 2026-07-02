import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, customers, properties } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const createBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(desc(customers.createdAt))
      .limit(t)
      .offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(customers)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(customers)
      .set(parsed.data)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // ── Properties (service locations), nested under a customer ──

  const propertyCreateBody = z.object({
    address: z.string().min(1),
    lat: z.string().optional(),
    lng: z.string().optional(),
  });

  const propertyPatchBody = z.object({
    address: z.string().min(1).optional(),
    lat: z.string().nullable().optional(),
    lng: z.string().nullable().optional(),
  });

  async function customerInOrg(orgId: string, customerId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
    return !!row;
  }

  app.get("/:id/properties", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!(await customerInOrg(orgId, id))) return reply.code(404).send({ error: "not found" });
    return db
      .select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.customerId, id)))
      .orderBy(desc(properties.createdAt));
  });

  app.post("/:id/properties", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = propertyCreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await customerInOrg(orgId, id))) return reply.code(404).send({ error: "not found" });
    const [row] = await db
      .insert(properties)
      .values({ orgId, customerId: id, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id/properties/:propertyId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, propertyId } = req.params as { id: string; propertyId: string };
    const parsed = propertyPatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(properties)
      .set(parsed.data)
      .where(
        and(
          eq(properties.orgId, orgId),
          eq(properties.customerId, id),
          eq(properties.id, propertyId),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // jobs.property_id has ON DELETE SET NULL, so history rows survive unlinked.
  app.delete("/:id/properties/:propertyId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, propertyId } = req.params as { id: string; propertyId: string };
    const [row] = await db
      .delete(properties)
      .where(
        and(
          eq(properties.orgId, orgId),
          eq(properties.customerId, id),
          eq(properties.id, propertyId),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
