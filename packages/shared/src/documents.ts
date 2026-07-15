export type FieldDocumentKind = "estimate" | "invoice" | "receipt" | "work_order" | "service_plan";
type DocumentMoney = number;

export interface FieldDocumentBranding {
  companyName: string;
  logoUrl?: string;
  brandColor?: string;
  footerText?: string;
  removeOpenFieldProAttribution?: boolean;
}

export interface FieldDocumentLineItem {
  description: string;
  quantity: number;
  unitPriceCents: DocumentMoney;
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
  paymentsCents?: DocumentMoney;
  branding: FieldDocumentBranding;
  presentation?: {
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
  const showLineItemPrices = presentation.showLineItemPrices ?? true;
  const showPayments = presentation.showPayments ?? true;
  const showBalance = presentation.showBalance ?? true;
  const rows = data.lineItems
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${showLineItemPrices ? formatCents(item.unitPriceCents) : "—"}</td>
          <td class="num">${showLineItemPrices ? formatCents(item.quantity * item.unitPriceCents) : "—"}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} ${escapeHtml(data.number)}</title>
<style>
  body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#f7f3ea;color:#111827;}
  .page{max-width:820px;margin:40px auto;background:white;border:1px solid #d1d5db;border-radius:24px;padding:42px;box-shadow:0 20px 60px rgba(16,24,32,.12)}
  .top{display:flex;justify-content:space-between;gap:24px;border-bottom:4px solid ${color};padding-bottom:24px;margin-bottom:28px}
  .brand-block{display:flex;align-items:center;gap:14px}.logo{width:52px;height:52px;object-fit:contain;border-radius:14px;border:1px solid #e5e7eb}.logo-mark{width:52px;height:52px;display:grid;place-items:center;border-radius:14px;background:${color};color:#101820;font-weight:900;letter-spacing:-.04em}.brand{font-size:24px;font-weight:900;letter-spacing:-.04em}.kind{text-align:right}.kind h1{margin:0;font-size:42px;letter-spacing:-.06em}.muted{color:#6b7280}.pill{display:inline-block;background:${color};color:#101820;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:26px 0}.box{border:1px solid #e5e7eb;border-radius:16px;padding:16px}.box h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#6b7280;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;margin-top:24px}th{text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #e5e7eb;padding:10px 8px}td{border-bottom:1px solid #f1f5f9;padding:12px 8px}.num{text-align:right}.totals{margin-left:auto;margin-top:24px;max-width:320px}.total-row{display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding:10px 0}.total-row.strong{font-size:20px;font-weight:900;color:#111827}.notes{margin-top:28px;border-left:4px solid ${color};padding-left:14px;color:#4b5563}.footer{margin-top:36px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px}.attribution{font-weight:700;color:#111827}
</style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div class="brand-block">${logo}<div><div class="brand">${escapeHtml(data.branding.companyName)}</div><p class="muted">${escapeHtml(data.branding.footerText ?? "Field service document")}</p></div></div>
      <div class="kind"><span class="pill">${escapeHtml(data.status ?? "draft")}</span><h1>${escapeHtml(title)}</h1><p class="muted">#${escapeHtml(data.number)}</p></div>
    </section>
    <section class="grid">
      <div class="box"><h2>Customer</h2><strong>${escapeHtml(data.customerName)}</strong><p class="muted">${escapeHtml([data.customerEmail, data.customerPhone].filter(Boolean).join(" · ") || "No contact details")}</p></div>
      <div class="box"><h2>Job</h2><strong>${escapeHtml(data.jobTitle ?? title)}</strong><p class="muted">Issued ${escapeHtml(data.issuedAt ?? new Date().toLocaleDateString())}${data.dueAt ? ` · Due ${escapeHtml(data.dueAt)}` : ""}</p></div>
    </section>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${formatCents(totals.subtotalCents)}</strong></div>
      ${showPayments ? `<div class="total-row"><span>Paid</span><strong>${formatCents(totals.paidCents)}</strong></div>` : ""}
      ${showBalance ? `<div class="total-row strong"><span>Balance</span><strong>${formatCents(totals.balanceCents)}</strong></div>` : ""}
    </section>
    ${data.notes ? `<section class="notes">${escapeHtml(data.notes)}</section>` : ""}
    <footer class="footer">${attribution}</footer>
  </main>
</body>
</html>`;
}

function formatCents(cents: DocumentMoney): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
