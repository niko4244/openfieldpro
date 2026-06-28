import { api } from "../../lib/api";
import { formatMoney } from "@ofp/shared";
import { PaymentForm } from "../../components/WorkflowForms";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export default async function InvoicesPage() {
  let invoices: Awaited<ReturnType<typeof api.invoices>> = [];
  let error: string | null = null;
  try {
    invoices = await api.invoices();
  } catch (e) {
    error = (e as Error).message;
  }

  const openInvoices = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "draft");
  const sentInvoices = invoices.filter((invoice) => invoice.status === "sent");
  let outstanding = 0;
  let paid = 0;
  for (const invoice of invoices) {
    if (invoice.status === "sent" || invoice.status === "draft") outstanding += invoice.total;
    if (invoice.status === "paid") paid += invoice.total;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Collect faster without losing invoice context.</h1>
          <p className="muted">Create invoices from job workspaces, track follow-up, export receivables, and record payments from one billing queue.</p>
          <div className="hero-actions">
            <a className="button" href="/settings/invoice">Customize template</a>
            <a className="button" href={`${API_BASE}/api/invoices/export.csv`}>Export CSV</a>
          </div>
        </div>
        <div className="command-panel">
          <span className="table-label">Outstanding</span>
          <strong>{formatMoney(outstanding)}</strong>
          <p className="muted">Draft and sent invoices still requiring follow-up.</p>
        </div>
      </section>

      <section className="metric-grid" aria-label="Invoice metrics">
        <div className="metric-card"><span>Total invoices</span><strong>{invoices.length}</strong></div>
        <div className="metric-card"><span>Outstanding</span><strong>{formatMoney(outstanding)}</strong></div>
        <div className="metric-card"><span>Paid</span><strong>{formatMoney(paid)}</strong></div>
        <div className="metric-card"><span>Follow-up queue</span><strong>{sentInvoices.length}</strong></div>
      </section>

      <section className="split-grid">
        <div className="section-card">
          <div className="section-header"><div><h2>Invoices</h2><p className="muted">Open an invoice to inspect line items, template preview, payment history, and reminder plan.</p></div></div>
          {error ? (
            <p className="notice error">API unreachable ({error}).</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Number</th><th>Status</th><th>Total</th><th>Follow-up</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td><strong>{invoice.number}</strong></td>
                      <td><span className={`status-pill status-${invoice.status}`}>{invoice.status}</span></td>
                      <td>{formatMoney(invoice.total)}</td>
                      <td>{invoice.status === "sent" ? <a className="button compact" href={`${API_BASE}/api/invoices/${invoice.id}/reminder-plan`}>Reminder plan</a> : <span className="muted">—</span>}</td>
                      <td><a className="button compact" href={`/invoices/${invoice.id}`}>Open</a></td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={5}>No invoices yet. Create one from a job workspace.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="section-card">
          <div className="section-header"><div><h2>Record payment</h2><p className="muted">For cash, check, manual, or card-terminal payments.</p></div></div>
          {error ? <p className="notice error">API unreachable ({error}).</p> : <PaymentForm invoices={openInvoices} />}
        </aside>
      </section>
    </div>
  );
}
