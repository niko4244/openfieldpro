import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db, catalogCategories, catalogItems } from "@ofp/db";
import { catalogItemResponseForRole } from "../field-financials.js";
import { verifiedClaims, type UserRole } from "../operational-authorization.js";
import { resolveOrgId } from "./org.js";

const categoryBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const itemBody = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  costCents: z.number().int().min(0).default(0),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
});

const patchItemBody = itemBody.partial();

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    return db
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.orgId, orgId))
      .orderBy(catalogCategories.name);
  });

  app.post("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db.insert(catalogCategories).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  app.get("/items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const query = req.query as { search?: string; categoryId?: string; active?: string };
    const conditions = [eq(catalogItems.orgId, orgId)];
    if (query.categoryId) conditions.push(eq(catalogItems.categoryId, query.categoryId));
    if (claims.role === "technician") {
      conditions.push(eq(catalogItems.active, true));
    } else {
      if (query.active === "true") conditions.push(eq(catalogItems.active, true));
      if (query.active === "false") conditions.push(eq(catalogItems.active, false));
    }
    if (query.search?.trim()) conditions.push(ilike(catalogItems.name, `%${query.search.trim()}%`));
    const rows = await db
      .select()
      .from(catalogItems)
      .where(and(...conditions))
      .orderBy(desc(catalogItems.createdAt));
    return rows.map((row) => catalogItemResponseForRole(row, claims.role as UserRole));
  });

  app.post("/items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = itemBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [category] = await db
      .select({ id: catalogCategories.id })
      .from(catalogCategories)
      .where(and(eq(catalogCategories.orgId, orgId), eq(catalogCategories.id, parsed.data.categoryId)));
    if (!category) return reply.code(404).send({ error: "category not found" });
    const [row] = await db.insert(catalogItems).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  app.patch("/items/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchItemBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(catalogItems)
      .set(parsed.data)
      .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/items/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(catalogItems)
      .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
