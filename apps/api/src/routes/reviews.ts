import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, reviews, jobs } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const createBody = z.object({
  jobId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export async function reviewRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(reviews).where(eq(reviews.orgId, orgId)).orderBy(desc(reviews.createdAt));
    const [agg] = await db
      .select({ avg: sql<number>`coalesce(avg(rating),0)::float`, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.orgId, orgId));
    return { reviews: rows, average: agg.avg, count: agg.count };
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });
    const [row] = await db.insert(reviews).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = z.object({ reply: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(reviews)
      .set(parsed.data)
      .where(and(eq(reviews.orgId, orgId), eq(reviews.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
