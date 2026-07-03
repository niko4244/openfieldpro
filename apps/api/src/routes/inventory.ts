import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, ilike, sql } from "drizzle-orm";
import {
  db,
  catalogCategories,
  catalogItems,
  inventoryAdjustments,
  inventoryLevels,
} from "@ofp/db";
import { resolveOrgId, requireRole } from "./org.js";
import type { InventoryAdjustmentDTO, InventoryItemDTO } from "@ofp/shared";

const createPartBody = z.object({
  categoryId: z.string().uuid().optional(),
  categoryName: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0).default(0),
  costCents: z.number().int().min(0).default(0),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
  quantityOnHand: z.number().int().default(0),
  reorderPoint: z.number().int().min(0).default(0),
});

const adjustBody = z.object({
  delta: z.number().int(),
  reason: z.string().min(1).max(80).default("manual"),
  note: z.string().max(1000).optional(),
});

function stockStatus(quantityOnHand: number, reorderPoint: number): InventoryItemDTO["stockStatus"] {
  if (quantityOnHand <= 0) return "out";
  if (reorderPoint > 0 && quantityOnHand <= reorderPoint) return "low";
  return "ok";
}

type InventoryRow = {
  id: string;
  orgId: string;
  categoryId: string;
  categoryName: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number;
  taxable: boolean;
  active: boolean;
  quantityOnHand: number | null;
  reorderPoint: number | null;
  updatedAt: Date | null;
  createdAt: Date;
};

function toInventoryDto(row: InventoryRow): InventoryItemDTO {
  const quantityOnHand = row.quantityOnHand ?? 0;
  const reorderPoint = row.reorderPoint ?? 0;
  return {
    id: row.id,
    orgId: row.orgId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    costCents: row.costCents,
    taxable: row.taxable,
    active: row.active,
    quantityOnHand,
    reorderPoint,
    stockStatus: stockStatus(quantityOnHand, reorderPoint),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAdjustmentDto(row: typeof inventoryAdjustments.$inferSelect): InventoryAdjustmentDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    catalogItemId: row.catalogItemId,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    quantityAfter: row.quantityAfter,
    createdAt: row.createdAt.toISOString(),
  };
}

