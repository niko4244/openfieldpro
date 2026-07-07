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

/**
 * Envelope check on a 2xx response. Without a per-endpoint schema
 * (zod isn't a dep in apps/web) the strongest claim we can make
 * cheaply is: refuse primitive payloads when T is meant to be an
 * object/array. The `as T` cast below remains weak at the per-field
 * level — that is a follow-up once zod lands in apps/web. The cast
 * we close here is the catastrophic one: returning a string or
 * number where a DTO was expected, which would crash the page
 * with `Object.values is not a function` or `array.map is not a
 * function`.
 */
function validateEnvelope<T>(parsed: unknown): T {
  if (parsed === undefined) return undefined as T;
  if (parsed === null) {
    throw new Error("Invalid response envelope: null body");
  }
  if (typeof parsed !== "object") {
    throw new Error(
      `Invalid response envelope: expected object/array, got ${typeof parsed}`,
    );
  }
  return parsed as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // SSR-side auth enforcement. The API has its own middleware; this
  // fail-fast means a missing token never leaves the server. The
  // `api` object exposed from this module only wraps authenticated
  // routes today (jobs, customers, appointments, invoices, etc.);
  // public routes are exposed through a different module.
  const jar = await cookies();
  const token = jar.get("ofp_token")?.value;
  if (!token) throw new ApiError(401, "authorization required");

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    authorization: `Bearer ${token}`,
    cookie: `ofp_token=${encodeURIComponent(token)}`,
  };

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...headers },
  });

  const text = await res.text();

  if (!res.ok) {
    // Unmangle the API's `{ error: msg }` body so the page sees a
    // clean string via `ApiError.friendlyMessage`, instead of a raw
    // `400: {"error":"license expired"}` string in a React error
    // boundary. Closes audit-findings table item #13.
    let errorMsg = text;
    try {
      const parsed = JSON.parse(text);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { error?: unknown }).error === "string"
      ) {
        errorMsg = (parsed as { error: string }).error;
      }
    } catch {
      // body wasn't JSON; fall through with the raw text
    }
    throw new ApiError(res.status, errorMsg);
  }

  if (!text) return undefined as T;
  const parsed = JSON.parse(text);
  return validateEnvelope<T>(parsed);
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
