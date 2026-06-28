"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceTemplate } from "../lib/client-api";
import { formatMoney } from "@ofp/shared";
import type { InvoicePreviewDTO, InvoiceTemplateDTO } from "../lib/api";

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function InvoicePreviewCard({ preview }: { preview: InvoicePreviewDTO }) {
  const { template, invoice, lineItems, totals } = preview;
  return (
    <article className={`section-card invoice-preview ${template.templateStyle}`} style={{ borderTop: `8px solid ${template.accentColor}` }}>
      <div className="section-header">
        <div>
          {template.logoUrl ? <img src={template.logoUrl} alt={`${template.companyName} logo`} style={{ maxHeight: 52, maxWidth: 180 }} /> : <h2>{template.companyName}</h2>}
          <p className="muted">{template.paymentTerms}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <h2>Invoice {invoice.number}</h2>
          <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              {template.showLineItemPrices && <th>Unit</th>}
              {template.showLineItemPrices && <th>Amount</th>}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={`${item.description}-${index}`}>
                <td><strong>{item.description}</strong></td>
                <td>{item.quantity}</td>
                {template.showLineItemPrices && <td>{formatMoney(item.unitPrice)}</td>}
                {template.showLineItemPrices && <td>{formatMoney(item.amount)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="summary" style={{ marginLeft: "auto", maxWidth: 320, marginTop: 20 }}>
        <div className="list-row"><span>Total</span><strong>{formatMoney(totals.total)}</strong></div>
        {template.showPaymentHistory && <div className="list-row"><span>Paid</span><strong>{formatMoney(totals.paid)}</strong></div>}
        {template.showPaymentHistory && <div className="list-row"><span>Balance</span><strong>{formatMoney(totals.balance)}</strong></div>}
      </div>

      <div className="empty-state" style={{ marginTop: 20, textAlign: "left" }}>{template.memo}</div>
      <p className="fine-print">{template.footer}</p>
    </article>
  );
}

export function InvoiceTemplateForm({ template }: { template: InvoiceTemplateDTO }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateInvoiceTemplate({
          companyName: formValue(form, "companyName"),
          logoUrl: formValue(form, "logoUrl"),
          accentColor: formValue(form, "accentColor") || "#2463eb",
          templateStyle: formValue(form, "templateStyle") as "modern" | "classic" | "compact",
          invoicePrefix: formValue(form, "invoicePrefix") || "INV",
          paymentTerms: formValue(form, "paymentTerms") || "Due on receipt",
          memo: formValue(form, "memo") || "Thank you for your business.",
          footer: formValue(form, "footer") || "Questions? Contact us before paying.",
          showLineItemPrices: form.get("showLineItemPrices") === "on",
          showPaymentHistory: form.get("showPaymentHistory") === "on",
        });
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
        <label><span>Accent color</span><input name="accentColor" defaultValue={template.accentColor} placeholder="#2463eb" /></label>
        <label><span>Template style</span><select name="templateStyle" defaultValue={template.templateStyle}><option value="modern">Modern</option><option value="classic">Classic</option><option value="compact">Compact</option></select></label>
        <label><span>Invoice prefix</span><input name="invoicePrefix" defaultValue={template.invoicePrefix} /></label>
        <label><span>Payment terms</span><input name="paymentTerms" defaultValue={template.paymentTerms} /></label>
        <label className="span-2"><span>Memo</span><textarea name="memo" defaultValue={template.memo} /></label>
        <label className="span-2"><span>Footer</span><textarea name="footer" defaultValue={template.footer} /></label>
      </div>
      <label><input name="showLineItemPrices" type="checkbox" defaultChecked={template.showLineItemPrices} /> Show line-item prices</label>
      <label><input name="showPaymentHistory" type="checkbox" defaultChecked={template.showPaymentHistory} /> Show payment history and balance</label>
      <button className="button primary" disabled={pending}>{pending ? "Saving…" : "Save invoice template"}</button>
      {message && <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>}
    </form>
  );
}
