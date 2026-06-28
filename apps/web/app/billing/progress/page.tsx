import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";

export default async function ProgressBillingPage() {
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let error: string | null = null;
  try {
    jobs = await api.jobs();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Progress billing</p>
          <h1>Create staged invoices from large jobs.</h1>
          <p className="muted">Open a job workspace to add milestones, then convert a milestone into a draft invoice when that phase is ready to bill.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Billable jobs</span>
          <strong>{jobs.length}</strong>
          <p className="muted">Milestone API endpoints are now available for staged billing.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header"><div><h2>Jobs</h2><p className="muted">Choose a job to manage line items, quotes, invoices, and progress billing.</p></div></div>
        {error ? <p className="notice error">API unreachable ({error}).</p> : (
          <div className="card-list">
            {jobs.map((job) => (
              <a className="list-row" href={`/jobs/${job.id}`} key={job.id}>
                <div><strong>{job.title}</strong><p className="muted">{formatMoney(job.total)} · {job.status.replaceAll("_", " ")}</p></div>
                <span className="button compact">Open</span>
              </a>
            ))}
            {jobs.length === 0 && <div className="empty-state">No jobs yet.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
