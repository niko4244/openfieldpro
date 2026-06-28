import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";
import { JobActionPanel } from "../../../components/WorkflowForms";

export default async function FieldTodayPage() {
  let appointments: Awaited<ReturnType<typeof api.appointments>> = [];
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let error: string | null = null;

  try {
    [appointments, jobs, customers] = await Promise.all([api.appointments(), api.jobs(), api.customers()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const todayKey = new Date().toDateString();
  const todaysAppointments = appointments.filter((appointment) => new Date(appointment.startsAt).toDateString() === todayKey);
  const jobFor = (id: string) => jobs.find((job) => job.id === id);
  const customerFor = (id?: string) => customers.find((customer) => customer.id === id);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Field mode</p>
          <h1>Today’s work, built for the phone.</h1>
          <p className="muted">A simplified technician view with customer contact, schedule window, job notes, and closeout actions.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Today</span>
          <strong>{todaysAppointments.length} booked</strong>
          <p className="muted">Open a job for full line items, quote state, and billing workflow.</p>
        </div>
      </section>

      {error ? (
        <section className="section-card"><p className="notice error">API unreachable ({error}).</p></section>
      ) : (
        <section className="section-card">
          <div className="section-header"><div><h2>Technician agenda</h2><p className="muted">Fast actions for the current day.</p></div></div>
          <div className="card-list">
            {todaysAppointments.map((appointment) => {
              const job = jobFor(appointment.jobId);
              const customer = customerFor(job?.customerId);
              return (
                <div className="list-row with-rail" key={appointment.id}>
                  <div>
                    <span className="table-label">
                      {new Date(appointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(appointment.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <h2 style={{ margin: "6px 0" }}>{job?.title ?? appointment.jobId.slice(0, 8)}</h2>
                    <p className="muted">{customer?.name ?? "Unknown customer"} · {job ? formatMoney(job.total) : "—"}</p>
                    <p className="muted">{job?.description ?? "No field notes yet."}</p>
                    <div className="hero-actions">
                      {customer?.phone && <a className="button" href={`tel:${customer.phone}`}>Call</a>}
                      {customer?.email && <a className="button" href={`mailto:${customer.email}`}>Email</a>}
                      {job && <a className="button" href={`/jobs/${job.id}`}>Open job</a>}
                    </div>
                  </div>
                  {job && <JobActionPanel job={job} />}
                </div>
              );
            })}
            {todaysAppointments.length === 0 && <div className="empty-state">No appointments today. Dispatch scheduled work to see it here.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
