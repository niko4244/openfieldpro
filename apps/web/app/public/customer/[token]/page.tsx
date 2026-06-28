import { formatMoney } from "@ofp/shared";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

interface CustomerPortalDetail {
  customer: { id: string; name: string; email?: string | null; phone?: string | null };
  org?: { id: string; name: string } | null;
  jobs: Array<{ id: string; title: string; description?: string | null; status: string; total: number; scheduledAt?: string | null; createdAt: string }>;
  invoices: Array<{ id: string; jobId: string; number: string; status: string; total: number; paid: number; balance: number; dueAt?: string | null; createdAt: string; publicUrl?: string | null }>;
  payments: Array<{ id: string; invoiceId: string; amount: number; method: string; paidAt: string }>;
  totals: { totalBilled: number; totalPaid: number; totalBalance: number };
}

async function loadPortal(token: string): Promise<CustomerPortalDetail> {
  const res = await fetch(`${BASE}/api/public/customer-portal/${token}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`customer portal lookup failed (${res.status})`);
  return res.json() as Promise<CustomerPortalDetail>;
}

export default async function PublicCustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: CustomerPortalDetail | null = null;
  let error: string | null = null;

  try {
    data = await loadPortal(token);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      {error || !data ? (
        <section className="section-card"><p className="notice error">Unable to load customer portal ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Customer portal</p>
              <h1>{data.customer.name}</h1>
              <p className="muted">{data.org?.name ?? "OpenFieldPro"} · {[data.customer.email, data.customer.phone].filter(Boolean).join(" · ") || "Customer history"}</p>
            </div>
            <div className="command-panel">
              <span className="table-label">Open balance</span>
              <strong>{formatMoney(data.totals.totalBalance)}</strong>
              <p className="muted">{data.invoices.length} invoice{data.invoices.length === 1 ? "" : "s"} · {data.jobs.length} job{data.jobs.length === 1 ? "" : "s"}</p>
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Total billed</span><strong>{formatMoney(data.totals.totalBilled)}</strong></div>
            <div className="detail-item"><span>Total paid</span><strong>{formatMoney(data.totals.totalPaid)}</strong></div>
            <div className="detail-item"><span>Balance due</span><strong>{formatMoney(data.totals.totalBalance)}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Invoices</h2><p className="muted">All visible invoices and balances for this customer.</p></div></div>
              <div className="card-list">
                {data.invoices.map((invoice) => (
                  <div className="list-row" key={invoice.id}>
                    <div>
                      <strong>{invoice.number}</strong>
                      <p className="muted">Due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "not set"} · paid {formatMoney(invoice.paid)} · balance {formatMoney(invoice.balance)}</p>
                    </div>
                    <div className="action-panel">
                      <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
                      {invoice.publicUrl && <a className="button compact" href={invoice.publicUrl}>Open</a>}
                    </div>
                  </div>
                ))}
                {data.invoices.length === 0 && <div className="empty-state">No invoices are available in this portal yet.</div>}
              </div>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Service history</h2><p className="muted">Jobs and requests connected to this customer.</p></div></div>
              <div className="card-list">
                {data.jobs.map((job) => (
                  <div className="list-row" key={job.id}>
                    <div>
                      <strong>{job.title}</strong>
                      <p className="muted">{job.description || "No description"}</p>
                      <p className="fine-print">{job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleDateString()}` : `Created ${new Date(job.createdAt).toLocaleDateString()}`}</p>
                    </div>
                    <span className={`status-pill status-${job.status}`}>{job.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
                {data.jobs.length === 0 && <div className="empty-state">No service history is available yet.</div>}
              </div>
            </aside>
          </section>

          <section className="section-card">
            <div className="section-header"><div><h2>Payment history</h2><p className="muted">Payments recorded across this customer’s invoices.</p></div></div>
            <div className="card-list">
              {data.payments.map((payment) => (
                <div className="list-row" key={payment.id}>
                  <div><strong>{formatMoney(payment.amount)}</strong><p className="muted">{payment.method} · {new Date(payment.paidAt).toLocaleDateString()}</p></div>
                  <span className="status-pill status-paid">paid</span>
                </div>
              ))}
              {data.payments.length === 0 && <div className="empty-state">No payments have been recorded yet.</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
