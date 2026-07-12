import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, equipment } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import {
  assignedCustomerIds,
  getAccessibleCustomer,
  getAccessibleEquipment,
  isTechnician,
} from "../field-access.js";

const createSchema = z.object({
  customerId: z.string().uuid(),
  type: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().datetime().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const patchSchema = z.object({
  customerId: z.string().uuid().optional(),
  type: z.string().min(1).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().datetime().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const query = req.query as { customerId?: string };
    const visibleCustomerIds = await assignedCustomerIds(orgId, claims);
    if (query.customerId && !(await getAccessibleCustomer(orgId, claims, query.customerId))) {
      return [];
    }
    if (visibleCustomerIds && visibleCustomerIds.length === 0) return [];

    const conditions = [eq(equipment.orgId, orgId)];
    if (query.customerId) conditions.push(eq(equipment.customerId, query.customerId));
    if (visibleCustomerIds) conditions.push(inArray(equipment.customerId, visibleCustomerIds));
    return db
      .select()
      .from(equipment)
      .where(and(...conditions))
      .orderBy(desc(equipment.createdAt));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    if (!(await getAccessibleEquipment(orgId, claims, id))) {
      return reply.code(404).send({ error: "not found" });
    }
    const [row] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await getAccessibleCustomer(orgId, claims, parsed.data.customerId))) {
      return reply.code(404).send({ error: "customer not found" });
    }

    const { installDate, warrantyExpiry, ...rest } = parsed.data;
    const [row] = await db
      .insert(equipment)
      .values({
        orgId,
        ...rest,
        installDate: installDate ? new Date(installDate) : undefined,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : undefined,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await getAccessibleEquipment(orgId, claims, id))) {
      return reply.code(404).send({ error: "not found" });
    }
    if (parsed.data.customerId && !(await getAccessibleCustomer(orgId, claims, parsed.data.customerId))) {
      return reply.code(404).send({ error: "customer not found" });
    }

    const { installDate, warrantyExpiry, ...rest } = parsed.data;
    const [row] = await db
      .update(equipment)
      .set({
        ...rest,
        ...(installDate !== undefined
          ? { installDate: installDate ? new Date(installDate) : null }
          : {}),
        ...(warrantyExpiry !== undefined
          ? { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }
          : {}),
      })
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (isTechnician(claims)) {
      return reply.code(403).send({ error: "equipment deletion requires office access" });
    }

    const { id } = req.params as { id: string };
    if (!(await getAccessibleEquipment(orgId, claims, id))) {
      return reply.code(404).send({ error: "not found" });
    }
    const [row] = await db
      .delete(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
