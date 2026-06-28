import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";
import { PaymentForm } from "../../../components/WorkflowForms";
import { SendInvoiceButton } from "../../../components/InvoiceActions";
import { InvoicePreviewCard } from "../../../components/InvoiceTemplateDesigner";
import { ReminderScheduleForm } from "../../../components/BillingEnhancements";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Awaited<ReturnType<typeof api.invoice>> | null = null;
  let preview: Awaited<ReturnType<typeof api.invoicePreview>> | null = null;
  let reminderPlan: Awaited<ReturnType<typeof api.invoiceReminderPlan>> | null = null;
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let error: string | null = null;

  try {
    [invoice, preview, reminderPlan, jobs] = await Promise.all([
      api.invoice(id),
      api.invoicePreview(id).catch(() => null),
      api.invoiceReminderPlan(id).catch(() => null),
      api.jobs(),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const job = invoice ? jobs.find((row) => row.id === invoice.jobId) : null;
  const paid = invoice?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const remaining = Math.max((invoice?.total ?? 0) - paid, 0);
  const isOpen = invoice?.status === "sent" || invoice?.status === "draft";

  return (
    <div className="page-stack">
      {error || !invoice ? (
        <section className="section-card"><p className="notice error">Unable to load invoice ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Invoice detail</p>
              <h1>{invoice.number}</h1>
              <p className="muted">{job?.title ?? invoice.jobId.slice(0, 8)} · due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "not set"}</p>
              <div className="hero-actions">
                {job && <a className="button" href={`/jobs/${job.id}`}>Open job</a>}
                <a className="button" href={`${API_BASE}/api/invoices/${invoice.id}.pdf`}>Download PDF</a>
                <a className="button" href="/settings/invoice">Customize template</a>
                <a className="button" href="/invoices">Back to invoices</a>
              </div>
            </div>
            <div className="command-panel">
              <span className="table-label">Balance</span>
              <strong>{formatMoney(remaining)}</strong>
              <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
              <SendInvoiceButton invoiceId={invoice.id} status={invoice.status} />
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Total</span><strong>{formatMoney(invoice.total)}</strong></div>
            <div className="detail-item"><span>Paid</span><strong>{formatMoney(paid)}</strong></div>
            <div className="detail-item"><span>Remaining</span><strong>{formatMoney(remaining)}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Line items</h2><p className="muted">Snapshot from the source job.</p></div></div>
              <div className="card-list">
                {invoice.lineItems.map((item) => (
                  <div className="list-row" key={item.id}>
                    <div><strong>{item.description}</strong><p className="muted">Qty {item.quantity} · {formatMoney(item.unitPrice)}</p></div>
                    <strong>{formatMoney(item.quantity * item.unitPrice)}</strong>
                  </div>
                ))}
                {invoice.lineItems.length === 0 && <div className="empty-state">No line items were attached to this job.</div>}
              </div>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Payments</h2><p className="muted">Cash, check, card-terminal, and manual receipts.</p></div></div>
              <div className="card-list">
                {invoice.payments.map((payment) => (
                  <div className="list-row" key={payment.id}>
                    <div><strong>{formatMoney(payment.amount)}</strong><p className="muted">{payment.method} · {new Date(payment.paidAt).toLocaleDateString()}</p></div>
                    <span className="status-pill status-paid">paid</span>
                  </div>
                ))}
                {invoice.payments.length === 0 && <div className="empty-state">No payments recorded yet.</div>}
              </div>
              {isOpen && <PaymentForm invoices={[invoice]} />}
            </aside>
          </section>

          {reminderPlan && (
            <section className="section-card">
              <div className="section-header"><div><h2>Reminder schedule</h2><p className="muted">Automated follow-up schedule for sent invoices.</p></div></div>
              <ReminderScheduleForm invoiceId={invoice.id} schedules={reminderPlan.schedule} />
            </section>
          )}

          {preview && (
            <section>
              <div className="section-header"><div><h2>Customer invoice preview</h2><p className="muted">Rendered with the current company invoice template.</p></div></div>
              <InvoicePreviewCard preview={preview} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
