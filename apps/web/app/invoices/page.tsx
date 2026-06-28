import { api } from "../../lib/api";
import { formatMoney } from "@ofp/shared";

export default async function InvoicesPage() {
  let invoices: Awaited<ReturnType<typeof api.invoices>> = [];
  let error: string | null = null;
  try {
    invoices = await api.invoices();
  } catch (e) {
    error = (e as Error).message;
  }

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
          <h1>Keep receivables clear and current.</h1>
          <p className="muted">A flat, scannable invoice queue that works cleanly on desktop and mobile.</p>
        </div>
        <div className="hero-summary">
          <span className="table-label">Outstanding</span>
          <strong>{formatMoney(outstanding)}</strong>
          <p className="muted">Draft and sent invoices still requiring follow-up.</p>
        </div>
      </section>

      <section className="metric-grid" aria-label="Invoice metrics">
        <div className="metric-card"><span>Total invoices</span><strong>{invoices.length}</strong></div>
        <div className="metric-card"><span>Outstanding</span><strong>{formatMoney(outstanding)}</strong></div>
        <div className="metric-card"><span>Paid</span><strong>{formatMoney(paid)}</strong></div>
        <div className="metric-card"><span>Open balance</span><strong>{formatMoney(outstanding)}</strong></div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Invoices</h2>
            <p className="muted">Status, invoice number, and total at a glance.</p>
          </div>
        </div>
        {error ? (
          <p className="notice error">API unreachable ({error}).</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.number}</strong></td>
                    <td><span className={`status-pill status-${invoice.status}`}>{invoice.status}</span></td>
                    <td>{formatMoney(invoice.total)}</td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={3}>No invoices yet. Create one with <code>POST /api/invoices</code>.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
