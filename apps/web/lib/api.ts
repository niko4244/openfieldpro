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
type PropertyDTO = import("@ofp/shared").PropertyDTO;
type ActivityDTO = import("@ofp/shared").ActivityDTO;
type ReportSummaryDTO = import("@ofp/shared").ReportSummaryDTO;
type UserDTO = import("@ofp/shared").UserDTO;
type RecurringJobDTO = import("@ofp/shared").RecurringJobDTO;
type TemplateDTO = import("@ofp/shared").TemplateDTO;
type TemplateSubjectDTO = import("@ofp/shared").TemplateSubjectDTO;
type TemplateChannel = import("@ofp/shared").TemplateChannel;
type InventoryItemDTO = import("@ofp/shared").InventoryItemDTO;
type InventoryAdjustmentDTO = import("@ofp/shared").InventoryAdjustmentDTO;

interface TemplatePreview {
  subject: string;
  body: string;
  chars?: number;
  segments?: number;
  variant?: string | null;
}

interface AutomationRuleDTO {
  id: string;
  orgId: string;
  name: string;
  eventKey: string;
  channel: TemplateChannel;
  templateId: string;
  conditionFn: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: {
    status: "pending" | "fired" | "failed" | "skipped";
    firedAt: string;
    variantLabel: string | null;
    error: string | null;
  } | null;
}

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

interface LineItemMutationResult {
  lineItem: LineItem;
  jobTotal: number;
  jobCostCents: number;
  jobMarginCents: number;
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

