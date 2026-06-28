const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createCustomer(input: { name: string; email?: string; phone?: string; notes?: string }) {
  return request<{ id: string }>("/api/customers", { method: "POST", body: JSON.stringify(input) });
}

export function createJob(input: {
  customerId: string;
  title: string;
  description?: string;
  status?: "lead" | "scheduled" | "in_progress" | "completed" | "canceled";
  total?: number;
  laborCostCents?: number;
}) {
  return request<{ id: string }>("/api/jobs", { method: "POST", body: JSON.stringify(input) });
}

export function updateJob(id: string, input: { status?: string; total?: number; laborCostCents?: number }) {
  return request<{ id: string }>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function addLineItem(
  jobId: string,
  input: { description: string; quantity: number; unitPrice: number; unitCost?: number; taxable?: boolean },
) {
  return request<{ lineItem: { id: string }; jobTotal: number; jobCostCents: number; jobMarginCents: number }>(
    `/api/jobs/${jobId}/line-items`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function deleteLineItem(id: string) {
  return request<{ ok: true; jobTotal: number; jobCostCents: number; jobMarginCents: number }>(`/api/line-items/${id}`, {
    method: "DELETE",
  });
}

export function createEstimate(input: { jobId: string }) {
  return request<{ id: string; total: number; accepted: boolean }>("/api/estimates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function acceptEstimate(id: string) {
  return request<{ id: string; accepted: boolean; jobStatus: string }>(`/api/estimates/${id}/accept`, { method: "POST" });
}

export function scheduleAppointment(input: { jobId: string; startsAt: string; endsAt: string; technicianId?: string }) {
  return request<{ id: string }>("/api/appointments", { method: "POST", body: JSON.stringify(input) });
}

export function assignDispatchJob(
  jobId: string,
  input: { technicianId?: string | null; startsAt?: string; endsAt?: string },
) {
  return request<{ jobId: string }>(`/api/dispatch/jobs/${jobId}/assign`, { method: "POST", body: JSON.stringify(input) });
}

export function updateDispatchStatus(jobId: string, status: "lead" | "scheduled" | "in_progress" | "completed" | "canceled") {
  return request<{ id: string; status: string }>(`/api/dispatch/jobs/${jobId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function createInvoice(input: { jobId: string; dueAt?: string; poNumber?: string }) {
  return request<{ id: string; number: string }>("/api/invoices", { method: "POST", body: JSON.stringify(input) });
}

export function createProgressMilestone(jobId: string, input: { label: string; amountCents?: number; percentBps?: number; dueAt?: string }) {
  return request<{ id: string }>(`/api/invoices/progress/${jobId}`, { method: "POST", body: JSON.stringify(input) });
}

export function invoiceProgressMilestone(id: string) {
  return request<{ invoice: { id: string; number: string } }>(`/api/invoices/progress-milestones/${id}/invoice`, { method: "POST" });
}

export function sendInvoice(id: string) {
  return request<{ id: string; number: string; status: string }>(`/api/invoices/${id}/send`, { method: "POST" });
}

export function updateInvoiceReminders(id: string, schedules: Array<{ daysAfterDue: number; channel: "email" | "sms" | "manual"; message: string; enabled: boolean }>) {
  return request<{ invoiceId: string }>(`/api/invoices/${id}/reminders`, { method: "PUT", body: JSON.stringify({ schedules }) });
}

export function updateInvoiceTemplate(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/invoice-template", { method: "PUT", body: JSON.stringify(input) });
}

export function recordPayment(id: string, input: { amount: number; method: "manual" | "cash" | "check" | "card"; reference?: string }) {
  return request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
