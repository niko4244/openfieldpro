import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, customers } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import {
  verifiedClaims,
  type UserRole,
} from "../operational-authorization.js";
import { assignedCustomerIds, getAccessibleCustomer } from "../field-access.js";
import { customerResponseForRole } from "../field-record-redaction.js";

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
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    const visibleCustomerIds = await assignedCustomerIds(orgId, claims);
    if (visibleCustomerIds && visibleCustomerIds.length === 0) return [];

    const conditions = [eq(customers.orgId, orgId)];
    if (visibleCustomerIds) conditions.push(inArray(customers.id, visibleCustomerIds));
    const rows = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.createdAt))
      .limit(t)
      .offset(s);
    return rows.map((row) => customerResponseForRole(row, claims.role as UserRole));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    if (!(await getAccessibleCustomer(orgId, claims, id))) {
      return reply.code(404).send({ error: "not found" });
    }
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return customerResponseForRole(row, claims.role as UserRole);
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
}
