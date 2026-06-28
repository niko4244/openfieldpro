import { api } from "../../lib/api";
import { formatMoney } from "@ofp/shared";
import { EstimateActionPanel } from "../../components/WorkflowForms";

export default async function EstimatesPage() {
  let estimates: Awaited<ReturnType<typeof api.estimates>> = [];
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let error: string | null = null;

  try {
    [estimates, jobs, customers] = await Promise.all([api.estimates(), api.jobs(), api.customers()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const jobFor = (id: string) => jobs.find((job) => job.id === id);
  const customerName = (customerId?: string) => customers.find((customer) => customer.id === customerId)?.name ?? "Unknown customer";
  const accepted = estimates.filter((estimate) => estimate.accepted);
  const draft = estimates.filter((estimate) => !estimate.accepted);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Quotes</p>
          <h1>Turn job scope into customer approval.</h1>
          <p className="muted">Estimates snapshot the current job total. Accepting a quote moves the job into scheduled work.</p>
          <div className="hero-actions">
            <a className="button primary" href="/jobs/new">Create job</a>
            <a className="button" href="/jobs">Open jobs</a>
          </div>
        </div>
        <div className="command-panel">
          <span className="table-label">Quote pipeline</span>
          <strong>{draft.length} draft</strong>
          <p className="muted">{accepted.length} accepted quotes ready for dispatch or invoicing.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header"><div><h2>Estimate queue</h2><p className="muted">Review, accept, share, and continue the job workflow.</p></div></div>
        {error ? <p className="notice error">API unreachable ({error}).</p> : (
          <div className="card-list">
            {estimates.map((estimate) => {
              const job = jobFor(estimate.jobId);
              return (
                <div className="list-row with-rail" key={estimate.id}>
                  <div>
                    <strong>{job?.title ?? estimate.jobId.slice(0, 8)}</strong>
                    <p className="muted">{customerName(job?.customerId)} · {formatMoney(estimate.total)}</p>
                  </div>
                  <div className="action-panel">
                    <span className={estimate.accepted ? "status-pill status-completed" : "status-pill status-draft"}>{estimate.accepted ? "accepted" : "draft"}</span>
                    {estimate.publicToken && <a className="button compact" href={`/public/estimates/${estimate.publicToken}`}>Public link</a>}
                    {job && <EstimateActionPanel job={job} estimates={[estimate]} />}
                    {job && <a className="button compact" href={`/jobs/${job.id}`}>Open job</a>}
                  </div>
                </div>
              );
            })}
            {estimates.length === 0 && <div className="empty-state">No estimates yet. Open a job workspace and create one from line items.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
