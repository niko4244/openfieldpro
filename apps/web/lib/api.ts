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

export interface LineItemDTO {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  taxable?: boolean;
  createdAt: string;
}

export interface EstimateDTO {
  id: string;
  jobId: string;
  total: number;
  accepted: boolean;
  publicToken?: string | null;
  createdAt: string;
}

export interface PaymentDTO {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

export interface InvoiceDTO {
  id: string;
  jobId: string;
  number: string;
  poNumber?: string | null;
  publicToken?: string | null;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  taxRateBps?: number;
  discountCents?: number;
  dueAt: string | null;
  lastSentAt?: string | null;
}

export interface InvoiceDetailDTO extends InvoiceDTO {
  lineItems: LineItemDTO[];
  payments: PaymentDTO[];
}

export interface InvoiceReminderScheduleDTO {
  id: string;
  invoiceId: string;
  daysAfterDue: number;
  channel: "email" | "sms" | "manual";
  message: string;
  enabled: boolean;
  lastSentAt?: string | null;
}

export interface ProgressInvoiceMilestoneDTO {
  id: string;
  jobId: string;
  invoiceId?: string | null;
  label: string;
  amountCents: number;
  percentBps: number;
  status: "draft" | "ready" | "invoiced" | "paid" | "void";
  dueAt?: string | null;
  createdAt: string;
}

export interface DispatchTechnicianDTO {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
}

export interface DispatchCardDTO {
  id: string;
  title: string;
  status: string;
  total: number;
  scheduledAt?: string | null;
  appointment?: AppointmentDTO | null;
  technician?: DispatchTechnicianDTO | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  property?: { id: string; address: string; lat?: string | null; lng?: string | null } | null;
  bucket: "unscheduled" | "scheduled" | "inProgress" | "completed";
}

export interface DispatchBoardDTO {
  generatedAt: string;
  technicians: DispatchTechnicianDTO[];
  columns: {
    unscheduled: DispatchCardDTO[];
    scheduled: DispatchCardDTO[];
    inProgress: DispatchCardDTO[];
    completed: DispatchCardDTO[];
  };
}

export interface RoutePlanDTO {
  date: string;
  technicianId: string | null;
  totalKnownMiles: number;
  missingCoordinateStops: number;
  stops: Array<{
    sequence: number;
    appointmentId: string;
    jobId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    technicianId: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    driveMilesFromPrevious: number | null;
    mapUrl: string | null;
  }>;
}

export interface InvoiceTemplateDTO {
  companyName: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  licenseNumber?: string | null;
  logoUrl?: string | null;
  accentColor: string;
  templateStyle: "modern" | "classic" | "compact";
  invoicePrefix: string;
  defaultTaxRateBps: number;
  defaultDiscountCents: number;
  paymentTerms: string;
  acceptedPaymentMethods: string;
  lateFeePolicy: string;
  memo: string;
  footer: string;
  termsAndConditions: string;
  showLineItemPrices: boolean;
  showPaymentHistory: boolean;
  showCompanyContact: boolean;
  showCustomerDetails: boolean;
  showServiceAddress: boolean;
  showTechnician: boolean;
  showTaxAndDiscount: boolean;
  showTerms: boolean;
}

export interface InvoicePreviewDTO {
  template: InvoiceTemplateDTO;
  invoice: { number: string; status: string; total: number; dueAt?: string | null; createdAt?: string | null; poNumber?: string | null; lastSentAt?: string | null };
  customer?: { name: string; email?: string | null; phone?: string | null } | null;
  property?: { address: string } | null;
  technician?: { name: string; email?: string | null } | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number; taxable?: boolean | null }>;
  totals: { subtotal: number; discount: number; tax: number; taxRateBps: number; total: number; paid: number; balance: number };
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
  lineItems: (jobId: string) => get<LineItemDTO[]>(`/api/jobs/${jobId}/line-items`),
  estimates: () => get<EstimateDTO[]>("/api/estimates"),
  appointments: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return get<AppointmentDTO[]>(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  dispatchBoard: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return get<DispatchBoardDTO>(`/api/dispatch/board${qs ? `?${qs}` : ""}`);
  },
  routePlan: (date?: string, technicianId?: string) => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (technicianId) q.set("technicianId", technicianId);
    const qs = q.toString();
    return get<RoutePlanDTO>(`/api/dispatch/route-plan${qs ? `?${qs}` : ""}`);
  },
  invoices: () => get<InvoiceDTO[]>("/api/invoices"),
  invoice: (id: string) => get<InvoiceDetailDTO>(`/api/invoices/${id}`),
  invoiceReminderPlan: (id: string) => get<{ schedule: InvoiceReminderScheduleDTO[] }>(`/api/invoices/${id}/reminder-plan`),
  progressMilestones: (jobId: string) => get<ProgressInvoiceMilestoneDTO[]>(`/api/invoices/progress/${jobId}`),
  invoiceTemplate: () => get<InvoiceTemplateDTO>("/api/invoice-template"),
  invoicePreview: (invoiceId?: string) => get<InvoicePreviewDTO>(`/api/invoice-template/preview${invoiceId ? `?invoiceId=${invoiceId}` : ""}`),
  reports: () => get<ReportSummaryDTO>("/api/reports/summary"),
  health: () => get<{ ok: boolean }>("/api/health"),
};
