import { api } from "../lib/api";
import { formatMoney } from "@ofp/shared";
import type { ReportSummaryDTO } from "@ofp/shared";

export default async function Dashboard() {
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let appointments: Awaited<ReturnType<typeof api.appointments>> = [];
  let invoices: Awaited<ReturnType<typeof api.invoices>> = [];
  let summary: ReportSummaryDTO | null = null;
  let error: string | null = null;

  try {
    [jobs, appointments, invoices, summary] = await Promise.all([
      api.jobs(),
      api.appointments(),
      api.invoices(),
      api.reports().catch(() => null),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const unassigned = jobs.filter((job) => job.status === "lead");
  const active = jobs.filter((job) => job.status === "scheduled" || job.status === "in_progress");
  const openInvoices = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "draft");
  const outstanding = openInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const todayKey = new Date().toDateString();
  const todayAppointments = appointments.filter((appointment) => new Date(appointment.startsAt).toDateString() === todayKey);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Today command center</p>
          <h1>See the next job, the stuck work, and the money waiting.</h1>
          <p className="muted">
            OpenFieldPro now starts like an operator cockpit: create work, dispatch it, invoice it, and record payment from the core workflow loop.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/jobs/new">Create job</a>
            <a className="button" href="/customers">Add customer</a>
            <a className="button" href="/dispatch">Dispatch board</a>
            <a className="button" href="/field/today">Field mode</a>
          </div>
        </div>
        <div className="command-panel" aria-label="Next actions">
          <span className="table-label">Next actions</span>
          <a className="button full" href="/jobs/new">+ New customer/job</a>
          <a className="button full" href="/dispatch">Dispatch unscheduled work</a>
          <a className="button full" href="/field/today">Open technician agenda</a>
          <a className="button primary full" href="/invoices">Collect {formatMoney(outstanding)}</a>
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
            <Metric label="Today" value={String(todayAppointments.length)} />
            <Metric label="Unscheduled" value={String(unassigned.length)} />
            <Metric label="Active work" value={String(active.length)} />
            <Metric label="Pipeline margin" value={formatMoney(summary?.pipelineMarginCents ?? 0)} />
          </section>

          <section className="split-grid">
            <div className="section-card">
              <div className="section-header">
                <div>
                  <h2>Work needing attention</h2>
                  <p className="muted">Lead and active jobs are surfaced first.</p>
                </div>
                <a className="button compact" href="/dispatch">Dispatch</a>
              </div>
              <div className="card-list">
                {[...unassigned, ...active].slice(0, 8).map((job) => (
                  <a className="list-row with-rail" key={job.id} href={`/jobs/${job.id}`}>
                    <div>
                      <strong>{job.title}</strong>
                      <p className="muted">{formatMoney(job.total)} · customer {job.customerId.slice(0, 8)}</p>
                    </div>
                    <span className={`status-pill status-${job.status}`}>{job.status.replaceAll("_", " ")}</span>
                  </a>
                ))}
                {jobs.length === 0 && <div className="empty-state">No jobs yet. Create your first job to start the workflow.</div>}
              </div>
            </div>

            <div className="section-card">
              <div className="section-header">
                <div>
                  <h2>Money queue</h2>
                  <p className="muted">Invoices that still need sending, follow-up, or payment.</p>
                </div>
              </div>
              <div className="card-list">
                {openInvoices.slice(0, 5).map((invoice) => (
                  <a className="list-row" key={invoice.id} href={`/invoices/${invoice.id}`}>
                    <div>
                      <strong>{invoice.number}</strong>
                      <p className="muted">{formatMoney(invoice.total)}</p>
                    </div>
                    <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
                  </a>
                ))}
                {openInvoices.length === 0 && <div className="empty-state">No open invoices.</div>}
              </div>
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
