import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, sql, count } from "drizzle-orm";
import { db, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { guardTeamChange, type TeamChange, type UserRole } from "../team-safeguards.js";
import type { JwtClaims } from "../auth.js";

const patchUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["owner", "dispatcher", "technician"]).optional(),
  active: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.active, true)))
      .orderBy(users.name);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Resolve the changes the caller asked for so the guard evaluates every
    // rule against the complete request, not just the first matching one.
    const changes: TeamChange[] = [];
    if (parsed.data.role !== undefined) {
      changes.push({ kind: "role", targetRole: parsed.data.role as UserRole });
    }
    if (parsed.data.active === false) {
      changes.push({ kind: "deactivate" });
    }

    const result = await db.transaction(async (tx) => {
      // Serialize team mutations per org so the owner count cannot race a
      // concurrent demotion/removal (same pattern as registration).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);

      const [target] = await tx
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .limit(1);
      if (!target) return { status: 404 as const, body: { error: "not found" } };

      const [{ value: ownerTotal }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "owner"), eq(users.active, true)));
      const otherActiveOwners = ownerTotal - (target.role === "owner" && target.active ? 1 : 0);

      const actor: { id: string; role: UserRole } = {
        id: claims.userId,
        role: claims.role as UserRole,
      };

      for (const change of changes) {
        const guard = guardTeamChange(
          { actor, target: { id: target.id, role: target.role as UserRole, active: target.active }, otherActiveOwners },
          change,
        );
        if (!guard.ok) return { status: guard.code as 403 | 409, body: { error: guard.error, hint: guard.hint } };
      }

      const [row] = await tx
        .update(users)
        .set(parsed.data)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
      return { status: 200 as const, body: row };
    });

    return reply.code(result.status).send(result.body);
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);

      const [target] = await tx
        .select({ id: users.id, role: users.role, active: users.active })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .limit(1);
      if (!target) return { status: 404 as const, body: { error: "not found" } };

      const [{ value: ownerTotal }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "owner"), eq(users.active, true)));
      const otherActiveOwners = ownerTotal - (target.role === "owner" && target.active ? 1 : 0);

      const actor: { id: string; role: UserRole } = { id: claims.userId, role: claims.role as UserRole };
      const guard = guardTeamChange(
        { actor, target: { id: target.id, role: target.role as UserRole, active: target.active }, otherActiveOwners },
        { kind: "remove" },
      );
      if (!guard.ok) return { status: guard.code as 403 | 409, body: { error: guard.error, hint: guard.hint } };

      await tx
        .update(users)
        .set({ active: false })
        .where(and(eq(users.orgId, orgId), eq(users.id, id)));
      return { status: 204 as const, body: undefined };
    });

    if (result.status === 204) return reply.code(204).send();
    return reply.code(result.status).send(result.body);
  });
}
