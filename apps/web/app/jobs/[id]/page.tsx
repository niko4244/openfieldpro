import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";
import { EstimateActionPanel, JobActionPanel, LineItemDeleteButton, LineItemForm } from "../../../components/WorkflowForms";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let activities: Awaited<ReturnType<typeof api.activities>> = [];
  let lineItems: Awaited<ReturnType<typeof api.lineItems>> = [];
  let estimates: Awaited<ReturnType<typeof api.estimates>> = [];
  let error: string | null = null;

  try {
    [jobs, customers, activities, lineItems, estimates] = await Promise.all([
      api.jobs(),
      api.customers(),
      api.activities({ jobId: id }).catch(() => []),
      api.lineItems(id).catch(() => []),
      api.estimates().catch(() => []),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const job = jobs.find((row) => row.id === id);
  const customer = job ? customers.find((row) => row.id === job.customerId) : null;
  const revenue = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const materialCost = lineItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalCost = materialCost + (job?.laborCostCents ?? 0);
  const margin = (job?.total ?? revenue) - totalCost;
  const jobEstimates = estimates.filter((estimate) => estimate.jobId === id);

  return (
    <div className="page-stack">
      {error || !job ? (
        <section className="section-card"><p className="notice error">Unable to load job ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Job workspace</p>
              <h1>{job.title}</h1>
              <p className="muted">{customer?.name ?? job.customerId.slice(0, 8)} · {formatMoney(job.total)}</p>
              <JobActionPanel job={job} />
            </div>
            <div className="command-panel">
              <span className="table-label">Quote state</span>
              <strong>{jobEstimates.some((estimate) => estimate.accepted) ? "accepted" : jobEstimates.length ? "draft" : "not created"}</strong>
              <p className="muted">Create an estimate before dispatch, then accept it when the customer approves.</p>
              <EstimateActionPanel job={job} estimates={jobEstimates} />
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Revenue</span><strong>{formatMoney(job.total)}</strong></div>
            <div className="detail-item"><span>Total cost</span><strong>{formatMoney(totalCost)}</strong></div>
            <div className="detail-item"><span>Margin</span><strong>{formatMoney(margin)}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Line items</h2><p className="muted">Build the quote and job total from billable parts, labor, and fees.</p></div></div>
              <div className="card-list">
                {lineItems.map((item) => (
                  <div className="list-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <p className="muted">Qty {item.quantity} · price {formatMoney(item.unitPrice)} · cost {formatMoney(item.unitCost)}</p>
                    </div>
                    <div className="action-panel"><strong>{formatMoney(item.quantity * item.unitPrice)}</strong><LineItemDeleteButton item={item} /></div>
                  </div>
                ))}
                {lineItems.length === 0 && <div className="empty-state">No line items yet. Add scope before creating the estimate.</div>}
              </div>
              <LineItemForm jobId={job.id} />
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Job notes</h2><p className="muted">Current scope and field instructions.</p></div></div>
              <p className="muted">{job.description ?? "No description yet."}</p>
              <div className="section-header" style={{ marginTop: 24 }}><div><h2>Activity</h2><p className="muted">Audit trail for this job.</p></div></div>
              <div className="card-list">
                {activities.map((activity) => (
                  <div className="list-row" key={activity.id}>
                    <div><strong>{activity.summary}</strong><p className="muted">{new Date(activity.createdAt).toLocaleString()}</p></div>
                  </div>
                ))}
                {activities.length === 0 && <div className="empty-state">No activity yet.</div>}
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
