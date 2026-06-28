import { cookies } from "next/headers";
import type { CustomerDTO, JobDTO, ReportSummaryDTO, ActivityDTO } from "@ofp/shared";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export interface AppointmentDTO {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  jobId: string;
  dueAt: string | null;
}

async function authHeaders(): Promise<HeadersInit> {
  try {
    const token = (await cookies()).get("ofp_token")?.value;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  customers: () => get<CustomerDTO[]>("/api/customers"),
  customer: (id: string) => get<CustomerDTO>(`/api/customers/${id}`),
  activities: (filter: { customerId?: string; jobId?: string }) => {
    const params: Record<string, string> = {};
    if (filter.customerId) params.customerId = filter.customerId;
    if (filter.jobId) params.jobId = filter.jobId;
    const qs = new URLSearchParams(params).toString();
    return get<ActivityDTO[]>(`/api/activities${qs ? `?${qs}` : ""}`);
  },
  jobs: () => get<JobDTO[]>("/api/jobs"),
  appointments: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return get<AppointmentDTO[]>(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  invoices: () => get<InvoiceDTO[]>("/api/invoices"),
  reports: () => get<ReportSummaryDTO>("/api/reports/summary"),
  health: () => get<{ ok: boolean }>("/api/health"),
};
