import { api } from "../../lib/api";
import { AppointmentCreateForm } from "../../components/WorkflowForms";

export default async function SchedulePage() {
  let appts: Awaited<ReturnType<typeof api.appointments>> = [];
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let error: string | null = null;
  try {
    [appts, jobs] = await Promise.all([api.appointments(), api.jobs()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const jobTitle = (id: string) => jobs.find((job) => job.id === id)?.title ?? id.slice(0, 8);
  const scheduledIds = new Set(appts.map((appointment) => appointment.jobId));
  const unscheduledJobs = jobs.filter((job) => !scheduledIds.has(job.id) && job.status !== "completed" && job.status !== "canceled");

  const byDay = new Map<string, typeof appts>();
  for (const appointment of appts) {
    const day = new Date(appointment.startsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(appointment);
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>Dispatch today without hunting through the job list.</h1>
          <p className="muted">Schedule unscheduled work, scan the agenda, and keep field work moving from a mobile-friendly board.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Dispatch load</span>
          <strong>{appts.length} booked</strong>
          <p className="muted">{unscheduledJobs.length} jobs still need a time window.</p>
        </div>
      </section>

      <section className="split-grid">
        <div className="section-card">
          <div className="section-header">
            <div><h2>Dispatch timeline</h2><p className="muted">Readable on desktop and phone without losing the time window.</p></div>
          </div>
          {error ? (
            <p className="notice error">API unreachable ({error}).</p>
          ) : appts.length === 0 ? (
            <div className="empty-state">No appointments yet. Use the scheduler on the right to book one.</div>
          ) : (
            <div className="card-list">
              {[...byDay.entries()].map(([day, list]) => (
                <section key={day} className="section-card" style={{ boxShadow: "none" }}>
                  <div className="section-header"><h2>{day}</h2><span className="status-pill">{list.length} job{list.length === 1 ? "" : "s"}</span></div>
                  <div className="card-list">
                    {list.map((appointment) => (
                      <a className="list-row with-rail" key={appointment.id} href={`/jobs/${appointment.jobId}`}>
                        <div>
                          <strong>{jobTitle(appointment.jobId)}</strong>
                          <p className="muted">
                            {new Date(appointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(appointment.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <span className="status-pill">{appointment.technicianId ? "Assigned" : "Unassigned"}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="section-card">
          <div className="section-header"><div><h2>Schedule job</h2><p className="muted">Turn leads into booked appointments.</p></div></div>
          {error ? <p className="notice error">API unreachable ({error}).</p> : <AppointmentCreateForm jobs={unscheduledJobs} />}
        </aside>
      </section>
    </div>
  );
}
