import type { BusinessSettings } from "./business-settings.js";

export type FieldDocumentKind = "estimate" | "invoice" | "receipt" | "work_order" | "service_plan";
type DocumentMoney = number;

export interface FieldDocumentBranding {
  companyName: string;
  logoUrl?: string;
  brandColor?: string;
  footerText?: string;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  removeOpenFieldProAttribution?: boolean;
}

export interface FieldDocumentLineItem {
  description: string;
  quantity: number;
  unitPriceCents: DocumentMoney;
}

export interface FieldDocumentOption {
  id: string;
  label: string;
  selected?: boolean;
  lineItems: FieldDocumentLineItem[];
}

export interface FieldDocumentData {
  kind: FieldDocumentKind;
  number: string;
  status?: string;
  issuedAt?: string;
  dueAt?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  jobTitle?: string;
  notes?: string | null;
  lineItems: FieldDocumentLineItem[];
  options?: FieldDocumentOption[];
  paymentsCents?: DocumentMoney;
  branding: FieldDocumentBranding;
  presentation?: {
    format?: "email" | "envelope";
    showBusinessInfo?: boolean;
    showLineItemPrices?: boolean;
    showPayments?: boolean;
    showBalance?: boolean;
  };
}

export function fieldDocumentTitle(kind: FieldDocumentKind): string {
  switch (kind) {
    case "estimate":
      return "Estimate";
    case "invoice":
      return "Invoice";
    case "receipt":
      return "Receipt";
    case "work_order":
      return "Work Order";
    case "service_plan":
      return "Service Plan";
  }
}

export function fieldDocumentTotals(data: FieldDocumentData) {
  const subtotalCents = data.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const paidCents = data.paymentsCents ?? 0;
  return {
    subtotalCents,
    totalCents: subtotalCents,
    paidCents,
    balanceCents: Math.max(0, subtotalCents - paidCents),
  };
}

