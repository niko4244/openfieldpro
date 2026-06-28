"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceTemplate } from "../lib/client-api";
import { formatMoney } from "@ofp/shared";

interface InvoiceTemplateView {
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

interface InvoicePreviewView {
  template: InvoiceTemplateView;
  invoice: { number: string; status: string; total: number; dueAt?: string | null; createdAt?: string | null; poNumber?: string | null; lastSentAt?: string | null };
  customer?: { name: string; email?: string | null; phone?: string | null } | null;
  property?: { address: string } | null;
  technician?: { name: string; email?: string | null } | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number; taxable?: boolean | null }>;
  totals: { subtotal: number; discount: number; tax: number; taxRateBps: number; total: number; paid: number; balance: number };
}

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function dollarsToCents(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function percentToBps(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function bpsToPercent(value: number) {
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

export function InvoicePreviewCard({ preview }: { preview: InvoicePreviewView }) {
  const { template, invoice, lineItems, totals, customer, property, technician } = preview;
  return (
    <article className={`section-card invoice-preview ${template.templateStyle}`} style={{ borderTop: `8px solid ${template.accentColor}` }}>
      <div className="section-header">
        <div>
          {template.logoUrl ? <img src={template.logoUrl} alt={`${template.companyName} logo`} style={{ maxHeight: 52, maxWidth: 180 }} /> : <h2>{template.companyName}</h2>}
          {template.showCompanyContact && (
            <p className="muted">
              {[template.companyAddress, template.companyPhone, template.companyEmail, template.companyWebsite].filter(Boolean).join(" · ")}
            </p>
          )}
          {template.licenseNumber && <p className="fine-print">License: {template.licenseNumber}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h2>Invoice {invoice.number}</h2>
          <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
          <p className="muted">{invoice.createdAt ? `Issued ${new Date(invoice.createdAt).toLocaleDateString()}` : "Draft invoice"}</p>
          {invoice.dueAt && <p className="muted">Due {new Date(invoice.dueAt).toLocaleDateString()}</p>}
          {invoice.poNumber && <p className="fine-print">PO {invoice.poNumber}</p>}
        </div>
      </div>

      {(template.showCustomerDetails || template.showServiceAddress || template.showTechnician) && (
        <div className="detail-grid" style={{ marginBottom: 18 }}>
          {template.showCustomerDetails && <div className="detail-item"><span>Bill to</span><strong>{customer?.name ?? "Customer"}</strong><p className="muted">{[customer?.email, customer?.phone].filter(Boolean).join(" · ") || "No contact on file"}</p></div>}
          {template.showServiceAddress && <div className="detail-item"><span>Service address</span><strong>{property?.address ?? "Not listed"}</strong></div>}
          {template.showTechnician && <div className="detail-item"><span>Technician</span><strong>{technician?.name ?? "Unassigned"}</strong><p className="muted">{technician?.email ?? ""}</p></div>}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty / Hours</th>
              {template.showLineItemPrices && <th>Unit rate</th>}
              {template.showLineItemPrices && <th>Amount</th>}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={`${item.description}-${index}`}>
                <td><strong>{item.description}</strong>{item.taxable === false && <p className="fine-print">Non-taxable</p>}</td>
                <td>{item.quantity}</td>
                {template.showLineItemPrices && <td>{formatMoney(item.unitPrice)}</td>}
                {template.showLineItemPrices && <td>{formatMoney(item.amount)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="summary" style={{ marginLeft: "auto", maxWidth: 360, marginTop: 20 }}>
        <div className="list-row"><span>Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div>
        {template.showTaxAndDiscount && totals.discount > 0 && <div className="list-row"><span>Discount</span><strong>-{formatMoney(totals.discount)}</strong></div>}
        {template.showTaxAndDiscount && <div className="list-row"><span>Tax ({bpsToPercent(totals.taxRateBps)}%)</span><strong>{formatMoney(totals.tax)}</strong></div>}
        <div className="list-row"><span>Total due</span><strong>{formatMoney(totals.total)}</strong></div>
        {template.showPaymentHistory && <div className="list-row"><span>Paid</span><strong>{formatMoney(totals.paid)}</strong></div>}
        {template.showPaymentHistory && <div className="list-row"><span>Balance</span><strong>{formatMoney(totals.balance)}</strong></div>}
      </div>

      <div className="empty-state" style={{ marginTop: 20, textAlign: "left" }}>
        <strong>Payment terms:</strong> {template.paymentTerms}<br />
        <strong>Accepted payment methods:</strong> {template.acceptedPaymentMethods}<br />
        <strong>Late fee policy:</strong> {template.lateFeePolicy}
      </div>
      <div className="empty-state" style={{ marginTop: 12, textAlign: "left" }}>{template.memo}</div>
      {template.showTerms && <p className="fine-print"><strong>Terms:</strong> {template.termsAndConditions}</p>}
      <p className="fine-print">{template.footer}</p>
    </article>
  );
}

export function InvoiceTemplateForm({ template }: { template: InvoiceTemplateView }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      companyName: formValue(form, "companyName"),
      companyAddress: formValue(form, "companyAddress"),
      companyPhone: formValue(form, "companyPhone"),
      companyEmail: formValue(form, "companyEmail"),
      companyWebsite: formValue(form, "companyWebsite"),
      licenseNumber: formValue(form, "licenseNumber"),
      logoUrl: formValue(form, "logoUrl"),
      accentColor: formValue(form, "accentColor") || "#2463eb",
      templateStyle: formValue(form, "templateStyle") as "modern" | "classic" | "compact",
      invoicePrefix: formValue(form, "invoicePrefix") || "INV",
      defaultTaxRateBps: percentToBps(formValue(form, "defaultTaxRate")),
      defaultDiscountCents: dollarsToCents(formValue(form, "defaultDiscount")),
      paymentTerms: formValue(form, "paymentTerms") || "Due on receipt",
      acceptedPaymentMethods: formValue(form, "acceptedPaymentMethods") || "Online payment, ACH, cash, check",
      lateFeePolicy: formValue(form, "lateFeePolicy") || "Late fees may apply to overdue balances.",
      memo: formValue(form, "memo") || "Thank you for your business.",
      footer: formValue(form, "footer") || "Questions? Contact us before paying.",
      termsAndConditions: formValue(form, "termsAndConditions") || "All work is subject to the terms agreed before service.",
      showLineItemPrices: form.get("showLineItemPrices") === "on",
      showPaymentHistory: form.get("showPaymentHistory") === "on",
      showCompanyContact: form.get("showCompanyContact") === "on",
      showCustomerDetails: form.get("showCustomerDetails") === "on",
      showServiceAddress: form.get("showServiceAddress") === "on",
      showTechnician: form.get("showTechnician") === "on",
      showTaxAndDiscount: form.get("showTaxAndDiscount") === "on",
      showTerms: form.get("showTerms") === "on",
    };
    setMessage(null);
    startTransition(async () => {
      try {
        await updateInvoiceTemplate(payload as Parameters<typeof updateInvoiceTemplate>[0]);
        setMessage("Invoice template saved.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="workflow-form compact-form">
      <div className="form-grid">
        <label><span>Company name</span><input name="companyName" defaultValue={template.companyName} required /></label>
        <label><span>Logo URL</span><input name="logoUrl" defaultValue={template.logoUrl ?? ""} placeholder="https://..." /></label>
        <label><span>Company address</span><input name="companyAddress" defaultValue={template.companyAddress ?? ""} placeholder="Street, city, state" /></label>
        <label><span>Company phone</span><input name="companyPhone" defaultValue={template.companyPhone ?? ""} /></label>
        <label><span>Company email</span><input name="companyEmail" type="email" defaultValue={template.companyEmail ?? ""} /></label>
        <label><span>Website</span><input name="companyWebsite" defaultValue={template.companyWebsite ?? ""} placeholder="https://..." /></label>
        <label><span>License #</span><input name="licenseNumber" defaultValue={template.licenseNumber ?? ""} /></label>
        <label><span>Accent color</span><input name="accentColor" defaultValue={template.accentColor} placeholder="#2463eb" /></label>
        <label><span>Template style</span><select name="templateStyle" defaultValue={template.templateStyle}><option value="modern">Modern</option><option value="classic">Classic</option><option value="compact">Compact</option></select></label>
        <label><span>Invoice prefix</span><input name="invoicePrefix" defaultValue={template.invoicePrefix} /></label>
        <label><span>Default tax %</span><input name="defaultTaxRate" type="number" min="0" max="20" step="0.01" defaultValue={bpsToPercent(template.defaultTaxRateBps)} /></label>
        <label><span>Default discount</span><input name="defaultDiscount" type="number" min="0" step="0.01" defaultValue={(template.defaultDiscountCents / 100).toFixed(2)} /></label>
        <label><span>Payment terms</span><input name="paymentTerms" defaultValue={template.paymentTerms} /></label>
        <label><span>Accepted payment methods</span><input name="acceptedPaymentMethods" defaultValue={template.acceptedPaymentMethods} /></label>
        <label className="span-2"><span>Late fee policy</span><textarea name="lateFeePolicy" defaultValue={template.lateFeePolicy} /></label>
        <label className="span-2"><span>Memo / customer note</span><textarea name="memo" defaultValue={template.memo} /></label>
        <label className="span-2"><span>Terms and conditions</span><textarea name="termsAndConditions" defaultValue={template.termsAndConditions} /></label>
        <label className="span-2"><span>Footer</span><textarea name="footer" defaultValue={template.footer} /></label>
      </div>
      <label><input name="showCompanyContact" type="checkbox" defaultChecked={template.showCompanyContact} /> Show company contact details</label>
      <label><input name="showCustomerDetails" type="checkbox" defaultChecked={template.showCustomerDetails} /> Show customer billing details</label>
      <label><input name="showServiceAddress" type="checkbox" defaultChecked={template.showServiceAddress} /> Show service address</label>
      <label><input name="showTechnician" type="checkbox" defaultChecked={template.showTechnician} /> Show assigned technician</label>
      <label><input name="showLineItemPrices" type="checkbox" defaultChecked={template.showLineItemPrices} /> Show line-item prices</label>
      <label><input name="showTaxAndDiscount" type="checkbox" defaultChecked={template.showTaxAndDiscount} /> Show tax and discount summary</label>
      <label><input name="showPaymentHistory" type="checkbox" defaultChecked={template.showPaymentHistory} /> Show payment history and balance</label>
      <label><input name="showTerms" type="checkbox" defaultChecked={template.showTerms} /> Show terms and conditions</label>
      <button className="button primary" disabled={pending}>{pending ? "Saving…" : "Save invoice template"}</button>
      {message && <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>}
    </form>
  );
}
