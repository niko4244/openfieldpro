import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";
import { JobActionPanel } from "../../../components/WorkflowForms";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let activities: Awaited<ReturnType<typeof api.activities>> = [];
  let error: string | null = null;

  try {
    [jobs, customers, activities] = await Promise.all([
      api.jobs(),
      api.customers(),
      api.activities({ jobId: id }).catch(() => []),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const job = jobs.find((row) => row.id === id);
  const customer = job ? customers.find((row) => row.id === job.customerId) : null;

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
              <span className="table-label">Status</span>
              <strong>{job.status.replaceAll("_", " ")}</strong>
              <p className="muted">Move the job forward, then create the invoice from here.</p>
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Revenue</span><strong>{formatMoney(job.total)}</strong></div>
            <div className="detail-item"><span>Labor cost</span><strong>{formatMoney(job.laborCostCents ?? 0)}</strong></div>
            <div className="detail-item"><span>Customer</span><strong>{customer?.name ?? "Unknown"}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Job notes</h2><p className="muted">Current scope and field instructions.</p></div></div>
              <p className="muted">{job.description ?? "No description yet."}</p>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Activity</h2><p className="muted">Audit trail for this job.</p></div></div>
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