export function renderFieldDocumentHtml(data: FieldDocumentData): string {
  const title = fieldDocumentTitle(data.kind);
  const totals = fieldDocumentTotals(data);
  const color = data.branding.brandColor ?? "#22C55E";
  const logo = data.branding.logoUrl
    ? `<img class="logo" src="${escapeHtml(data.branding.logoUrl)}" alt="${escapeHtml(data.branding.companyName)} logo" />`
    : `<div class="logo-mark">${escapeHtml(data.branding.companyName.slice(0, 2).toUpperCase())}</div>`;
  const attribution = data.branding.removeOpenFieldProAttribution
    ? ""
    : `<p class="attribution">Powered by OpenFieldPro</p>`;
  const presentation = data.presentation ?? {};
  const showBusinessInfo = presentation.showBusinessInfo ?? true;
  const showLineItemPrices = presentation.showLineItemPrices ?? true;
  const showPayments = presentation.showPayments ?? true;
  const showBalance = presentation.showBalance ?? true;
  const rows = data.lineItems
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${showLineItemPrices ? formatCents(item.unitPriceCents) : "Hidden"}</td>
          <td class="num">${showLineItemPrices ? formatCents(item.quantity * item.unitPriceCents) : "Hidden"}</td>
        </tr>`,
    )
    .join("");
  const optionSections = data.options?.length
    ? data.options.map((option) => {
      const optionTotal = option.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
      const optionRows = option.lineItems.map((item) => `
        <tr><td>${escapeHtml(item.description)}</td><td class="num">${item.quantity}</td><td class="num">${showLineItemPrices ? formatCents(item.unitPriceCents) : "Hidden"}</td><td class="num">${showLineItemPrices ? formatCents(item.quantity * item.unitPriceCents) : "Hidden"}</td></tr>`).join("");
      const selectedLabel = data.status === "approved" ? "Approved" : "Selected";
      return `<section class="option${option.selected ? " selected" : ""}"><div class="option-heading"><h2>${escapeHtml(option.label)}</h2>${option.selected ? `<span>${selectedLabel}</span>` : ""}</div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>${optionRows}</tbody></table><p class="option-total">Option total <strong>${formatCents(optionTotal)}</strong></p></section>`;
    }).join("")
    : null;
  const businessContact = [data.branding.publicPhone, data.branding.publicEmail, data.branding.publicAddress]
    .filter(Boolean)
    .map((value) => escapeHtml(value!))
    .join("<br />");
  const brandBlock = `<div class="brand-block">${logo}<div><div class="brand">${escapeHtml(data.branding.companyName)}</div>${showBusinessInfo && businessContact ? `<p class="muted contact">${businessContact}</p>` : ""}</div></div>`;
  const formatClass = presentation.format === "envelope" ? " format-envelope" : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} ${escapeHtml(data.number)}</title>
<style>
  *{box-sizing:border-box}body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#eef1ed;color:#17201b;line-height:1.45}
  .page{max-width:820px;min-height:980px;margin:32px auto;background:#fff;border:1px solid #d9dfda;border-radius:18px;padding:44px;box-shadow:0 18px 50px rgba(23,32,27,.1)}
  .page.format-envelope .top{padding-top:76px}.top{display:flex;justify-content:space-between;gap:28px;border-bottom:3px solid ${color};padding-bottom:26px;margin-bottom:28px}
  .brand-block{display:flex;align-items:flex-start;gap:14px;min-width:0}.logo{width:56px;height:56px;object-fit:contain;border-radius:12px;border:1px solid #e5e9e6}.logo-mark{width:56px;height:56px;display:grid;place-items:center;border-radius:12px;background:${color};color:#fff;font-weight:900;letter-spacing:-.04em}.brand{font-size:23px;font-weight:850;letter-spacing:-.035em}.contact{margin:6px 0 0;font-size:12px;line-height:1.55}.kind{text-align:right;flex:none}.kind h1{margin:8px 0 0;font-size:38px;line-height:1;letter-spacing:-.045em}.kind .number{margin:8px 0 0;font-weight:700}.muted{color:#647168}.pill{display:inline-block;border:1px solid ${color};color:${color};border-radius:999px;padding:5px 9px;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}.box{border:1px solid #dfe5e0;border-radius:12px;padding:16px;background:#fafcf9}.box h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#6b776f;margin:0 0 8px}.box p{margin:6px 0 0;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}th{text-align:left;color:#69756d;font-size:10px;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #ccd5ce;padding:10px 8px}td{border-bottom:1px solid #edf0ed;padding:13px 8px;vertical-align:top}.num{text-align:right;white-space:nowrap}.option{margin-top:18px;border:1px solid #dfe5e0;border-radius:14px;padding:18px;background:#fff}.option.selected{border:2px solid ${color};box-shadow:0 0 0 3px color-mix(in srgb, ${color} 12%, transparent)}.option-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.option-heading h2{margin:0;font-size:19px}.option-heading span{border-radius:999px;background:${color};color:#fff;padding:4px 8px;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.option table{margin-top:8px}.option-total{text-align:right;font-size:15px}.totals{margin-left:auto;margin-top:24px;max-width:320px}.total-row{display:flex;justify-content:space-between;border-top:1px solid #e0e5e1;padding:10px 0}.total-row.strong{font-size:20px;font-weight:900;color:#17201b}.notes{margin-top:28px;border-left:3px solid ${color};padding:4px 0 4px 16px;color:#4f5d54;white-space:pre-line;font-size:13px}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:38px;padding-top:16px;border-top:1px solid #dfe5e0;color:#6b776f;font-size:11px}.attribution{margin:0;font-weight:750;color:#364139}
  @media(max-width:680px){body{background:#fff}.page{min-height:100vh;margin:0;border:0;border-radius:0;padding:24px 18px;box-shadow:none}.page.format-envelope .top{padding-top:24px}.top{display:grid;gap:20px}.kind{text-align:left}.kind h1{font-size:32px}.grid{grid-template-columns:1fr}table{font-size:12px}th,td{padding:10px 5px}.brand{font-size:20px}.contact{overflow-wrap:anywhere}}
  @media print{body{background:#fff}.page{max-width:none;min-height:auto;margin:0;border:0;border-radius:0;padding:0;box-shadow:none}.option{break-inside:avoid}.footer{margin-top:24px}}
</style>
</head>
<body>
  <main class="page${formatClass}">
    <section class="top">
      ${brandBlock}
      <div class="kind"><span class="pill">${escapeHtml(data.status ?? "draft")}</span><h1>${escapeHtml(title)}</h1><p class="muted number">#${escapeHtml(data.number)}</p></div>
    </section>
    <section class="grid">
      <div class="box"><h2>Customer</h2><strong>${escapeHtml(data.customerName)}</strong><p class="muted">${escapeHtml([data.customerEmail, data.customerPhone].filter(Boolean).join(" · ") || "No contact details")}</p></div>
      <div class="box"><h2>Job</h2><strong>${escapeHtml(data.jobTitle ?? title)}</strong><p class="muted">Issued ${escapeHtml(data.issuedAt ?? new Date().toLocaleDateString())}${data.dueAt ? ` · Due ${escapeHtml(data.dueAt)}` : ""}</p></div>
    </section>
    ${optionSections ?? `<table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`}
    ${optionSections ? "" : `<section class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${formatCents(totals.subtotalCents)}</strong></div>
      ${showPayments ? `<div class="total-row"><span>Paid</span><strong>${formatCents(totals.paidCents)}</strong></div>` : ""}
      ${showBalance ? `<div class="total-row strong"><span>Balance</span><strong>${formatCents(totals.balanceCents)}</strong></div>` : ""}
    </section>`}
    ${data.notes ? `<section class="notes">${escapeHtml(data.notes)}</section>` : ""}
    <footer class="footer"><span>${escapeHtml(data.branding.footerText ?? "Field service document")}</span>${attribution}</footer>
  </main>
</body>
</html>`;
}

