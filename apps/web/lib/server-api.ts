import { cookies } from "next/headers";
import { ApiError } from "./api";
import type {
  ActivityDTO,
  CustomerDTO,
  JobDTO,
  ReportSummaryDTO,
  UserDTO,
} from "@ofp/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface AppointmentDTO {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface InvoiceDTO {
  id: string;
  jobId: string;
  number: string;
  status: import("@ofp/shared").InvoiceStatus;
  total: number;
  dueAt?: string | null;
  createdAt?: string;
}

interface LineItemDTO {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const jar = await cookies();
  const token = jar.get("ofp_token")?.value;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
    headers.cookie = `ofp_token=${encodeURIComponent(token)}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  jobs: () => request<JobDTO[]>("/api/jobs"),
  job: (id: string) => request<JobDTO>(`/api/jobs/${id}`),
  customers: () => request<CustomerDTO[]>("/api/customers"),
  customer: (id: string) => request<CustomerDTO>(`/api/customers/${id}`),
  activities: (q?: { customerId?: string; jobId?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set("customerId", q.customerId);
    if (q?.jobId) params.set("jobId", q.jobId);
    const qs = params.toString();
    return request<ActivityDTO[]>(`/api/activities${qs ? `?${qs}` : ""}`);
  },
  appointments: () => request<AppointmentDTO[]>("/api/appointments"),
  invoices: () => request<InvoiceDTO[]>("/api/invoices"),
  lineItems: (jobId: string) => request<LineItemDTO[]>(`/api/jobs/${jobId}/line-items`),
  reports: () => request<ReportSummaryDTO>("/api/reports/summary"),
  users: () => request<UserDTO[]>("/api/users"),
};
