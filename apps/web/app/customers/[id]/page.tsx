import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customer: Awaited<ReturnType<typeof api.customer>> | null = null;
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let activities: Awaited<ReturnType<typeof api.activities>> = [];
  let error: string | null = null;

  try {
    [customer, jobs, activities] = await Promise.all([
      api.customer(id),
      api.jobs(),
      api.activities({ customerId: id }).catch(() => []),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const customerJobs = jobs.filter((job) => job.customerId === id);
  const lifetime = customerJobs.reduce((sum, job) => sum + job.total, 0);

  return (
    <div className="page-stack">
      {error || !customer ? (
        <section className="section-card"><p className="notice error">Unable to load customer ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Customer hub</p>
              <h1>{customer.name}</h1>
              <p className="muted">{customer.email ?? "No email"} · {customer.phone ?? "No phone"}</p>
              <div className="hero-actions">
                <a className="button primary" href={`/jobs/new?customerId=${customer.id}`}>New job</a>
                <a className="button" href="/schedule">Schedule</a>
                {customer.phone && <a className="button" href={`tel:${customer.phone}`}>Call</a>}
                {customer.email && <a className="button" href={`mailto:${customer.email}`}>Email</a>}
              </div>
            </div>
            <div className="command-panel">
              <span className="table-label">Customer value</span>
              <strong>{formatMoney(lifetime)}</strong>
              <p className="muted">Total value across current job records.</p>
            </div>
          </section>

          <section className="detail-grid">
            <div className="detail-item"><span>Jobs</span><strong>{customerJobs.length}</strong></div>
            <div className="detail-item"><span>Open</span><strong>{customerJobs.filter((job) => job.status !== "completed" && job.status !== "canceled").length}</strong></div>
            <div className="detail-item"><span>Lifetime</span><strong>{formatMoney(lifetime)}</strong></div>
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header"><div><h2>Jobs</h2><p className="muted">Work history and open opportunities.</p></div></div>
              <div className="card-list">
                {customerJobs.map((job) => (
                  <a className="list-row with-rail" href={`/jobs/${job.id}`} key={job.id}>
                    <div><strong>{job.title}</strong><p className="muted">{formatMoney(job.total)}</p></div>
                    <span className={`status-pill status-${job.status}`}>{job.status.replaceAll("_", " ")}</span>
                  </a>
                ))}
                {customerJobs.length === 0 && <div className="empty-state">No jobs yet. Create one from this customer hub.</div>}
              </div>
            </div>

            <aside className="section-card">
              <div className="section-header"><div><h2>Activity</h2><p className="muted">Recent customer timeline.</p></div></div>
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