export function formatDocumentCents(cents: DocumentMoney): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCents(cents: DocumentMoney): string {
  return formatDocumentCents(cents);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── Durable document data assembly ──
// Shared by the web preview (HTML) and the API (PDF generation + email
// attachment) so a customer document never differs between the two surfaces.

export interface DocumentCustomerLike {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface DocumentJobLike {
  title: string;
  description?: string | null;
}

export interface DocumentLineItemLike {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DocumentInvoiceLike {
  number: string;
  status: string;
  dueAt?: string | Date | null;
  createdAt?: string | Date | null;
  payments?: { amount: number }[];
}

export interface DocumentEstimateLike {
  id: string;
  number?: string;
  accepted: boolean;
  expiresAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  acceptedByName?: string | null;
  createdAt?: string | Date | null;
  status?: string;
  selectedOptionId?: string | null;
  signatureName?: string | null;
  options?: Array<{ id: string; label: string; lineItems: DocumentLineItemLike[] }>;
}

export interface DocumentOrgLike {
  name?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  documentFooter?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  removeOpenFieldProAttribution?: boolean;
  businessSettings?: BusinessSettings | null;
}

function documentIssuedDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : new Date().toLocaleDateString();
}

function documentBranding(org?: DocumentOrgLike | null, fallbackFooter = "Field service command center document"): FieldDocumentData["branding"] {
  return {
    companyName: org?.name ?? "OpenFieldPro Demo Co.",
    logoUrl: org?.logoUrl ?? undefined,
    brandColor: org?.brandColor ?? "#22C55E",
    footerText: org?.documentFooter ?? fallbackFooter,
    publicEmail: org?.publicEmail,
    publicPhone: org?.publicPhone,
    publicAddress: org?.publicAddress,
    removeOpenFieldProAttribution: org?.removeOpenFieldProAttribution ?? false,
  };
}

function documentLineItems(lineItems: DocumentLineItemLike[], fallbackTotalCents: number): FieldDocumentData["lineItems"] {
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice,
    }));
  }
  return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
}

