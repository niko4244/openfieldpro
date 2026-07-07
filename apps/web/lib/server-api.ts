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

/**
 * Unmangle the API's 4xx/5xx body for `ApiError.friendlyMessage`.
 * Closes audit-findings table item #13.
 *
 * Accepts:
 *   - `{ error: "string" }`            -> inner string
 *   - `{ error: ["a", "b", "c"] }`     -> joined with "; "
 *   - anything else (number, null, wrong shape, non-JSON) -> raw text
 */
function extractErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const e = (parsed as { error?: unknown }).error;
      if (typeof e === "string") return e;
      if (Array.isArray(e) && e.length > 0 && e.every((x) => typeof x === "string")) {
        return (e as string[]).join("; ");
      }
    }
  } catch {
    // body wasn't JSON; fall through
  }
  return text;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // SSR-side auth enforcement. The API has its own middleware; this
  // fail-fast means a missing token never leaves the server. The
  // `api` object exposed from this module only wraps authenticated
  // routes today (jobs, customers, appointments, invoices, etc.);
  // public routes are exposed through a different module.
  //
  // `cookies()` can throw outside a request scope (test harnesses,
  // server actions, edge cases). Map that to a clean 500 so the
  // boundary doesn't leak the underlying Next.js error. The bare
  // `catch` also logs the raw error server-side so the failure mode
  // is debuggable.
  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get("ofp_token")?.value;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[server-api] cookies() read failed:", err);
    throw new ApiError(500, "auth state unavailable");
  }
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
    throw new ApiError(res.status, extractErrorMessage(text));
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
