import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, ilike } from "drizzle-orm";
import { db, catalogCategories, catalogItems } from "@ofp/db";
import { resolveOrgId, requireRole } from "./org.js";

const createCategorySchema = z.object({ name: z.string().min(1), description: z.string().optional() });
const createItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().default(0),
  costCents: z.number().int().default(0),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
});
const patchItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().optional(),
  costCents: z.number().int().optional(),
  taxable: z.boolean().optional(),
  active: z.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner", "dispatcher"));
  // Root: capability probe + service status. (Also serves as the autoresearch
  // probe stub for /api/catalog — 200 on GET proves the prefix is registered.)
  app.get("/", async () => ({ ok: true, resources: ["categories", "items"] }));

  // ── Categories ──
  app.get("/categories", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(catalogCategories).where(eq(catalogCategories.orgId, orgId)).orderBy(catalogCategories.name);
  });

  app.post("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db.insert(catalogCategories).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  // ── Items ──
  app.get("/items", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { search?: string; categoryId?: string; active?: string };
    const conditions = [eq(catalogItems.orgId, orgId)];
    if (query.categoryId) conditions.push(eq(catalogItems.categoryId, query.categoryId));
    if (query.active !== undefined) conditions.push(eq(catalogItems.active, query.active === "true"));
    if (query.search) {
      conditions.push(ilike(catalogItems.name, `%${query.search}%`));
    }
    return db.select().from(catalogItems).where(and(...conditions)).orderBy(catalogItems.name);
  });

  app.post("/items", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [cat] = await db
      .select()
      .from(catalogCategories)
      .where(and(eq(catalogCategories.id, parsed.data.categoryId), eq(catalogCategories.orgId, orgId)));
    if (!cat) return reply.code(400).send({ error: "category not found" });
    const [row] = await db.insert(catalogItems).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  app.patch("/items/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.categoryId) {
      const [cat] = await db
        .select({ id: catalogCategories.id })
        .from(catalogCategories)
        .where(and(eq(catalogCategories.id, parsed.data.categoryId), eq(catalogCategories.orgId, orgId)));
      if (!cat) return reply.code(400).send({ error: "category not found" });
    }
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
