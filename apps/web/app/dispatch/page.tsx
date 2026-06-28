import { api, type DispatchCardDTO } from "../../lib/api";
import { formatMoney } from "@ofp/shared";
import { DispatchAssignForm, DispatchStatusButtons } from "../../components/DispatchActions";

function todayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString(), date: start.toISOString().slice(0, 10) };
}

function Card({ card, technicians }: { card: DispatchCardDTO; technicians: Awaited<ReturnType<typeof api.dispatchBoard>>["technicians"] }) {
  return (
    <article className="list-row" style={{ alignItems: "stretch", flexDirection: "column" }}>
      <div className="section-header">
        <div>
          <strong>{card.title}</strong>
          <p className="muted">{card.customer?.name ?? "Customer"} · {formatMoney(card.total)}</p>
          <p className="muted">{card.property?.address ?? "No service address"}</p>
          <p className="muted">{card.appointment ? `${new Date(card.appointment.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(card.appointment.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "No appointment"} · {card.technician?.name ?? "Unassigned"}</p>
        </div>
        <span className={`status-pill status-${card.status}`}>{card.status.replaceAll("_", " ")}</span>
      </div>
      <DispatchStatusButtons jobId={card.id} status={card.status} />
      <DispatchAssignForm jobId={card.id} technicians={technicians} />
      <a className="button compact" href={`/jobs/${card.id}`}>Open job</a>
    </article>
  );
}

function Column({ title, cards, technicians }: { title: string; cards: DispatchCardDTO[]; technicians: Awaited<ReturnType<typeof api.dispatchBoard>>["technicians"] }) {
  return (
    <section className="section-card">
      <div className="section-header"><div><h2>{title}</h2><p className="muted">{cards.length} job{cards.length === 1 ? "" : "s"}</p></div></div>
      <div className="card-list">
        {cards.map((card) => <Card key={card.id} card={card} technicians={technicians} />)}
        {cards.length === 0 && <div className="empty-state">No jobs in this lane.</div>}
      </div>
    </section>
  );
}

export default async function DispatchPage() {
  const window = todayWindow();
  let board: Awaited<ReturnType<typeof api.dispatchBoard>> | null = null;
  let routePlan: Awaited<ReturnType<typeof api.routePlan>> | null = null;
  let error: string | null = null;

  try {
    [board, routePlan] = await Promise.all([
      api.dispatchBoard(window.start, window.end),
      api.routePlan(window.date).catch(() => null),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Dispatch board</p>
          <h1>Assign, sequence, and move field work.</h1>
          <p className="muted">HCP-style dispatch control: lanes for unscheduled, scheduled, in-progress, and completed work, plus route-planning visibility for today.</p>
          <div className="hero-actions"><a className="button" href="/schedule">Calendar</a><a className="button" href="/field/today">Field mode</a></div>
        </div>
        <div className="command-panel">
          <span className="table-label">Known route miles</span>
          <strong>{routePlan ? `${routePlan.totalKnownMiles} mi` : "—"}</strong>
          <p className="muted">{routePlan ? `${routePlan.stops.length} stops · ${routePlan.missingCoordinateStops} missing coordinates` : "Route plan unavailable"}</p>
        </div>
      </section>

      {error || !board ? (
        <section className="section-card"><p className="notice error">Unable to load dispatch board ({error ?? "not found"}).</p></section>
      ) : (
        <>
          <section className="metric-grid" aria-label="Dispatch metrics">
            <div className="metric-card"><span>Unscheduled</span><strong>{board.columns.unscheduled.length}</strong></div>
            <div className="metric-card"><span>Scheduled</span><strong>{board.columns.scheduled.length}</strong></div>
            <div className="metric-card"><span>In progress</span><strong>{board.columns.inProgress.length}</strong></div>
            <div className="metric-card"><span>Completed</span><strong>{board.columns.completed.length}</strong></div>
          </section>

          <section className="split-grid">
            <Column title="Unscheduled" cards={board.columns.unscheduled} technicians={board.technicians} />
            <Column title="Scheduled" cards={board.columns.scheduled} technicians={board.technicians} />
          </section>
          <section className="split-grid">
            <Column title="In progress" cards={board.columns.inProgress} technicians={board.technicians} />
            <Column title="Completed" cards={board.columns.completed} technicians={board.technicians} />
          </section>

          <section className="section-card">
            <div className="section-header"><div><h2>Today’s route plan</h2><p className="muted">Drive-distance estimates use stored property latitude/longitude when available; map links use service addresses.</p></div></div>
            <div className="card-list">
              {routePlan?.stops.map((stop) => (
                <div className="list-row" key={stop.appointmentId}>
                  <div>
                    <strong>{stop.sequence}. {stop.title}</strong>
                    <p className="muted">{stop.address ?? "No address"} · {stop.driveMilesFromPrevious === null ? "mileage unknown" : `${stop.driveMilesFromPrevious} mi from previous`}</p>
                  </div>
                  {stop.mapUrl ? <a className="button compact" href={stop.mapUrl}>Map</a> : <span className="muted">No map</span>}
                </div>
              ))}
              {(!routePlan || routePlan.stops.length === 0) && <div className="empty-state">No route stops for today.</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
