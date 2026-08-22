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

export interface DownloadedDocument {
  blob: Blob;
  filename: string;
}

/** Fetches a PDF as a blob and keeps the server-provided download filename. */
async function downloadDocument(path: string): Promise<DownloadedDocument> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  return { blob: await res.blob(), filename: match?.[1] ?? "document.pdf" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };

  if (
    init?.body
    && !(typeof FormData !== "undefined" && init.body instanceof FormData)
  ) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface LoginResult {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export function parseSessionUser(value: unknown): LoginResult["user"] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("name" in value) ||
    !("email" in value) ||
    !("role" in value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.email !== "string" ||
    typeof value.role !== "string"
  ) {
    throw new Error("Invalid session response");
  }
  return value as LoginResult["user"];
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function currentUser(): Promise<LoginResult["user"]> {
  return parseSessionUser(await request<unknown>("/api/auth/me"));
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

type JobDTO = import("@ofp/shared").JobDTO;
type CustomerDTO = import("@ofp/shared").CustomerDTO;
type ActivityDTO = import("@ofp/shared").ActivityDTO;
type ReportSummaryDTO = import("@ofp/shared").ReportSummaryDTO;
type UserDTO = import("@ofp/shared").UserDTO;
type RecurringJobDTO = import("@ofp/shared").RecurringJobDTO;
export type BusinessSettingsDTO = import("@ofp/shared").BusinessSettings;

export interface OrgSettingsDTO {
  id: string;
  name: string;
  timezone: string;
  logoUrl?: string | null;
  brandColor: string;
  documentFooter?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  removeOpenFieldProAttribution: boolean;
  businessSettings: BusinessSettingsDTO;
  updatedAt?: string;
  createdAt?: string;
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
  pricing?: import("@ofp/shared").PricingSnapshot | null;
  dueAt?: string | null;
  createdAt?: string;
}

export interface EstimateOptionLineItem {
  id: string;
  optionId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

export interface EstimateOption {
  id: string;
  estimateId: string;
  label: string;
  position: number;
  total: number;
  pricing?: import("@ofp/shared").PricingSnapshot | null;
  lineItems: EstimateOptionLineItem[];
}

export interface Estimate {
  id: string;
  orgId: string;
  jobId: string;
  number: string;
  total: number;
  pricing?: import("@ofp/shared").PricingSnapshot | null;
  accepted: boolean;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  status: "draft" | "sent" | "approved" | "declined" | "expired";
  selectedOptionId?: string | null;
  signatureName?: string | null;
  sentAt?: string | null;
  declinedAt?: string | null;
  copiedToJobAt?: string | null;
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

interface EstimateDetail extends Estimate {
  lineItems: LineItem[];
  options: EstimateOption[];
  deposit?: {
    requiredCents: number;
    collectedCents: number;
    remainingCents: number;
    collected: boolean;
    invoice: { id: string; number: string; status: string } | null;
  };
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

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  position: number;
  createdAt: string;
}

export interface InvoiceDetail extends Invoice {
  lineItems: InvoiceLineItem[];
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

export type PortalLinkScope = import("@ofp/shared").PortalLinkScope;

export interface PortalLinkDTO {
  id: string;
  customerId: string;
  tokenPrefix: string;
  scopes: PortalLinkScope[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  sentCount: number;
  lastSentAt: string | null;
  createdAt: string;
}

export interface MessageLogDTO {
  id: string;
  kind: "invoice" | "estimate";
  documentId: string;
  customerId: string;
  recipient: string;
  subject: string;
  body: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  messageId: string | null;
  error: string | null;
  sentAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface EmailPreviewDTO {
  to: string;
  recipientName: string;
  subject: string;
  body: string;
}

export interface EmailAttachmentInfo {
  filename: string;
  sizeBytes: number;
}

export interface PortalSessionDTO {
  org: {
    id: string;
    name: string;
    logoUrl?: string | null;
    publicEmail?: string | null;
    publicPhone?: string | null;
    publicAddress?: string | null;
    sponsorEnabled?: boolean;
  };
  customer: { name: string; email?: string | null; phone?: string | null };
  views: PortalLinkScope[];
  balance: {
    invoices: Array<{ id: string; number: string; total: number; paid: number; remaining: number; dueAt: string | null }>;
    totalRemaining: number;
    paymentInstructions: string;
  };
  checkout: { available: boolean; totalRemaining: number };
  receipts: Array<{
    id: string;
    number: string;
    total: number;
    paidAt: string | null;
    payments: Array<{ amount: number; method: string; paidAt: string }>;
  }>;
  servicePlans: Array<{
    id: string;
    planName: string;
    status: string;
    visitsIncluded: number;
    visitsCompleted: number;
    renewsAt: string | null;
    nextVisit: { title: string; dueAt: string | null; status: string } | null;
  }>;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  // ── Public (no auth) ──
  publicOrg: () => request<{ org: { id: string; name: string } }>("/api/public/org/default"),
  publicBook: (orgId: string, body: { name: string; email?: string; phone?: string; title?: string; description?: string }) =>
    request<{ ok: boolean }>(`/api/public/${orgId}/book`, { method: "POST", body: JSON.stringify(body) }),

  // ── Organization settings ──
  org: () => request<OrgSettingsDTO>("/api/org/me"),
  patchOrg: (body: Partial<Pick<OrgSettingsDTO, "name" | "timezone" | "logoUrl" | "brandColor" | "documentFooter" | "publicEmail" | "publicPhone" | "publicAddress" | "removeOpenFieldProAttribution" | "businessSettings">>) =>
    request<OrgSettingsDTO>("/api/org/me", { method: "PATCH", body: JSON.stringify(body) }),
  uploadOrgLogo: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<OrgSettingsDTO>("/api/org/logo", { method: "POST", body });
  },
  deleteOrgLogo: () => request<OrgSettingsDTO>("/api/org/logo", { method: "DELETE" }),

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
  createInvoice: (body: { jobId: string; dueAt?: string; discountId?: string }) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  updateInvoiceStatus: (id: string, status: "sent" | "void") =>
    request<{ ok: boolean; status: string }>(`/api/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  addInvoiceLine: (id: string, body: { description: string; quantity: number; unitPrice: number; unitCost?: number }) =>
    request<{ lineItem: InvoiceLineItem; total: number }>(`/api/invoices/${id}/lines`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateInvoiceLine: (id: string, lineId: string, body: Partial<{ description: string; quantity: number; unitPrice: number; unitCost: number }>) =>
    request<{ lineItem: InvoiceLineItem; total: number }>(`/api/invoices/${id}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteInvoiceLine: (id: string, lineId: string) =>
    request<{ ok: boolean; total: number }>(`/api/invoices/${id}/lines/${lineId}`, { method: "DELETE" }),
  recordPayment: (id: string, body: { amount: number; method?: string }) =>
    request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Email send workflow ──
  invoiceEmailPreview: (id: string) => request<EmailPreviewDTO>(`/api/invoices/${id}/email-preview`),
  invoiceSendEmail: (id: string) =>
    request<{ log: MessageLogDTO; draft: EmailPreviewDTO; attachment: EmailAttachmentInfo }>(`/api/invoices/${id}/email`, { method: "POST" }),
  estimateEmailPreview: (id: string) => request<EmailPreviewDTO>(`/api/estimates/${id}/email-preview`),
  estimateSendEmail: (id: string) =>
    request<{ log: MessageLogDTO; draft: EmailPreviewDTO; attachment: EmailAttachmentInfo }>(`/api/estimates/${id}/email`, { method: "POST" }),

  // ── Durable documents (PDF) ──
  invoicePdf: (id: string) => downloadDocument(`/api/invoices/${id}/document`),
  estimatePdf: (id: string) => downloadDocument(`/api/estimates/${id}/document`),
  messageLogs: (query: { kind?: "invoice" | "estimate"; documentId?: string }) => {
    const params = new URLSearchParams();
    if (query.kind) params.set("kind", query.kind);
    if (query.documentId) params.set("documentId", query.documentId);
    const qs = params.toString();
    return request<MessageLogDTO[]>(`/api/messages${qs ? `?${qs}` : ""}`);
  },
  retryMessage: (id: string) =>
    request<MessageLogDTO>(`/api/messages/${id}/retry`, { method: "POST" }),

  reports: () => request<ReportSummaryDTO>("/api/reports/summary"),

  estimates: () => request<Estimate[]>("/api/estimates"),
  estimate: (id: string) => request<EstimateDetail>(`/api/estimates/${id}`),
  createEstimate: (body: { jobId: string }) =>
    request<EstimateDetail>("/api/estimates", { method: "POST", body: JSON.stringify(body) }),
  renameEstimateOption: (estimateId: string, optionId: string, label: string) =>
    request<EstimateOption>(`/api/estimates/${estimateId}/options/${optionId}`, { method: "PATCH", body: JSON.stringify({ label }) }),
  setEstimateOptionDiscount: (estimateId: string, optionId: string, discountId: string | null) =>
    request<EstimateOption>(`/api/estimates/${estimateId}/options/${optionId}`, { method: "PATCH", body: JSON.stringify({ discountId }) }),
  addEstimateOptionLine: (estimateId: string, optionId: string, body: { description: string; quantity: number; unitPrice: number; unitCost?: number }) =>
    request<{ lineItem: EstimateOptionLineItem; total: number }>(`/api/estimates/${estimateId}/options/${optionId}/lines`, { method: "POST", body: JSON.stringify(body) }),
  patchEstimateOptionLine: (estimateId: string, optionId: string, lineId: string, body: Partial<{ description: string; quantity: number; unitPrice: number; unitCost: number }>) =>
    request<{ lineItem: EstimateOptionLineItem; total: number }>(`/api/estimates/${estimateId}/options/${optionId}/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEstimateOptionLine: (estimateId: string, optionId: string, lineId: string) =>
    request<{ ok: boolean; total: number }>(`/api/estimates/${estimateId}/options/${optionId}/lines/${lineId}`, { method: "DELETE" }),
  markEstimateSent: (id: string) => request<Estimate>(`/api/estimates/${id}/send`, { method: "POST" }),
  approveEstimateOption: (id: string, body: { optionId: string; signatureName?: string }) =>
    request<Estimate>(`/api/estimates/${id}/approve`, { method: "POST", body: JSON.stringify(body) }),
  declineEstimate: (id: string) => request<Estimate>(`/api/estimates/${id}/decline`, { method: "POST" }),
  copyApprovedEstimateToJob: (id: string) => request<{ ok: boolean; total: number; alreadyCopied: boolean }>(`/api/estimates/${id}/copy-approved-to-job`, { method: "POST" }),
  acceptEstimate: (id: string, body?: { customerName?: string }) =>
    request<Estimate & { jobStatus: string }>(`/api/estimates/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  reviews: () => request<ReviewList>("/api/reviews"),
  patchReview: (id: string, body: { reply?: string }) =>
    request<{ id: string; reply: string | null }>(`/api/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  jobPhotos: (jobId: string) => request<PhotoRecord[]>(`/api/photos/job/${jobId}`),
  uploadJobPhoto: async (jobId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/api/photos/upload/${jobId}`, {
      method: "POST",
      credentials: "include",
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

  me: () => request<{ id: string; name: string; email: string; role: string }>("/api/auth/me"),
  patchUser: (id: string, body: { role?: string; active?: boolean }) => request<UserDTO>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

  notifications: () => request<NotificationDTO[]>("/api/notifications"),
  unreadNotificationCount: () => request<{ count: number }>("/api/notifications/unread-count"),
  markNotificationRead: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request<void>("/api/notifications/read-all", { method: "POST" }),

  search: (q: string) => {
    const params = new URLSearchParams({ q });
    return request<SearchResults>(`/api/search?${params}`);
  },

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

  // ── Customer portal links (owner management) ──
  portalLinks: (customerId: string) => request<PortalLinkDTO[]>(`/api/portal/links?customerId=${customerId}`),
  createPortalLink: (body: { customerId: string; scopes: PortalLinkScope[]; expiresInDays?: number | null }) =>
    request<{ link: PortalLinkDTO; token: string; ttlDays: number }>("/api/portal/links", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokePortalLink: (id: string) =>
    request<{ ok: boolean }>(`/api/portal/links/${id}/revoke`, { method: "POST" }),
  sendPortalLink: (id: string) =>
    request<{ ok: boolean; to: string; messageId: string; sentAt: string }>(`/api/portal/links/${id}/send`, { method: "POST" }),

  // ── Customer portal (anonymous, bearer token in path) ──
  portalSession: (token: string) => request<PortalSessionDTO>(`/api/portal/${token}`),
  portalCheckout: (token: string, invoiceId: string) =>
    request<{ url: string }>(`/api/portal/${token}/checkout`, {
      method: "POST",
      body: JSON.stringify({ invoiceId }),
    }),
};
