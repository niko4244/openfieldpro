// Unified activity-log emitter. Callers go through this so the schema is
// written consistently. The emitter never throws; a primary billing or scheduling
// action should not fail because the secondary activity log missed a write.
//
// Canonical kind vocabulary:
//   job.created, line_item.added, line_item.removed, invoice.created,
//   payment.received, appointment.scheduled, note.added
//
// Pass either customerId or jobId (or both). If only jobId is given, the emitter
// resolves the customerId so customer timeline pages stay complete.
import { eq } from "drizzle-orm";
import { db, activities, jobs } from "@ofp/db";

export interface ActivityRefs {
  customerId?: string | null;
  jobId?: string | null;
}

export async function safeEmitActivity(
  orgId: string,
  kind: string,
  summary: string,
  refs: ActivityRefs = {},
): Promise<void> {
  try {
    let { customerId, jobId } = refs;
    if (jobId && !customerId) {
      const [job] = await db
        .select({ customerId: jobs.customerId })
        .from(jobs)
        .where(eq(jobs.id, jobId));
      if (job) customerId = job.customerId;
    }
    await db.insert(activities).values({
      orgId,
      customerId: customerId ?? null,
      jobId: jobId ?? null,
      kind,
      summary,
    });
  } catch (err) {
    // Best-effort logging for the current starter stack. Upgrade to a transactional
    // outbox if activity history becomes audit-grade data.
    console.error(`[activities] emit failed (kind=${kind}):`, err);
  }
}
