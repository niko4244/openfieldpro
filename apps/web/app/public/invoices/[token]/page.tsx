import { PublicInvoiceCheckoutButton } from "../../../../components/PublicInvoiceActions";
import { formatMoney } from "@ofp/shared";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

interface PublicInvoiceDetail {
  invoice: { id: string; number: string; status: "draft" | "sent" | "paid" | "void"; total: number; dueAt?: string | null; createdAt: string; poNumber?: string | null };
  job: { id: string; title: string; description?: string | null };
  customer?: { id: string; name: string; email?: string | null; phone?: string | null; publicToken?: string | null } | null;
  property?: { address: string } | null;
  org?: { id: string; name: string } | null;
  template?: { companyName: string; paymentTerms: string; acceptedPaymentMethods: string; lateFeePolicy: string; memo: string; footer: string; termsAndConditions: string } | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxable?: boolean | null }>;
  payments: Array<{ id: string; amount: number; method: string; paidAt: string }>;
  totals: { paid: number; balance: number };
  portalToken?: string | null;
  portalUrl?: string | null;
}

async function loadInvoice(token: string): Promise<PublicInvoiceDetail> {
  const res = await fetch(`${BASE}/api/public/invoices/${token}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`invoice lookup failed (${res.status})`);
  return res.json() as Promise<PublicInvoiceDetail>;
}

export default async function PublicInvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  let data: PublicInvoiceDetail | null = null;
  let error: string | null = null;

  try {
    data = await loadInvoice(token);
  } catch (e) {
    error = (e as Error).message;
  }

  const paid = data ? data.totals.balance <= 0 || data.invoice.status === "paid" : false;

  return (
    <div className="page-stack">
      {error || !data ? (
        <section className="section-card"><p className="notice error">Unable to load invoice ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Invoice from {data.template?.companyName ?? data.org?.name ?? "OpenFieldPro"}</p>
              <h1>{data.invoice.number}</h1>
              <p className="muted">{data.job.title} · due {data.invoice.dueAt ? new Date(data.invoice.dueAt).toLocaleDateString() : "not set"}</p>
              {query.paid && <p className="notice success">Payment session completed. Payment status may take a moment to update.</p>}
              <div className="hero-actions">
                <a className="button" href={`${BASE}/api/public/invoices/${token}.pdf`}>Download PDF</a>
                {data.portalUrl && <a className="button" href={data.portalUrl}>Customer portal</a>}
              </div>
            </div>
            <div className="command-panel">
              <span className="table-label">Balance due</span>
              <strong>{formatMoney(data.totals.balance)}</strong>
              <span className={`status-pill status-${data.invoice.status}`}>{paid ? "paid" : data.invoice.status}</span>
              <PublicInvoiceCheckoutButton token={token} paid={paid} />
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Total</span><strong>{formatMoney(data.invoice.total)}</strong></div>
            <div className="detail-item"><span>Paid</span><strong>{formatMoney(data.totals.paid)}</strong></div>
            <div className="detail-item"><span>Balance</span><strong>{formatMoney(data.totals.balance)}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Invoice details</h2><p className="muted">Billable work and customer-safe service details.</p></div></div>
              <div className="detail-grid" style={{ marginBottom: 18 }}>
                <div className="detail-item"><span>Bill to</span><strong>{data.customer?.name ?? "Customer"}</strong><p className="muted">{[data.customer?.email, data.customer?.phone].filter(Boolean).join(" · ")}</p></div>
                <div className="detail-item"><span>Service address</span><strong>{data.property?.address ?? "Not listed"}</strong></div>
                <div className="detail-item"><span>PO number</span><strong>{data.invoice.poNumber ?? "—"}</strong></div>
              </div>
              <div className="card-list">
                {data.lineItems.map((item, index) => (
                  <div className="list-row" key={`${item.description}-${index}`}>
                    <div><strong>{item.description}</strong><p className="muted">Qty {item.quantity} · {formatMoney(item.unitPrice)} {item.taxable === false ? "· non-taxable" : ""}</p></div>
                    <strong>{formatMoney(item.quantity * item.unitPrice)}</strong>
                  </div>
                ))}
                {data.lineItems.length === 0 && <div className="empty-state">This invoice does not list itemized work yet.</div>}
              </div>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Payment and terms</h2><p className="muted">Accepted payment methods and previous payments.</p></div></div>
              <p className="muted"><strong>Terms:</strong> {data.template?.paymentTerms ?? "Due on receipt"}</p>
              <p className="muted"><strong>Accepted methods:</strong> {data.template?.acceptedPaymentMethods ?? "Online payment, cash, check"}</p>
              <p className="muted"><strong>Late fee policy:</strong> {data.template?.lateFeePolicy ?? "Late fees may apply."}</p>
              <div className="card-list" style={{ marginTop: 18 }}>
                {data.payments.map((payment) => (
                  <div className="list-row" key={payment.id}>
                    <div><strong>{formatMoney(payment.amount)}</strong><p className="muted">{payment.method} · {new Date(payment.paidAt).toLocaleDateString()}</p></div>
                    <span className="status-pill status-paid">paid</span>
                  </div>
                ))}
                {data.payments.length === 0 && <div className="empty-state">No payments recorded yet.</div>}
              </div>
              <p className="fine-print">{data.template?.footer ?? "Questions? Contact the business before paying."}</p>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
