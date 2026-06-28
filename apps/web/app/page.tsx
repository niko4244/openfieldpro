import { api } from "../lib/api";
import { formatMoney } from "@ofp/shared";
import type { ReportSummaryDTO } from "@ofp/shared";

export default async function Dashboard() {
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let summary: ReportSummaryDTO | null = null;
  let error: string | null = null;

  try {
    [jobs, summary] = await Promise.all([api.jobs(), api.reports().catch(() => null)]);
  } catch (e) {
    error = (e as Error).message;
  }

  let scheduled = 0;
  let completedRevenue = 0;
  for (const job of jobs) {
    if (job.status === "scheduled") scheduled += 1;
    if (job.status === "completed") completedRevenue += job.total;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Operations dashboard</p>
          <h1>Run the day from one clean workspace.</h1>
          <p className="muted">
            Track jobs, schedule pressure, revenue, and margin without bouncing between paper, texts, and spreadsheets.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/customers">Review customers</a>
            <a className="button" href="/schedule">Open schedule</a>
          </div>
        </div>
        <div className="hero-summary" aria-label="Today summary">
          <span className="table-label">Pipeline margin</span>
          <strong>{formatMoney(summary?.pipelineMarginCents ?? 0)}</strong>
          <p className="muted">Live margin estimate across every non-canceled job in the current shop.</p>
        </div>
      </section>

      {error ? (
        <section className="section-card">
          <p className="notice error">
            API unreachable ({error}). Start it with <code>pnpm dev:api</code> and seed with <code>pnpm db:seed</code>.
          </p>
        </section>
      ) : (
        <>
          <section className="metric-grid" aria-label="Business metrics">
            <Metric label="Open jobs" value={String(jobs.length)} />
            <Metric label="Scheduled" value={String(scheduled)} />
            <Metric label="Completed revenue" value={formatMoney(completedRevenue)} />
            <Metric label="Realized margin" value={formatMoney(summary?.realizedMarginCents ?? 0)} />
          </section>

          <section className="section-card">
            <div className="section-header">
              <div>
                <h2>Recent jobs</h2>
                <p className="muted">Latest work orders by status and value.</p>
              </div>
              <a className="button compact" href="/schedule">Dispatch view</a>
            </div>
            <div className="card-list">
              {jobs.map((job) => (
                <div className="list-row" key={job.id}>
                  <div>
                    <strong>{job.title}</strong>
                    <p className="muted">{formatMoney(job.total)} · customer {job.customerId.slice(0, 8)}</p>
                  </div>
                  <span className={`status-pill status-${job.status}`}>{job.status.replaceAll("_", " ")}</span>
                </div>
              ))}
              {jobs.length === 0 && <div className="empty-state">No jobs yet.</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
