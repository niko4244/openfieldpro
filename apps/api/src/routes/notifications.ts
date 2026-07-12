import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, notifications } from "@ofp/db";
import { verifiedClaims } from "../operational-authorization.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    return db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, claims.orgId),
          eq(notifications.userId, claims.userId),
          eq(notifications.read, false),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  app.get("/unread-count", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, claims.orgId),
          eq(notifications.userId, claims.userId),
          eq(notifications.read, false),
        ),
      );
    return { count: rows.length };
  });

  app.get("/all", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    return db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, claims.orgId),
          eq(notifications.userId, claims.userId),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(100);
  });

  app.patch("/:id/read", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.orgId, claims.orgId),
          eq(notifications.userId, claims.userId),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/read-all", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.orgId, claims.orgId),
          eq(notifications.userId, claims.userId),
          eq(notifications.read, false),
        ),
      );
    return { ok: true };
  });
}
