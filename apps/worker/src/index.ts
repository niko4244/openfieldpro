// OpenFieldPro background worker: materializes due recurring jobs and sends
// appointment reminders. Polling-based for the starter stack; Redis is already
// available when the workload is ready to move to BullMQ-backed jobs.
import { and, eq, lte, gte } from "drizzle-orm";
import { db, recurringJobs, jobs, appointments } from "@ofp/db";
import { catchUp } from "../../api/src/recurrence.ts";
import { notify } from "./notify.ts";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

async function materializeRecurring(now: Date) {
  const due = await db
    .select()
    .from(recurringJobs)
    .where(and(eq(recurringJobs.active, true), lte(recurringJobs.nextRunAt, now)));
  for (const tpl of due) {
    const { due: count, next } = catchUp(tpl.nextRunAt, tpl.intervalDays, now);
    for (let i = 0; i < count; i++) {
      await db.insert(jobs).values({
        orgId: tpl.orgId,
        customerId: tpl.customerId,
        title: tpl.title,
        status: "lead",
      });
    }
    await db.update(recurringJobs).set({ nextRunAt: next }).where(eq(recurringJobs.id, tpl.id));
    if (count > 0) console.log(`[worker] recurring "${tpl.title}": materialized ${count} job(s)`);
  }
}

async function sendReminders(now: Date) {
  // Appointments starting in the next 24h. A reminded_at column should be added
  // before production reminder delivery to dedupe outbound notifications.
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const upcoming = await db
    .select()
    .from(appointments)
    .where(and(gte(appointments.startsAt, now), lte(appointments.startsAt, soon)));
  for (const a of upcoming) {
    await notify("Upcoming appointment", `Job ${a.jobId.slice(0, 8)} at ${a.startsAt.toISOString()}`);
  }
}

async function tick() {
  const now = new Date();
  try {
    await materializeRecurring(now);
    await sendReminders(now);
  } catch (e) {
    console.error(`[worker] tick error: ${(e as Error).message}`);
  }
}

console.log(`[worker] started, interval ${INTERVAL}ms`);
await tick();
setInterval(tick, INTERVAL);
