import "server-only";

import { cookies } from "next/headers";
import type { ActivityDTO, CustomerDTO, JobDTO } from "@ofp/shared";
import type {
  DiagnosticSessionDetail,
  DiagnosticSessionListItem,
} from "@/lib/diagnostics-api";

const BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface SessionUserDTO {
  id: string;
  name: string;
  email: string;
  role: "owner" | "dispatcher" | "technician";
}

export interface JobResponseDTO extends JobDTO {
  description?: string | null;
  laborCostCents?: number;
  financialsRestricted?: boolean;
}

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface Invoice {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  dueAt?: string | null;
  createdAt?: string;
}

interface LineItem {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  financialsRestricted?: boolean;
  createdAt: string;
}

export class ServerApiError extends Error {
  constructor(public status: number, body: string) {
    super(`${status}: ${body}`);
    this.name = "ServerApiError";
  }
}

export async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ServerApiError(response.status, body || response.statusText);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const serverApi = {
  me: () => serverRequest<SessionUserDTO>("/api/auth/me"),
  jobs: () => serverRequest<JobResponseDTO[]>("/api/jobs"),
  job: (id: string) => serverRequest<JobResponseDTO>(`/api/jobs/${id}`),
  customers: () => serverRequest<CustomerDTO[]>("/api/customers"),
  appointments: () => serverRequest<Appointment[]>("/api/appointments"),
  invoices: () => serverRequest<Invoice[]>("/api/invoices"),
  activities: (query?: { jobId?: string; customerId?: string }) => {
    const params = new URLSearchParams();
    if (query?.jobId) params.set("jobId", query.jobId);
    if (query?.customerId) params.set("customerId", query.customerId);
    const suffix = params.toString() ? `?${params}` : "";
    return serverRequest<ActivityDTO[]>(`/api/activities${suffix}`);
  },
  lineItems: (jobId: string) => serverRequest<LineItem[]>(`/api/jobs/${jobId}/line-items`),
  diagnosticSessions: (query?: { jobId?: string; equipmentId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (query?.jobId) params.set("jobId", query.jobId);
    if (query?.equipmentId) params.set("equipmentId", query.equipmentId);
    if (query?.status) params.set("status", query.status);
    const suffix = params.toString() ? `?${params}` : "";
    return serverRequest<DiagnosticSessionListItem[]>(`/api/diagnostics/sessions${suffix}`);
  },
  diagnosticSession: (id: string) =>
    serverRequest<DiagnosticSessionDetail>(`/api/diagnostics/sessions/${id}`),
};
