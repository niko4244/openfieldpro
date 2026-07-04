import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, notifications } from "@ofp/db";
import { verifyRequestJwt } from "../auth.js";

async function currentUser(req: any): Promise<{ orgId: string; userId: string } | null> {
  try {
    const claims = await verifyRequestJwt(req);
    return claims.userId ? { orgId: claims.orgId, userId: claims.userId } : null;
  } catch {
    return null;
  }
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user = await currentUser(req);
    if (!user) return [];
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, user.orgId), eq(notifications.userId, user.userId), eq(notifications.read, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  app.get("/unread-count", async (req) => {
    const user = await currentUser(req);
    if (!user) return { count: 0 };
    const rows = await db
      .select({ count: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.orgId, user.orgId), eq(notifications.userId, user.userId), eq(notifications.read, false)));
    return { count: rows.length };
  });

  app.get("/all", async (req) => {
    const user = await currentUser(req);
    if (!user) return [];
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, user.orgId), eq(notifications.userId, user.userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
  });

  app.patch("/:id/read", async (req, reply) => {
    const user = await currentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.orgId, user.orgId), eq(notifications.id, id), eq(notifications.userId, user.userId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/read-all", async (req, reply) => {
    const user = await currentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.orgId, user.orgId), eq(notifications.userId, user.userId), eq(notifications.read, false)));
    return { ok: true };
  });
}
