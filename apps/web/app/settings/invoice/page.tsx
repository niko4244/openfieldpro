import { api } from "../../../lib/api";
import { InvoicePreviewCard, InvoiceTemplateForm } from "../../../components/InvoiceTemplateDesigner";

export default async function InvoiceSettingsPage() {
  let template: Awaited<ReturnType<typeof api.invoiceTemplate>> | null = null;
  let preview: Awaited<ReturnType<typeof api.invoicePreview>> | null = null;
  let error: string | null = null;

  try {
    [template, preview] = await Promise.all([api.invoiceTemplate(), api.invoicePreview()]);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Company customization</p>
          <h1>Design invoices before customers see them.</h1>
          <p className="muted">Customize company branding, terms, invoice prefix, memo text, footer language, and visibility rules with a live preview.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Template scope</span>
          <strong>{template?.templateStyle ?? "modern"}</strong>
          <p className="muted">Applies to invoice previews, sent invoices, future PDF/email rendering, and customer-facing billing views.</p>
        </div>
      </section>

      {error || !template || !preview ? (
        <section className="section-card"><p className="notice error">Unable to load invoice settings ({error ?? "missing template"}).</p></section>
      ) : (
        <section className="split-grid">
          <div className="section-card">
            <div className="section-header"><div><h2>Invoice template</h2><p className="muted">Set the default branding and language for customer invoices.</p></div></div>
            <InvoiceTemplateForm template={template} />
          </div>
          <div>
            <InvoicePreviewCard preview={preview} />
          </div>
        </section>
      )}
    </div>
  );
}
