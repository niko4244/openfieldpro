import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, customers, equipment } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const createSchema = z.object({
  customerId: z.string().uuid(),
  type: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  notes: z.string().optional(),
});

const patchSchema = z.object({
  customerId: z.string().uuid().optional(),
  type: z.string().min(1).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  notes: z.string().optional(),
});

function parseInputDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00.000Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

async function customerExists(orgId: string, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
  return !!row;
}

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { customerId?: string };
    const conditions = [eq(equipment.orgId, orgId)];
    if (query.customerId) conditions.push(eq(equipment.customerId, query.customerId));
    return db
      .select()
      .from(equipment)
      .where(and(...conditions))
      .orderBy(desc(equipment.createdAt));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { installDate, warrantyExpiry, ...rest } = parsed.data;
    const parsedInstallDate = parseInputDate(installDate);
    const parsedWarrantyExpiry = parseInputDate(warrantyExpiry);
    if ((installDate && !parsedInstallDate) || (warrantyExpiry && !parsedWarrantyExpiry)) {
      return reply.code(400).send({ error: "invalid equipment date" });
    }
    if (!(await customerExists(orgId, rest.customerId))) {
      return reply.code(400).send({ error: "customer not found" });
    }
    const [row] = await db
      .insert(equipment)
      .values({
        orgId,
        ...rest,
        installDate: parsedInstallDate,
        warrantyExpiry: parsedWarrantyExpiry,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { installDate, warrantyExpiry, ...rest } = parsed.data;
    const parsedInstallDate = parseInputDate(installDate);
    const parsedWarrantyExpiry = parseInputDate(warrantyExpiry);
    if ((installDate && !parsedInstallDate) || (warrantyExpiry && !parsedWarrantyExpiry)) {
      return reply.code(400).send({ error: "invalid equipment date" });
    }
    if (rest.customerId && !(await customerExists(orgId, rest.customerId))) {
      return reply.code(400).send({ error: "customer not found" });
    }
    const [row] = await db
      .update(equipment)
      .set({
        ...rest,
        ...(installDate !== undefined
          ? { installDate: parsedInstallDate ?? null }
          : {}),
        ...(warrantyExpiry !== undefined
          ? { warrantyExpiry: parsedWarrantyExpiry ?? null }
          : {}),
      })
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
