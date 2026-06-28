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

export function scheduleAppointment(input: { jobId: string; startsAt: string; endsAt: string; technicianId?: string }) {
  return request<{ id: string }>("/api/appointments", { method: "POST", body: JSON.stringify(input) });
}

export function createInvoice(input: { jobId: string; dueAt?: string }) {
  return request<{ id: string; number: string }>("/api/invoices", { method: "POST", body: JSON.stringify(input) });
}

export function recordPayment(id: string, input: { amount: number; method: "manual" | "cash" | "check" | "card"; reference?: string }) {
  return request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
