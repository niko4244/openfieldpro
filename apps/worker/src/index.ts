import { and, eq, lte, gte } from "drizzle-orm";
import { db, recurringJobs, jobs, appointments, invoiceReminderSchedules, invoices } from "@ofp/db";
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

async function sendAppointmentReminders(now: Date) {
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const upcoming = await db
    .select()
    .from(appointments)
    .where(and(gte(appointments.startsAt, now), lte(appointments.startsAt, soon)));
  for (const a of upcoming) {
    await notify("Upcoming appointment", `Job ${a.jobId.slice(0, 8)} at ${a.startsAt.toISOString()}`);
  }
}

async function sendInvoiceReminders(now: Date) {
  const schedules = await db
    .select()
    .from(invoiceReminderSchedules)
    .where(eq(invoiceReminderSchedules.enabled, true));

  for (const schedule of schedules) {
    if (schedule.lastSentAt) continue;
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, schedule.orgId), eq(invoices.id, schedule.invoiceId)));
    if (!invoice || invoice.status !== "sent" || !invoice.dueAt) continue;
    const fireAt = new Date(invoice.dueAt.getTime() + schedule.daysAfterDue * 24 * 3_600_000);
    if (fireAt > now) continue;

    await notify(`Invoice ${invoice.number}`, schedule.message);
    await db
      .update(invoiceReminderSchedules)
      .set({ lastSentAt: now })
      .where(and(eq(invoiceReminderSchedules.orgId, schedule.orgId), eq(invoiceReminderSchedules.id, schedule.id)));
  }
}

async function tick() {
  const now = new Date();
  try {
    await materializeRecurring(now);
    await sendAppointmentReminders(now);
    await sendInvoiceReminders(now);
  } catch (e) {
    console.error(`[worker] tick error: ${(e as Error).message}`);
  }
}

console.log(`[worker] started, interval ${INTERVAL}ms`);
await tick();
setInterval(tick, INTERVAL);
