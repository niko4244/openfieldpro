import { api } from "../../lib/api";

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

  const byDay = new Map<string, typeof appts>();
  for (const appointment of appts) {
    const day = new Date(appointment.startsAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(appointment);
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>A cleaner dispatch board for the day ahead.</h1>
          <p className="muted">Appointments are grouped by day with job context and assignment status ready for a future drag-drop board.</p>
        </div>
        <div className="hero-summary">
          <span className="table-label">Appointments</span>
          <strong>{appts.length}</strong>
          <p className="muted">Current visible calendar load.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Dispatch timeline</h2>
            <p className="muted">Readable on desktop and phone without losing the time window.</p>
          </div>
        </div>
        {error ? (
          <p className="notice error">API unreachable ({error}).</p>
        ) : appts.length === 0 ? (
          <div className="empty-state">
            No appointments yet. Create one with <code>POST /api/appointments</code>.
          </div>
        ) : (
          <div className="card-list">
            {[...byDay.entries()].map(([day, list]) => (
              <section key={day} className="section-card" style={{ boxShadow: "none" }}>
                <div className="section-header">
                  <h2>{day}</h2>
                  <span className="status-pill">{list.length} job{list.length === 1 ? "" : "s"}</span>
                </div>
                <div className="card-list">
                  {list.map((appointment) => (
                    <div className="list-row" key={appointment.id}>
                      <div>
                        <strong>{jobTitle(appointment.jobId)}</strong>
                        <p className="muted">
                          {new Date(appointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                          {new Date(appointment.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="status-pill">{appointment.technicianId ? "Assigned" : "Unassigned"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