  customerProperties: (customerId: string) =>
    request<PropertyDTO[]>(`/api/customers/${customerId}/properties`),
  createProperty: (customerId: string, body: { address: string; lat?: string; lng?: string }) =>
    request<PropertyDTO>(`/api/customers/${customerId}/properties`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchProperty: (
    customerId: string,
    propertyId: string,
    body: { address?: string; lat?: string | null; lng?: string | null },
  ) =>
    request<PropertyDTO>(`/api/customers/${customerId}/properties/${propertyId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProperty: (customerId: string, propertyId: string) =>
    request<void>(`/api/customers/${customerId}/properties/${propertyId}`, { method: "DELETE" }),

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
  patchInvoice: (id: string, body: { dueAt?: string | null; status?: "sent" | "void"; syncTotal?: boolean }) =>
    request<Invoice & { ok: boolean }>(`/api/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  updateInvoiceStatus: (id: string, status: "sent" | "void") =>
    api.patchInvoice(id, { status }),
  recordPayment: (id: string, body: { amount: number; method?: string; reference?: string }) =>
    request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reports: () => request<ReportSummaryDTO>("/api/reports/summary"),

  estimates: () => request<Estimate[]>("/api/estimates"),
  createEstimate: (body: { jobId: string }) =>
    request<Estimate>("/api/estimates", { method: "POST", body: JSON.stringify(body) }),

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
  createLineItem: (
    jobId: string,
    body: { description: string; quantity: number; unitPrice: number; unitCost?: number },
  ) =>
    request<LineItemMutationResult>(`/api/jobs/${jobId}/line-items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchLineItem: (
    id: string,
    body: { description?: string; quantity?: number; unitPrice?: number; unitCost?: number },
  ) =>
    request<LineItemMutationResult>(`/api/line-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteLineItem: (id: string) =>
    request<{ ok: boolean; jobTotal: number; jobCostCents: number; jobMarginCents: number }>(`/api/line-items/${id}`, {
      method: "DELETE",
    }),

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
  deleteCatalogItem: (id: string) => request<void>(`/api/catalog/items/${id}`, { method: "DELETE" }),

  // ── Templates / Automation ──
  templates: () => request<TemplateDTO[]>("/api/templates"),
  createTemplate: (body: {
    key: string;
    channel: TemplateChannel;
    name: string;
    subject?: string | null;
    body: string;
    enabled?: boolean;
  }) => request<TemplateDTO>("/api/templates", { method: "POST", body: JSON.stringify(body) }),
  patchTemplate: (
    id: string,
    body: Partial<{
      key: string;
      channel: TemplateChannel;
      name: string;
      subject: string | null;
      body: string;
      enabled: boolean;
    }>,
  ) => request<TemplateDTO>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTemplate: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),
  templateVariants: (templateId: string) =>
    request<TemplateSubjectDTO[]>(`/api/templates/${templateId}/variants`),
  createTemplateVariant: (
    templateId: string,
    body: { label: string; weight?: number; subject: string },
  ) =>
    request<TemplateSubjectDTO>(`/api/templates/${templateId}/variants`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchTemplateVariant: (
    templateId: string,
    variantId: string,
    body: Partial<{ label: string; weight: number; subject: string }>,
  ) =>
    request<TemplateSubjectDTO>(`/api/templates/${templateId}/variants/${variantId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTemplateVariant: (templateId: string, variantId: string) =>
    request<void>(`/api/templates/${templateId}/variants/${variantId}`, { method: "DELETE" }),
  previewTemplate: (id: string, q?: { variant?: string }) => {
    const params = new URLSearchParams();
    if (q?.variant) params.set("variant", q.variant);
    const qs = params.toString();
    return request<TemplatePreview>(`/api/templates/${id}/preview${qs ? `?${qs}` : ""}`, {
      method: "POST",
    });
  },
  testSendTemplate: (id: string, q?: { variant?: string }) => {
    const params = new URLSearchParams();
    if (q?.variant) params.set("variant", q.variant);
    const qs = params.toString();
    return request<{ ok: boolean }>(`/api/templates/${id}/test-send${qs ? `?${qs}` : ""}`, {
      method: "POST",
    });
  },
  automationRules: () => request<AutomationRuleDTO[]>("/api/automation/rules"),
  createAutomationRule: (body: {
    name: string;
    eventKey: string;
    channel: TemplateChannel;
    templateId: string;
    conditionFn?: string | null;
    enabled?: boolean;
  }) => request<AutomationRuleDTO>("/api/automation/rules", { method: "POST", body: JSON.stringify(body) }),
  patchAutomationRule: (
    id: string,
    body: Partial<{
      name: string;
      eventKey: string;
      channel: TemplateChannel;
      templateId: string;
      conditionFn: string | null;
      enabled: boolean;
    }>,
  ) => request<AutomationRuleDTO>(`/api/automation/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAutomationRule: (id: string) =>
    request<void>(`/api/automation/rules/${id}`, { method: "DELETE" }),

  // ── Inventory / Parts ──
  inventory: (q?: { search?: string; categoryId?: string; stock?: "low" | "out"; active?: string }) => {
    const params = new URLSearchParams();
    if (q?.search) params.set("search", q.search);
    if (q?.categoryId) params.set("categoryId", q.categoryId);
    if (q?.stock) params.set("stock", q.stock);
    if (q?.active) params.set("active", q.active);
    const qs = params.toString();
    return request<InventoryItemDTO[]>(`/api/inventory${qs ? `?${qs}` : ""}`);
  },
  createInventoryPart: (body: {
    categoryId?: string;
    categoryName?: string;
    name: string;
    description?: string;
    priceCents?: number;
    costCents?: number;
    taxable?: boolean;
    active?: boolean;
    quantityOnHand?: number;
    reorderPoint?: number;
  }) => request<InventoryItemDTO>("/api/inventory/parts", { method: "POST", body: JSON.stringify(body) }),
  adjustInventory: (id: string, body: { delta: number; reason?: string; note?: string }) =>
    request<InventoryAdjustmentDTO>(`/api/inventory/items/${id}/adjustments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Phase 7: Tech GPS + dispatch ──
  pingTechLocation: (body: { lat: number; lng: number; accuracyM?: number; online?: boolean }) =>
    request<{ ok: boolean; capturedAt: string; id: string }>("/api/tech/location", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Online-flag-only toggle used by tech-tracker on visibilitychange; doesn't
  // touch the last-known (lat,lng) so the dispatch board fades to "stale" on
  // the natural freshness clock.
  setSharingStatus: (online: boolean) =>
    request<{ ok: boolean; online: boolean; capturedAt: string; id: string }>(
      "/api/tech/status",
      { method: "POST", body: JSON.stringify({ online }) },
    ),
  fetchDispatchState: () => request<import("@ofp/shared").DispatchStateDTO>("/api/dispatch/state"),
};
