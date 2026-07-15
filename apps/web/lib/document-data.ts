import { renderFieldDocumentHtml, type FieldDocumentData } from "@ofp/shared";
import type { OrgSettingsDTO } from "@/lib/api";

interface CustomerLike {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface JobLike {
  title: string;
  description?: string | null;
}

interface LineItemLike {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceLike {
  number: string;
  status: string;
  dueAt?: string | null;
  createdAt?: string | null;
  payments?: { amount: number }[];
}

interface EstimateLike {
  id: string;
  number?: string;
  accepted: boolean;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  createdAt?: string | null;
}

function issuedDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : new Date().toLocaleDateString();
}

function brandingForDocument(org?: OrgSettingsDTO | null, fallbackFooter = "Field service command center document"): FieldDocumentData["branding"] {
  return {
    companyName: org?.name ?? "OpenFieldPro Demo Co.",
    logoUrl: org?.logoUrl ?? undefined,
    brandColor: org?.brandColor ?? "#22C55E",
    footerText: org?.documentFooter ?? fallbackFooter,
    removeOpenFieldProAttribution: org?.removeOpenFieldProAttribution ?? false,
  };
}

function lineItemsForDocument(lineItems: LineItemLike[], fallbackTotalCents: number): FieldDocumentData["lineItems"] {
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice,
    }));
  }
  return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
}

function visibleLineItems(
  lineItems: LineItemLike[],
  fallbackTotalCents: number,
  options: { showLineItems: boolean },
) {
  if (!options.showLineItems) return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
  return lineItemsForDocument(lineItems, fallbackTotalCents);
}

function joinNotes(parts: (string | null | undefined)[]) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join("\n\n");
}

export function invoiceDocumentHtml({
  invoice,
  customer,
  job,
  lineItems,
  org,
}: {
  invoice: InvoiceLike & { total: number };
  customer: CustomerLike | null;
  job: JobLike | null;
  lineItems: LineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  const paid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const settings = org?.businessSettings;
  const visibility = settings?.invoice.visibility;
  return renderFieldDocumentHtml({
    kind: paid >= invoice.total && invoice.total > 0 ? "receipt" : "invoice",
    number: invoice.number,
    status: invoice.status,
    issuedAt: issuedDate(invoice.createdAt),
    dueAt: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    notes: joinNotes([job?.description, settings?.invoice.defaultMessage, settings?.invoice.paymentInstructions]),
    lineItems: visibleLineItems(lineItems, invoice.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    paymentsCents: paid,
    branding: brandingForDocument(org),
    presentation: {
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
      showPayments: visibility?.showPayments ?? true,
      showBalance: visibility?.showBalance ?? true,
    },
  });
}

export function estimateDocumentHtml({
  estimate,
  customer,
  job,
  lineItems,
  org,
}: {
  estimate: EstimateLike & { total: number };
  customer: CustomerLike | null;
  job: JobLike | null;
  lineItems: LineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  const settings = org?.businessSettings;
  const visibility = settings?.estimate.visibility;
  return renderFieldDocumentHtml({
    kind: "estimate",
    number: estimate.number ?? `${settings?.numbering.estimatePrefix ?? "EST"}-${estimate.id.slice(0, 8).toUpperCase()}`,
    status: estimate.accepted ? "accepted" : "pending",
    issuedAt: issuedDate(estimate.createdAt),
    dueAt: estimate.expiresAt ? new Date(estimate.expiresAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    notes: joinNotes([
      job?.description,
      settings?.estimate.defaultMessage ?? "Estimate is valid pending final service conditions and customer approval.",
      estimate.acceptedAt ? `Accepted ${new Date(estimate.acceptedAt).toLocaleDateString()}${estimate.acceptedByName ? ` by ${estimate.acceptedByName}` : ""}.` : null,
      settings?.estimate.signatureRequired ? "Customer signature required for approval." : null,
      settings?.estimate.depositMode !== "none" ? `Deposit required: ${settings?.estimate.depositValue}${settings?.estimate.depositMode === "percent" ? "%" : " cents"}` : null,
    ]),
    lineItems: visibleLineItems(lineItems, estimate.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    paymentsCents: 0,
    branding: brandingForDocument(org, "Estimate generated from OpenFieldPro"),
    presentation: {
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
    },
  });
}
