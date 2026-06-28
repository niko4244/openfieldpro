import { api } from "../../lib/api";
import { formatMoney } from "@ofp/shared";

export default async function JobsPage() {
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let error: string | null = null;
  try {
    [jobs, customers] = await Promise.all([api.jobs(), api.customers()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? id.slice(0, 8);
  const openJobs = jobs.filter((job) => job.status !== "completed" && job.status !== "canceled");

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>The operational spine from lead to paid work.</h1>
          <p className="muted">Track every job by customer, status, value, and next action.</p>
          <div className="hero-actions">
            <a className="button primary" href="/jobs/new">Create job</a>
            <a className="button" href="/schedule">Schedule</a>
          </div>
        </div>
        <div className="command-panel">
          <span className="table-label">Open work</span>
          <strong>{openJobs.length}</strong>
          <p className="muted">Jobs that still need scheduling, field work, invoicing, or closeout.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header"><div><h2>Job queue</h2><p className="muted">Open a job to start work, mark complete, or create an invoice.</p></div></div>
        {error ? <p className="notice error">API unreachable ({error}).</p> : (
          <div className="card-list">
            {jobs.map((job) => (
              <a className="list-row with-rail" href={`/jobs/${job.id}`} key={job.id}>
                <div>
                  <strong>{job.title}</strong>
                  <p className="muted">{customerName(job.customerId)} · {formatMoney(job.total)}</p>
                </div>
                <span className={`status-pill status-${job.status}`}>{job.status.replaceAll("_", " ")}</span>
              </a>
            ))}
            {jobs.length === 0 && <div className="empty-state">No jobs yet. Create a job to start the workflow.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
