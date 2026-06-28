import { PublicEstimateAcceptButton } from "../../../../components/PublicEstimateActions";
import { formatMoney } from "@ofp/shared";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

interface PublicEstimateDetail {
  estimate: { id: string; total: number; accepted: boolean; publicToken?: string | null; createdAt: string };
  job: { id: string; title: string; description?: string | null };
  customer?: { id: string; name: string } | null;
  org?: { id: string; name: string } | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
}

async function loadEstimate(token: string): Promise<PublicEstimateDetail> {
  const res = await fetch(`${BASE}/api/public/estimates/${token}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`estimate lookup failed (${res.status})`);
  return res.json() as Promise<PublicEstimateDetail>;
}

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: PublicEstimateDetail | null = null;
  let error: string | null = null;

  try {
    data = await loadEstimate(token);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      {error || !data ? (
        <section className="section-card"><p className="notice error">Unable to load estimate ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Estimate from {data.org?.name ?? "OpenFieldPro"}</p>
              <h1>{data.job.title}</h1>
              <p className="muted">Prepared for {data.customer?.name ?? "customer"}. Review the scope and accept when ready.</p>
            </div>
            <div className="command-panel">
              <span className="table-label">Estimate total</span>
              <strong>{formatMoney(data.estimate.total)}</strong>
              <span className={data.estimate.accepted ? "status-pill status-completed" : "status-pill status-draft"}>
                {data.estimate.accepted ? "accepted" : "awaiting approval"}
              </span>
              <PublicEstimateAcceptButton token={token} accepted={data.estimate.accepted} />
            </div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Scope</h2><p className="muted">What this estimate covers.</p></div></div>
              <p className="muted">{data.job.description ?? "No additional description provided."}</p>
              <div className="card-list" style={{ marginTop: 18 }}>
                {data.lineItems.map((item, index) => (
                  <div className="list-row" key={`${item.description}-${index}`}>
                    <div><strong>{item.description}</strong><p className="muted">Qty {item.quantity} · {formatMoney(item.unitPrice)}</p></div>
                    <strong>{formatMoney(item.quantity * item.unitPrice)}</strong>
                  </div>
                ))}
                {data.lineItems.length === 0 && <div className="empty-state">This estimate does not list itemized work yet.</div>}
              </div>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Next step</h2><p className="muted">Approving the estimate notifies the business workflow and moves the job toward scheduling.</p></div></div>
              <p className="muted">This page is intentionally customer-facing and does not expose internal cost, margin, or private shop data.</p>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