function visibleDocumentLineItems(
  lineItems: DocumentLineItemLike[],
  fallbackTotalCents: number,
  options: { showLineItems: boolean },
) {
  if (!options.showLineItems) return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
  return documentLineItems(lineItems, fallbackTotalCents);
}

function joinDocumentNotes(parts: (string | null | undefined)[]) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join("\n\n");
}

/** Builds the durable document data for an invoice from its snapshot lines. */
export function invoiceDocumentData({
  invoice,
  customer,
  job,
  lineItems,
  org,
}: {
  invoice: DocumentInvoiceLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: DocumentOrgLike | null;
}): FieldDocumentData {
  const paid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const settings = org?.businessSettings;
  const visibility = settings?.invoice.visibility;
  return {
    kind: paid >= invoice.total && invoice.total > 0 ? "receipt" : "invoice",
    number: invoice.number,
    status: invoice.status,
    issuedAt: documentIssuedDate(invoice.createdAt),
    dueAt: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    notes: joinDocumentNotes([job?.description, settings?.invoice.defaultMessage, settings?.invoice.paymentInstructions]),
    lineItems: visibleDocumentLineItems(lineItems, invoice.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    paymentsCents: paid,
    branding: documentBranding(org),
    presentation: {
      format: settings?.invoice.format,
      showBusinessInfo: visibility?.showBusinessInfo ?? true,
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
      showPayments: visibility?.showPayments ?? true,
      showBalance: visibility?.showBalance ?? true,
    },
  };
}

/** Builds the durable document data for an estimate from its option lines. */
export function estimateDocumentData({
  estimate,
  customer,
  job,
  lineItems,
  org,
}: {
  estimate: DocumentEstimateLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: DocumentOrgLike | null;
}): FieldDocumentData {
  const settings = org?.businessSettings;
  const visibility = settings?.estimate.visibility;
  return {
    kind: "estimate",
    number: estimate.number ?? `${settings?.numbering.estimatePrefix ?? "EST"}-${estimate.id.slice(0, 8).toUpperCase()}`,
    status: estimate.status ?? (estimate.accepted ? "approved" : "pending"),
    issuedAt: documentIssuedDate(estimate.createdAt),
    dueAt: estimate.expiresAt ? new Date(estimate.expiresAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    notes: joinDocumentNotes([
      job?.description,
      settings?.estimate.defaultMessage ?? "Estimate is valid pending final service conditions and customer approval.",
      estimate.acceptedAt ? `Accepted ${new Date(estimate.acceptedAt).toLocaleDateString()}${estimate.acceptedByName ? ` by ${estimate.acceptedByName}` : ""}.` : null,
      settings?.estimate.signatureRequired ? "Customer signature required for approval." : null,
      settings?.estimate.depositMode !== "none" ? `Deposit required: ${settings?.estimate.depositValue}${settings?.estimate.depositMode === "percent" ? "%" : " cents"}` : null,
    ]),
    lineItems: visibleDocumentLineItems(lineItems, estimate.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    options: visibility?.showOptionSummary === false ? undefined : estimate.options?.map((option) => ({
      id: option.id,
      label: option.label,
      selected: option.id === estimate.selectedOptionId,
      lineItems: visibleDocumentLineItems(option.lineItems, 0, { showLineItems: visibility?.showLineItems ?? true }),
    })),
    paymentsCents: 0,
    branding: documentBranding(org, "Estimate generated from OpenFieldPro"),
    presentation: {
      format: settings?.estimate.format,
      showBusinessInfo: visibility?.showBusinessInfo ?? true,
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
    },
  };
}
