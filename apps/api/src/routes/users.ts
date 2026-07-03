import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, users } from "@ofp/db";
import { resolveOrgId, requireRole } from "./org.js";
import { hashPassword } from "../auth.js";

const patchUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "dispatcher", "technician"]).optional(),
  active: z.boolean().optional(),
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["owner", "dispatcher", "technician"]).default("technician"),
  // Owner sets an initial password and hands it to the employee.
  // ponytail: no invite email / forced first-login reset yet. Ceiling:
  // password hygiene at scale. Upgrade: emailed invite link + reset flow.
  password: z.string().min(8),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner"));
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.active, true)))
      .orderBy(users.name);
  });

  // Add a team member (Settings → Team). Owner-only via the plugin hook.
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email));
    if (existing) return reply.code(409).send({ error: "email already in use" });
    const [row] = await db
      .insert(users)
      .values({
        orgId,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
      })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(users)
      .set(parsed.data)
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(users)
      .set({ active: false })
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning({ id: users.id });
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
