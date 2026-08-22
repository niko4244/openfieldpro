import type { FastifyInstance, FastifyReply } from "fastify";
import { eq, and, ne, gte, inArray, sql } from "drizzle-orm";
import { db, jobs, invoices, reviews, lineItems, payments, estimates, appointments, users } from "@ofp/db";
import { jobCost, jobMargin } from "../totals.js";
import {
  arAgingReport,
  estimateConversionReport,
  jobOnTime,
  revenueTrendReport,
  toCsv,
} from "../reports.js";
import { resolveOrgId } from "./org.js";

// Friendly two-decimal dollars for CSV cells so spreadsheets treat them as numbers.
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvResponse(reply: FastifyReply, csv: string, filename: string) {
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

function windowDays(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? Math.min(365, value) : fallback;
}

// Owner dashboard numbers: pipeline by status, revenue collected, A/R, ratings.
export async function reportRoutes(app: FastifyInstance) {
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

  // ── AR aging ──────────────────────────────────────────────────────────────
  app.get("/ar-aging", async (req) => {
    const orgId = await resolveOrgId(req);
    const invoiceRows = await db
      .select({ id: invoices.id, total: invoices.total, dueAt: invoices.dueAt, createdAt: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), ne(invoices.status, "void")));
    const paidRows = await db
      .select({ invoiceId: payments.invoiceId, amount: payments.amount })
      .from(payments)
      .where(eq(payments.orgId, orgId));
    const paidByInvoice = new Map<string, number>();
    for (const payment of paidRows) {
      paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
    }
    return arAgingReport(invoiceRows.map((row) => ({
      total: row.total,
      paid: paidByInvoice.get(row.id) ?? 0,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
    })));
  });

  // ── Estimate conversion funnel ────────────────────────────────────────────
  app.get("/estimate-conversion", async (req) => {
    const orgId = await resolveOrgId(req);
    const { days } = req.query as { days?: string };
    const window = windowDays(days, 90);
    const rows = await db
      .select({ status: estimates.status, sentAt: estimates.sentAt, acceptedAt: estimates.acceptedAt })
      .from(estimates)
      .where(eq(estimates.orgId, orgId));
    return estimateConversionReport(rows, window);
  });

  // ── Revenue trend ─────────────────────────────────────────────────────────
  app.get("/revenue-trend", async (req) => {
    const orgId = await resolveOrgId(req);
    const { months } = req.query as { months?: string };
    const monthsCount = Number.isInteger(Number(months)) && Number(months) >= 1 ? Math.min(60, Number(months)) : 12;
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - (monthsCount - 1));
    const rows = await db
      .select({ paidAt: payments.paidAt, amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), gte(payments.paidAt, start)));
    return revenueTrendReport(rows, monthsCount);
  });

  // ── Technician scorecards ─────────────────────────────────────────────────
  app.get("/technician-scorecards", async (req) => {
    const orgId = await resolveOrgId(req);
    const { days } = req.query as { days?: string };
    const window = windowDays(days, 90);
    const cutoff = new Date(Date.now() - window * 86_400_000);

    const completedJobs = await db
      .select({ id: jobs.id, assignedTo: jobs.assignedTo, scheduledAt: jobs.scheduledAt })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.status, "completed"), gte(jobs.updatedAt, cutoff)));
    if (completedJobs.length === 0) return { scorecards: [], windowDays: window };

    const jobIds = completedJobs.map((job) => job.id);
    const [apptRows, reviewRows, invoiceRows, userRows] = await Promise.all([
      db
        .select({ jobId: appointments.jobId, technicianId: appointments.technicianId, startsAt: appointments.startsAt })
        .from(appointments)
        .where(inArray(appointments.jobId, jobIds)),
      db
        .select({ jobId: reviews.jobId, rating: reviews.rating })
        .from(reviews)
        .where(inArray(reviews.jobId, jobIds)),
      db
        .select({ jobId: invoices.jobId, total: invoices.total })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid"), inArray(invoices.jobId, jobIds))),
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.orgId, orgId)),
    ]);

    const userNames = new Map(userRows.map((user) => [user.id, user.name]));
    const appointmentsByJob = new Map<string, typeof apptRows>();
    for (const appointment of apptRows) {
      const arr = appointmentsByJob.get(appointment.jobId) ?? [];
      arr.push(appointment);
      appointmentsByJob.set(appointment.jobId, arr);
    }
    const reviewsByJob = new Map<string, number[]>();
    for (const review of reviewRows) {
      const arr = reviewsByJob.get(review.jobId) ?? [];
      arr.push(review.rating);
      reviewsByJob.set(review.jobId, arr);
    }
    const revenueByJob = new Map<string, number>();
    for (const invoice of invoiceRows) {
      revenueByJob.set(invoice.jobId, (revenueByJob.get(invoice.jobId) ?? 0) + invoice.total);
    }

    // Group completed jobs by technician (null = unassigned work).
    const byTechnician = new Map<string | null, typeof completedJobs>();
    for (const job of completedJobs) {
      const arr = byTechnician.get(job.assignedTo) ?? [];
      arr.push(job);
      byTechnician.set(job.assignedTo, arr);
    }

    const scorecards = [...byTechnician.entries()]
      .map(([technicianId, jobsForTech]) => {
        let revenueCents = 0;
        const ratings: number[] = [];
        let onTimeCount = 0;
        let schedulableCount = 0;
        for (const job of jobsForTech) {
          revenueCents += revenueByJob.get(job.id) ?? 0;
          ratings.push(...(reviewsByJob.get(job.id) ?? []));
          const onTime = jobOnTime(
            job.scheduledAt,
            (appointmentsByJob.get(job.id) ?? []).map((appointment) => appointment.startsAt),
          );
          if (onTime !== null) {
            schedulableCount += 1;
            if (onTime) onTimeCount += 1;
          }
        }
        const avgRating = ratings.length > 0
          ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
          : null;
        return {
          technicianId,
          technicianName: technicianId ? (userNames.get(technicianId) ?? "Unknown technician") : "(unassigned)",
          jobsCompleted: jobsForTech.length,
          revenueCents,
          avgRating,
          onTimeRate: schedulableCount > 0 ? onTimeCount / schedulableCount : null,
        };
      })
      .sort((a, b) => b.jobsCompleted - a.jobsCompleted);

    return { scorecards, windowDays: window };
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  app.get("/export", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { report, days, months } = req.query as { report?: string; days?: string; months?: string };
    switch (report) {
      case "ar-aging": {
        const invoiceRows = await db
          .select({ id: invoices.id, number: invoices.number, status: invoices.status, total: invoices.total, dueAt: invoices.dueAt, createdAt: invoices.createdAt })
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), ne(invoices.status, "void")));
        const paidRows = await db
          .select({ invoiceId: payments.invoiceId, amount: payments.amount })
          .from(payments)
          .where(eq(payments.orgId, orgId));
        const paidByInvoice = new Map<string, number>();
        for (const payment of paidRows) {
          paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
        }
        const csv = toCsv(invoiceRows.map((row) => {
          const paid = paidByInvoice.get(row.id) ?? 0;
          return {
            invoice: row.number,
            status: row.status,
            total: money(row.total),
            paid: money(paid),
            balance: money(Math.max(0, row.total - paid)),
            due_at: row.dueAt ? new Date(row.dueAt).toISOString().slice(0, 10) : "",
          };
        }));
        return csvResponse(reply, csv, "ar-aging.csv");
      }
      case "estimate-conversion": {
        const rows = await db
          .select({ status: estimates.status, sentAt: estimates.sentAt, acceptedAt: estimates.acceptedAt })
          .from(estimates)
          .where(eq(estimates.orgId, orgId));
        const reportData = estimateConversionReport(rows, windowDays(days, 90));
        const csv = toCsv([{
          sent: reportData.sent,
          approved: reportData.approved,
          declined: reportData.declined,
          expired: reportData.expired,
          conversion_rate: reportData.conversionRate.toFixed(4),
          avg_days_to_approve: reportData.avgDaysToApprove === null ? "" : reportData.avgDaysToApprove.toFixed(1),
          window_days: reportData.windowDays,
        }]);
        return csvResponse(reply, csv, "estimate-conversion.csv");
      }
      case "revenue-trend": {
        const monthsCount = Number.isInteger(Number(months)) && Number(months) >= 1 ? Math.min(60, Number(months)) : 12;
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        start.setUTCMonth(start.getUTCMonth() - (monthsCount - 1));
        const rows = await db
          .select({ paidAt: payments.paidAt, amount: payments.amount })
          .from(payments)
          .where(and(eq(payments.orgId, orgId), gte(payments.paidAt, start)));
        const reportData = revenueTrendReport(rows, monthsCount);
        const csv = toCsv(reportData.months.map((point) => ({
          month: point.month,
          revenue: money(point.revenueCents),
          revenue_cents: point.revenueCents,
        })));
        return csvResponse(reply, csv, "revenue-trend.csv");
      }
      case "technician-scorecards": {
        const window = windowDays(days, 90);
        const cutoff = new Date(Date.now() - window * 86_400_000);
        const completedJobs = await db
          .select({ id: jobs.id, assignedTo: jobs.assignedTo, scheduledAt: jobs.scheduledAt, title: jobs.title })
          .from(jobs)
          .where(and(eq(jobs.orgId, orgId), eq(jobs.status, "completed"), gte(jobs.updatedAt, cutoff)));
        if (completedJobs.length === 0) return csvResponse(reply, toCsv([]), "technician-scorecards.csv");
        const jobIds = completedJobs.map((job) => job.id);
        const [apptRows, userRows] = await Promise.all([
          db
            .select({ jobId: appointments.jobId, startsAt: appointments.startsAt })
            .from(appointments)
            .where(inArray(appointments.jobId, jobIds)),
          db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(eq(users.orgId, orgId)),
        ]);
        const userNames = new Map(userRows.map((user) => [user.id, user.name]));
        const appointmentsByJob = new Map<string, typeof apptRows>();
        for (const appointment of apptRows) {
          const arr = appointmentsByJob.get(appointment.jobId) ?? [];
          arr.push(appointment);
          appointmentsByJob.set(appointment.jobId, arr);
        }
        const csv = toCsv(completedJobs.map((job) => {
          const onTime = jobOnTime(job.scheduledAt, (appointmentsByJob.get(job.id) ?? []).map((appointment) => appointment.startsAt));
          return {
            job: job.title,
            technician: job.assignedTo ? (userNames.get(job.assignedTo) ?? "Unknown technician") : "(unassigned)",
            scheduled_at: job.scheduledAt ? new Date(job.scheduledAt).toISOString().slice(0, 10) : "",
            on_time: onTime === null ? "" : onTime ? "yes" : "no",
          };
        }));
        return csvResponse(reply, csv, "technician-scorecards.csv");
      }
      default:
        return reply.code(400).send({
          error: "unknown report",
          hint: "report must be one of: ar-aging, estimate-conversion, revenue-trend, technician-scorecards",
        });
    }
  });
}
