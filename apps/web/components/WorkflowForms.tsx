"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCustomer, createInvoice, createJob, recordPayment, scheduleAppointment, updateJob } from "../lib/client-api";

type CustomerOption = { id: string; name: string };
type JobOption = { id: string; title: string; total?: number; customerId?: string; status?: string };
type InvoiceOption = { id: string; number: string; total: number; status: string };

function formDataFrom(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function cents(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length ? text : undefined;
}

function isoFromLocal(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return new Date(text).toISOString();
}

function Status({ message }: { message: string | null }) {
  if (!message) return null;
  const error = message.startsWith("Error:");
  return <p className={error ? "notice error" : "notice success"}>{message}</p>;
}

export function CustomerCreateForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    const formData = formDataFrom(event);
    setMessage(null);
    startTransition(async () => {
      try {
        const customer = await createCustomer({
          name: String(formData.get("name") ?? ""),
          email: optional(formData.get("email")),
          phone: optional(formData.get("phone")),
          notes: optional(formData.get("notes")),
        });
        setMessage("Customer created.");
        router.push(`/customers/${customer.id}`);
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="workflow-form">
      <div className="form-grid">
        <label><span>Name</span><input name="name" required placeholder="Customer or company" /></label>
        <label><span>Email</span><input name="email" type="email" placeholder="customer@example.com" /></label>
        <label><span>Phone</span><input name="phone" placeholder="(555) 555-5555" /></label>
        <label className="span-2"><span>Notes</span><textarea name="notes" placeholder="Gate code, service preferences, equipment notes…" /></label>
      </div>
      <button className="button primary" disabled={pending}>{pending ? "Creating…" : "Create customer"}</button>
      <Status message={message} />
    </form>
  );
}

export function JobCreateForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    const formData = formDataFrom(event);
    setMessage(null);
    startTransition(async () => {
      try {
        const job = await createJob({
          customerId: String(formData.get("customerId") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: optional(formData.get("description")),
          status: "lead",
          total: cents(formData.get("total")),
          laborCostCents: cents(formData.get("laborCost")),
        });
        setMessage("Job created.");
        router.push(`/jobs/${job.id}`);
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="workflow-form">
      <div className="form-grid">
        <label>
          <span>Customer</span>
          <select name="customerId" required defaultValue="">
            <option value="" disabled>Choose customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label><span>Job title</span><input name="title" required placeholder="No-cool diagnostic" /></label>
        <label><span>Quoted total</span><input name="total" type="number" min="0" step="0.01" placeholder="0.00" /></label>
        <label><span>Labor cost</span><input name="laborCost" type="number" min="0" step="0.01" placeholder="0.00" /></label>
        <label className="span-2"><span>Description</span><textarea name="description" placeholder="Complaint, scope, or technician instructions…" /></label>
      </div>
      <button className="button primary" disabled={pending}>{pending ? "Creating…" : "Create job"}</button>
      <Status message={message} />
    </form>
  );
}

export function AppointmentCreateForm({ jobs }: { jobs: JobOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    const formData = formDataFrom(event);
    setMessage(null);
    startTransition(async () => {
      try {
        const startsAt = isoFromLocal(formData.get("startsAt"));
        const endsAt = isoFromLocal(formData.get("endsAt"));
        if (!startsAt || !endsAt) throw new Error("Start and end time are required.");
        await scheduleAppointment({ jobId: String(formData.get("jobId") ?? ""), startsAt, endsAt });
        setMessage("Appointment scheduled.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="workflow-form compact-form">
      <div className="form-grid">
        <label className="span-2">
          <span>Job</span>
          <select name="jobId" required defaultValue="">
            <option value="" disabled>Choose unscheduled job</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </label>
        <label><span>Starts</span><input name="startsAt" type="datetime-local" required /></label>
        <label><span>Ends</span><input name="endsAt" type="datetime-local" required /></label>
      </div>
      <button className="button primary" disabled={pending}>{pending ? "Scheduling…" : "Schedule job"}</button>
      <Status message={message} />
    </form>
  );
}

export function JobActionPanel({ job }: { job: JobOption }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invoiceTotal = useMemo(() => ((job.total ?? 0) / 100).toFixed(2), [job.total]);

  function updateStatus(status: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateJob(job.id, { status });
        setMessage(`Job marked ${status.replaceAll("_", " ")}.`);
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  function invoice() {
    setMessage(null);
    startTransition(async () => {
      try {
        const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const created = await createInvoice({ jobId: job.id, dueAt });
        setMessage(`Invoice ${created.number} created for $${invoiceTotal}.`);
        router.push("/invoices");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <div className="action-panel">
      <button className="button" disabled={pending} onClick={() => updateStatus("in_progress")}>Start job</button>
      <button className="button" disabled={pending} onClick={() => updateStatus("completed")}>Mark complete</button>
      <button className="button primary" disabled={pending} onClick={invoice}>Create invoice</button>
      <Status message={message} />
    </div>
  );
}

export function PaymentForm({ invoices }: { invoices: InvoiceOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    const formData = formDataFrom(event);
    setMessage(null);
    startTransition(async () => {
      try {
        const invoiceId = String(formData.get("invoiceId") ?? "");
        await recordPayment(invoiceId, {
          amount: cents(formData.get("amount")),
          method: String(formData.get("method") ?? "manual") as "manual" | "cash" | "check" | "card",
          reference: optional(formData.get("reference")),
        });
        setMessage("Payment recorded.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="workflow-form compact-form">
      <div className="form-grid">
        <label>
          <span>Invoice</span>
          <select name="invoiceId" required defaultValue="">
            <option value="" disabled>Choose invoice</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>{invoice.number} · ${(invoice.total / 100).toFixed(2)}</option>
            ))}
          </select>
        </label>
        <label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></label>
        <label><span>Method</span><select name="method" defaultValue="manual"><option value="manual">Manual</option><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card terminal</option></select></label>
        <label><span>Reference</span><input name="reference" placeholder="Check #, terminal ref, note" /></label>
      </div>
      <button className="button primary" disabled={pending}>{pending ? "Recording…" : "Record payment"}</button>
      <Status message={message} />
    </form>
  );
}
