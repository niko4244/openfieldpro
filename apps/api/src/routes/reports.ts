import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { db, jobs, invoices, reviews, lineItems } from "@ofp/db";
import { jobCost, jobMargin } from "../totals.js";
import { resolveOrgId, requireRole } from "./org.js";

// Owner dashboard numbers: pipeline by status, revenue collected, A/R, ratings.
export async function reportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner", "dispatcher"));
  app.get("/summary", async (req) => {
    const orgId = await resolveOrgId(req);

    const byStatus = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.orgId, orgId))
      .groupBy(jobs.status);

    const [revenue] = await db
      .select({ cents: sql<number>`coalesce(sum(total),0)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")));

    const [receivable] = await db
      .select({ cents: sql<number>`coalesce(sum(total),0)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "sent")));

    const [rating] = await db
      .select({ avg: sql<number>`coalesce(avg(rating),0)::float`, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.orgId, orgId));

    // Margin rollup: fetch the whole org's jobs + line items once, group in JS,
    // then reuse the pure totals helpers so the math stays identical to the
    // per-job POST/DELETE path. O(N+M) DB + O(N+M) in-JS; fine at <1000 jobs/org.
    const orgJobs = await db.select().from(jobs).where(eq(jobs.orgId, orgId));
    const orgLines = await db.select().from(lineItems).where(eq(lineItems.orgId, orgId));
    const linesByJob = new Map<string, typeof orgLines>();
    for (const line of orgLines) {
      const arr = linesByJob.get(line.jobId) ?? [];
      arr.push(line);
      linesByJob.set(line.jobId, arr);
    }

    const marginByStatus: Record<string, number> = {};
    let realizedMarginCents = 0;
    let pipelineMarginCents = 0;
    for (const job of orgJobs) {
      const lines = linesByJob.get(job.id) ?? [];
      const margin = jobMargin(job.total, jobCost(lines, job.laborCostCents));
      marginByStatus[job.status] = (marginByStatus[job.status] ?? 0) + margin;
      if (job.status === "completed") realizedMarginCents += margin;
      if (job.status !== "canceled") pipelineMarginCents += margin;
    }

    return {
      jobsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
      revenueCollectedCents: revenue.cents,
      accountsReceivableCents: receivable.cents,
      rating: { average: rating.avg, count: rating.count },
      marginByStatus,
      realizedMarginCents,
      pipelineMarginCents,
    };
  });
}
