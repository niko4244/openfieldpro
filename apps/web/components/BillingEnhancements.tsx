"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProgressMilestone, invoiceProgressMilestone, updateInvoiceReminders } from "../lib/client-api";
import { formatMoney } from "@ofp/shared";
import type { InvoiceReminderScheduleDTO, ProgressInvoiceMilestoneDTO } from "../lib/api";

function cents(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function bps(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

function Status({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>;
}

export function ProgressMilestoneForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        await createProgressMilestone(jobId, {
          label: String(form.get("label") ?? ""),
          amountCents: cents(form.get("amount")),
          percentBps: bps(form.get("percent")),
          dueAt: iso(form.get("dueAt")),
        });
        setMessage("Progress milestone added.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form className="workflow-form compact-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2"><span>Milestone label</span><input name="label" required placeholder="50% deposit, rough-in complete, final balance…" /></label>
        <label><span>Amount</span><input name="amount" type="number" min="0" step="0.01" placeholder="0.00" /></label>
        <label><span>Percent of job</span><input name="percent" type="number" min="0" max="100" step="0.01" placeholder="50" /></label>
        <label className="span-2"><span>Due date</span><input name="dueAt" type="datetime-local" /></label>
      </div>
      <button className="button primary" disabled={pending}>{pending ? "Adding…" : "Add milestone"}</button>
      <Status message={message} />
    </form>
  );
}

export function ProgressMilestoneList({ milestones }: { milestones: ProgressInvoiceMilestoneDTO[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function invoice(id: string) {
    setPendingId(id);
    setMessage(null);
    try {
      const result = await invoiceProgressMilestone(id);
      setMessage(`Created invoice ${result.invoice.number}.`);
      router.refresh();
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="card-list">
      {milestones.map((milestone) => (
        <div className="list-row" key={milestone.id}>
          <div>
            <strong>{milestone.label}</strong>
            <p className="muted">{formatMoney(milestone.amountCents)} · {(milestone.percentBps / 100).toFixed(2).replace(/\.00$/, "")}% · {milestone.dueAt ? new Date(milestone.dueAt).toLocaleDateString() : "No due date"}</p>
          </div>
          <div className="action-panel">
            <span className={`status-pill status-${milestone.status}`}>{milestone.status}</span>
            {!milestone.invoiceId && <button className="button compact" disabled={pendingId === milestone.id} onClick={() => invoice(milestone.id)}>{pendingId === milestone.id ? "Creating…" : "Create invoice"}</button>}
          </div>
        </div>
      ))}
      {milestones.length === 0 && <div className="empty-state">No progress milestones yet. Add deposits, phase invoices, or final-balance billing here.</div>}
      <Status message={message} />
    </div>
  );
}

export function ReminderScheduleForm({ invoiceId, schedules }: { invoiceId: string; schedules: InvoiceReminderScheduleDTO[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const defaults = schedules.length ? schedules : [
    { id: "0", invoiceId, daysAfterDue: 0, channel: "email" as const, message: "Invoice due today", enabled: true },
    { id: "3", invoiceId, daysAfterDue: 3, channel: "email" as const, message: "Invoice overdue by 3 days", enabled: true },
    { id: "7", invoiceId, daysAfterDue: 7, channel: "email" as const, message: "Invoice overdue by 7 days", enabled: true },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = defaults.map((row, index) => ({
      daysAfterDue: Number(form.get(`days-${index}`) ?? row.daysAfterDue),
      channel: String(form.get(`channel-${index}`) ?? row.channel) as "email" | "sms" | "manual",
      message: String(form.get(`message-${index}`) ?? row.message),
      enabled: form.get(`enabled-${index}`) === "on",
    }));
    setMessage(null);
    startTransition(async () => {
      try {
        await updateInvoiceReminders(invoiceId, next);
        setMessage("Reminder schedule saved.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form className="workflow-form compact-form" onSubmit={submit}>
      {defaults.map((row, index) => (
        <div className="form-grid" key={row.id}>
          <label><span>Days after due</span><input name={`days-${index}`} type="number" min="0" defaultValue={row.daysAfterDue} /></label>
          <label><span>Channel</span><select name={`channel-${index}`} defaultValue={row.channel}><option value="email">Email</option><option value="sms">SMS</option><option value="manual">Manual</option></select></label>
          <label className="span-2"><span>Message</span><input name={`message-${index}`} defaultValue={row.message} /></label>
          <label className="span-2"><input name={`enabled-${index}`} type="checkbox" defaultChecked={row.enabled} /> Enabled {row.lastSentAt ? `(sent ${new Date(row.lastSentAt).toLocaleDateString()})` : ""}</label>
        </div>
      ))}
      <button className="button primary" disabled={pending}>{pending ? "Saving…" : "Save reminders"}</button>
      <Status message={message} />
    </form>
  );
}
