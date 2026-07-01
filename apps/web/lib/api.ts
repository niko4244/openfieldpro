const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`${status}: ${body}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  // ponytail: reads token from localStorage on the client; RSCs don't have
  // access to it, so they run unauthenticated against the demo seed.
  // Ceiling: multi-org with real auth per user. Upgrade: switch to
  // httpOnly cookie set by the login endpoint, or pass the token via a
  // server-side session cookie.
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ofp_token");
    if (token) headers["authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body);
  }
  // Some endpoints return 204 or empty body
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── Public helpers ──

export interface LoginResult {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ── Resource wrappers ──

type JobDTO = import("@ofp/shared").JobDTO;
type CustomerDTO = import("@ofp/shared").CustomerDTO;
type ActivityDTO = import("@ofp/shared").ActivityDTO;
type ReportSummaryDTO = import("@ofp/shared").ReportSummaryDTO;
type UserDTO = import("@ofp/shared").UserDTO;
type RecurringJobDTO = import("@ofp/shared").RecurringJobDTO;

interface CatalogItemDTO {
  id: string;
  orgId: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  costCents: number;
  taxable: boolean;
  active: boolean;
  createdAt: string;
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
  status: import("@ofp/shared").InvoiceStatus;
  total: number;
  dueAt?: string | null;
  createdAt?: string;
}

interface Estimate {
  id: string;
  orgId: string;
  jobId: string;
  total: number;
  accepted: boolean;
  createdAt: string;
}

/** Phase 6 — magic-link approval flow. */
type SendEstimateResponse = import("@ofp/shared").SendEstimateResponseDTO;
type PublicApproval = import("@ofp/shared").PublicApprovalDTO;

interface LineItem {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

interface Review {
  id: string;
  orgId: string;
  jobId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

interface ReviewList {
  reviews: Review[];
  average: number;
  count: number;
}

interface PhotoRecord {
  id: string;
  orgId: string;
  jobId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string;
  createdAt: string;
}

interface Payment {
  id: string;
  orgId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

interface InvoiceDetail extends Invoice {
  lineItems: LineItem[];
  payments: Payment[];
}

interface NotificationDTO {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

interface SearchResults {
  jobs: { id: string; title: string; status: string }[];
  customers: { id: string; name: string }[];
  invoices: { id: string; number: string; status: string }[];
}

interface EquipmentDTO {
  id: string;
  orgId: string;
  customerId: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface PluginCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  author: string | null;
  iconUrl: string | null;
  events: string[];
  scopes: string[];
  transform: string;
  firstParty: boolean;
  installed: boolean;
  installId: string | null;
  enabled: boolean;
}

interface PluginInstall {
  id: string;
  pluginId: string;
  slug?: string;
  name?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  webhookUrl: string | null;
  installedAt?: string;
}

interface PluginEvent {
  id: string;
  orgId: string;
  installId: string;
  kind: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  // ── Public (no auth) ──
  publicOrg: () => request<{ org: { id: string; name: string } }>("/api/public/org/default"),
  publicBook: (orgId: string, body: { name: string; email?: string; phone?: string; title?: string; description?: string }) =>
    request<{ ok: boolean }>(`/api/public/${orgId}/book`, { method: "POST", body: JSON.stringify(body) }),

  jobs: () => request<JobDTO[]>("/api/jobs"),
  job: (id: string) => request<JobDTO>(`/api/jobs/${id}`),
  patchJob: (id: string, data: Record<string, unknown>) =>
    request<JobDTO>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  customers: () => request<CustomerDTO[]>("/api/customers"),
  customer: (id: string) => request<CustomerDTO>(`/api/customers/${id}`),
  createCustomer: (body: { name: string; email?: string; phone?: string; notes?: string }) =>
    request<CustomerDTO>("/api/customers", { method: "POST", body: JSON.stringify(body) }),
  patchCustomer: (id: string, body: { name?: string; email?: string | null; phone?: string | null; notes?: string | null }) =>
    request<CustomerDTO>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  activities: (q?: { customerId?: string; jobId?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set("customerId", q.customerId);
    if (q?.jobId) params.set("jobId", q.jobId);
    const qs = params.toString();
    return request<ActivityDTO[]>(`/api/activities${qs ? `?${qs}` : ""}`);
  },

  appointments: () => request<Appointment[]>("/api/appointments"),
  createAppointment: (body: { jobId: string; technicianId?: string; startsAt: string; endsAt: string }) =>
    request<Appointment>("/api/appointments", { method: "POST", body: JSON.stringify(body) }),
  invoices: () => request<Invoice[]>("/api/invoices"),
  invoice: (id: string) => request<InvoiceDetail>(`/api/invoices/${id}`),
  createInvoice: (body: { jobId: string; dueAt?: string }) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  updateInvoiceStatus: (id: string, status: "sent" | "void") =>
    request<{ ok: boolean; status: string }>(`/api/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  recordPayment: (id: string, body: { amount: number; method?: string }) =>
    request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reports: () => request<ReportSummaryDTO>("/api/reports/summary"),

  estimates: () => request<Estimate[]>("/api/estimates"),
  createEstimate: (body: { jobId: string }) =>
    request<Estimate>("/api/estimates", { method: "POST", body: JSON.stringify(body) }),
  /** Phase 6 — POST /api/estimates/:id/send, mints magic link (idempotent). */
  sendEstimate: (id: string) =>
    request<SendEstimateResponse>(`/api/estimates/${id}/send`, { method: "POST", body: JSON.stringify({}) }),
  /** Phase 6 — public, no JWT; returns the page payload for the magic link. */
  fetchPublicApproval: (token: string) =>
    request<PublicApproval>(`/api/public/approvals/${encodeURIComponent(token)}`),
  /** Phase 6 — public, no JWT; submits the customer signature. */
  submitApproval: (token: string, body: { signerName: string; signatureData: string }) =>
    request<{ ok: boolean; alreadyAccepted: boolean; signedAt: string | null }>(
      `/api/public/approvals/${encodeURIComponent(token)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  reviews: () => request<ReviewList>("/api/reviews"),
  patchReview: (id: string, body: { reply?: string }) =>
    request<{ id: string; reply: string | null }>(`/api/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  jobPhotos: (jobId: string) => request<PhotoRecord[]>(`/api/photos/job/${jobId}`),
  uploadJobPhoto: async (jobId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const token = typeof window !== "undefined" ? localStorage.getItem("ofp_token") : null;
    const res = await fetch(`${BASE}/api/photos/upload/${jobId}`, {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: fd,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, body);
    }
    return res.json() as Promise<PhotoRecord>;
  },

  lineItems: (jobId: string) => request<LineItem[]>(`/api/jobs/${jobId}/line-items`),

  users: () => request<UserDTO[]>("/api/users"),
  recurring: () => request<RecurringJobDTO[]>("/api/recurring"),

  // ── Settings / Users ──
  patchUser: (id: string, body: { role?: string }) => request<UserDTO>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

  // ── Notifications ──
  notifications: () => request<NotificationDTO[]>("/api/notifications"),
  unreadNotificationCount: () => request<{ count: number }>("/api/notifications/unread-count"),
  markNotificationRead: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request<void>("/api/notifications/read-all", { method: "POST" }),

  // ── Search ──
  search: (q: string) => {
    const params = new URLSearchParams({ q });
    return request<SearchResults>(`/api/search?${params}`);
  },

  // ── Equipment ──
  equipment: (q?: { customerId?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set("customerId", q.customerId);
    const qs = params.toString();
    return request<EquipmentDTO[]>(`/api/equipment${qs ? `?${qs}` : ""}`);
  },
  createEquipment: (body: { customerId: string; type: string; make?: string; model?: string; serialNumber?: string; installDate?: string; warrantyExpiry?: string; notes?: string }) =>
    request<EquipmentDTO>("/api/equipment", { method: "POST", body: JSON.stringify(body) }),
  patchEquipment: (id: string, body: Record<string, unknown>) =>
    request<EquipmentDTO>(`/api/equipment/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEquipment: (id: string) =>
    request<void>(`/api/equipment/${id}`, { method: "DELETE" }),

  // ── Plugins / Integrations ──
  plugins: () => request<PluginCatalogEntry[]>("/api/plugins"),
  pluginInstalls: () => request<PluginInstall[]>("/api/plugins/installs"),
  installPlugin: (body: { pluginId: string; webhookUrl?: string; config?: Record<string, unknown> }) =>
    request<{ install: PluginInstall; token: string; scopes: string[] }>("/api/plugins/installs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchPluginInstall: (id: string, body: { enabled?: boolean; webhookUrl?: string | null; config?: Record<string, unknown> }) =>
    request<PluginInstall>(`/api/plugins/installs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  uninstallPlugin: (id: string) => request<void>(`/api/plugins/installs/${id}`, { method: "DELETE" }),
  pluginEvents: (installId?: string) => {
    const qs = installId ? `?installId=${installId}` : "";
    return request<PluginEvent[]>(`/api/plugins/events${qs}`);
  },

  // ── Catalog / Price Book ──
  catalogCategories: () => request<{ id: string; name: string; description?: string | null }[]>("/api/catalog/categories"),
  createCatalogCategory: (body: { name: string; description?: string }) =>
    request<{ id: string; name: string; description?: string | null }>("/api/catalog/categories", { method: "POST", body: JSON.stringify(body) }),
  catalogItems: (q?: { search?: string; categoryId?: string; active?: string }) => {
    const params = new URLSearchParams();
    if (q?.search) params.set("search", q.search);
    if (q?.categoryId) params.set("categoryId", q.categoryId);
    if (q?.active) params.set("active", q.active);
    const qs = params.toString();
    return request<CatalogItemDTO[]>(`/api/catalog/items${qs ? `?${qs}` : ""}`);
  },
  createCatalogItem: (body: { categoryId: string; name: string; description?: string; priceCents: number; costCents: number; taxable?: boolean; active?: boolean }) =>
    request<CatalogItemDTO>("/api/catalog/items", { method: "POST", body: JSON.stringify(body) }),
  patchCatalogItem: (id: string, body: Partial<{ name: string; description: string; priceCents: number; costCents: number; taxable: boolean; active: boolean; categoryId: string }>) =>
    request<CatalogItemDTO>(`/api/catalog/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCatalogItem: (id: string) =>
    request<void>(`/api/catalog/items/${id}`, { method: "DELETE" }),
};