async function fetchInventoryItem(orgId: string, itemId: string): Promise<InventoryItemDTO | null> {
  const [row] = await db
    .select({
      id: catalogItems.id,
      orgId: catalogItems.orgId,
      categoryId: catalogItems.categoryId,
      categoryName: catalogCategories.name,
      name: catalogItems.name,
      description: catalogItems.description,
      priceCents: catalogItems.priceCents,
      costCents: catalogItems.costCents,
      taxable: catalogItems.taxable,
      active: catalogItems.active,
      quantityOnHand: inventoryLevels.quantityOnHand,
      reorderPoint: inventoryLevels.reorderPoint,
      updatedAt: inventoryLevels.updatedAt,
      createdAt: catalogItems.createdAt,
    })
    .from(catalogItems)
    .leftJoin(
      catalogCategories,
      and(
        eq(catalogCategories.id, catalogItems.categoryId),
        eq(catalogCategories.orgId, catalogItems.orgId),
      ),
    )
    .leftJoin(
      inventoryLevels,
      and(
        eq(inventoryLevels.catalogItemId, catalogItems.id),
        eq(inventoryLevels.orgId, catalogItems.orgId),
      ),
    )
    .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, itemId)))
    .limit(1);
  return row ? toInventoryDto(row) : null;
}

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner", "dispatcher"));
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as {
      search?: string;
      categoryId?: string;
      stock?: "low" | "out";
      active?: string;
    };

    const conditions = [eq(catalogItems.orgId, orgId)];
    if (query.categoryId) conditions.push(eq(catalogItems.categoryId, query.categoryId));
    if (query.active !== undefined) conditions.push(eq(catalogItems.active, query.active === "true"));
    if (query.search) conditions.push(ilike(catalogItems.name, `%${query.search}%`));

    const rows = await db
      .select({
        id: catalogItems.id,
        orgId: catalogItems.orgId,
        categoryId: catalogItems.categoryId,
        categoryName: catalogCategories.name,
        name: catalogItems.name,
        description: catalogItems.description,
        priceCents: catalogItems.priceCents,
        costCents: catalogItems.costCents,
        taxable: catalogItems.taxable,
        active: catalogItems.active,
        quantityOnHand: inventoryLevels.quantityOnHand,
        reorderPoint: inventoryLevels.reorderPoint,
        updatedAt: inventoryLevels.updatedAt,
        createdAt: catalogItems.createdAt,
      })
      .from(catalogItems)
      .leftJoin(
        catalogCategories,
        and(
          eq(catalogCategories.id, catalogItems.categoryId),
          eq(catalogCategories.orgId, catalogItems.orgId),
        ),
      )
      .leftJoin(
        inventoryLevels,
        and(
          eq(inventoryLevels.catalogItemId, catalogItems.id),
          eq(inventoryLevels.orgId, catalogItems.orgId),
        ),
      )
      .where(and(...conditions))
      .orderBy(catalogItems.name);

    const inventory = rows.map(toInventoryDto);
    if (query.stock === "out") return inventory.filter((item) => item.stockStatus === "out");
    if (query.stock === "low") return inventory.filter((item) => item.stockStatus === "low");
    return inventory;
  });

  app.post("/parts", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createPartBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const itemId = await db.transaction(async (tx) => {
      let categoryId = body.categoryId;
      if (categoryId) {
        const [cat] = await tx
          .select({ id: catalogCategories.id })
          .from(catalogCategories)
          .where(and(eq(catalogCategories.orgId, orgId), eq(catalogCategories.id, categoryId)))
          .limit(1);
        if (!cat) throw new Error("category not found");
      } else {
        const categoryName = body.categoryName ?? "Parts";
        const [existing] = await tx
          .select({ id: catalogCategories.id })
          .from(catalogCategories)
          .where(and(eq(catalogCategories.orgId, orgId), eq(catalogCategories.name, categoryName)))
          .limit(1);
        if (existing) {
          categoryId = existing.id;
        } else {
          const [created] = await tx
            .insert(catalogCategories)
            .values({ orgId, name: categoryName })
            .returning({ id: catalogCategories.id });
          categoryId = created.id;
        }
      }

      const [item] = await tx
        .insert(catalogItems)
        .values({
          orgId,
          categoryId,
          name: body.name,
          description: body.description,
          priceCents: body.priceCents,
          costCents: body.costCents,
          taxable: body.taxable,
          active: body.active,
        })
        .returning({ id: catalogItems.id });

      const [level] = await tx
        .insert(inventoryLevels)
        .values({
          orgId,
          catalogItemId: item.id,
          quantityOnHand: body.quantityOnHand,
          reorderPoint: body.reorderPoint,
        })
        .returning();

      if (body.quantityOnHand !== 0) {
        await tx.insert(inventoryAdjustments).values({
          orgId,
          catalogItemId: item.id,
          delta: body.quantityOnHand,
          reason: "initial",
          note: "Initial stock",
          quantityAfter: level.quantityOnHand,
        });
      }
      return item.id;
    });

    const created = await fetchInventoryItem(orgId, itemId);
    return reply.code(201).send(created);
  });

  app.post<{ Params: { id: string } }>("/items/:id/adjustments", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = adjustBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.delta === 0) {
      return reply.code(400).send({ error: "delta must not be zero" });
    }

    const [item] = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, req.params.id)))
      .limit(1);
    if (!item) return reply.code(404).send({ error: "part not found" });

    const adjustment = await db.transaction(async (tx) => {
      const [level] = await tx
        .insert(inventoryLevels)
        .values({
          orgId,
          catalogItemId: req.params.id,
          quantityOnHand: parsed.data.delta,
          reorderPoint: 0,
        })
        .onConflictDoUpdate({
          target: [inventoryLevels.orgId, inventoryLevels.catalogItemId],
          set: {
            quantityOnHand: sql`${inventoryLevels.quantityOnHand} + ${parsed.data.delta}`,
            updatedAt: new Date(),
            version: sql`${inventoryLevels.version} + 1`,
          },
        })
        .returning();

      const [row] = await tx
        .insert(inventoryAdjustments)
        .values({
          orgId,
          catalogItemId: req.params.id,
          delta: parsed.data.delta,
          reason: parsed.data.reason,
          note: parsed.data.note,
          quantityAfter: level.quantityOnHand,
        })
        .returning();
      return row;
    });

    return toAdjustmentDto(adjustment);
  });
}
