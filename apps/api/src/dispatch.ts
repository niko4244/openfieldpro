// Phase 7 dispatch / tech-location helpers — pure, DB-free so the runnable
// unit check exercises them without Postgres.

export type FreshnessTier = "live" | "recent" | "stale" | "dead";

// Tiers by age:
//   live    < 2m   fresher than Apple's "Just now"
//   recent  < 30m  fine for ETA estimates
//   stale   < 2h   dispatcher sees the dot grey; knows the tab is backgrounded
//   dead    >= 2h  treat as offline; show alert
//
// Clamp the FAR-future branch too: a phone with a wildly-skewed clock
// (more than 1 h ahead of the server) would otherwise render "live"
// indefinitely. Negative-age skew (a few seconds) is allowed so phones
// that aren't perfectly synced at the second mark don't go stale.
// ponytail: 2m live-window matches Housecall Pro's "live tracking" badge
//   convention. Ceiling: org admins may want this tunable; expose as
//   settings table later.
export function freshnessTier(
  capturedAt: Date,
  now: Date = new Date(),
): FreshnessTier {
  const ageMs = now.getTime() - capturedAt.getTime();
  // Far-future: 1h ahead or beyond is treated as "dead" — anything that
  // far in the future means the client's clock is too wildly skewed for
  // us to trust anything we'd compute from it. `<=` (not `<`) includes
  // the exact 1h boundary so `freshnessTier(now+1h, now) === "dead"`.
  if (ageMs <= -(60 * 60 * 1000)) return "dead";
  if (ageMs < 2 * 60 * 1000) return "live";
  if (ageMs < 30 * 60 * 1000) return "recent";
  if (ageMs < 2 * 60 * 60 * 1000) return "stale";
  return "dead";
}

export const MIN_LAT = -90;
export const MAX_LAT = 90;
export const MIN_LNG = -180;
export const MAX_LNG = 180;

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= MIN_LAT &&
    lat <= MAX_LAT &&
    lng >= MIN_LNG &&
    lng <= MAX_LNG
  );
}

export function isValidAccuracy(accuracyM: number | undefined | null): boolean {
  if (accuracyM === undefined || accuracyM === null) return true;
  return Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= 50_000;
}

// In-process ping throttle: a 5-second floor per userId. Single-instance Map;
// sufficient until we horizontally scale (then move to a Redis token bucket).
//
// Design: `reservePing` BOTH checks the floor AND atomically stamps the
// user's "last reserved at" timestamp synchronously before returning. The
// route then awaits the UPSERT while holding the slot; if the UPSERT
// throws, the route calls `releasePing` to roll back the stamp so the
// tech's next legitimate ping isn't blocked from clearing the slot.
//
// Why this beats the simpler "check then stamp after success" pattern:
//   - Node is single-threaded, so two concurrent pings can't both pass
//     `reservePing` — the second sees the stamp set by the first.
//   - A UPSERT failure (DB down, 23505 racer, etc.) no longer burns the
//     floor; we just delete the entry and let the next ping through.
//   - The slot is held for the full UPSERT duration, which is what makes
//     the throttle meaningful under burst load.
// ponytail: per-instance Map. Ceiling: across N API instances the cap becomes
//   `5000ms / N` effective; upgrade path is `apps/api/src/lib/throttle.ts` +
//   a shared Redis store.
const THROTTLE_FLOOR_MS = 5000;
const lastPingByUser = new Map<string, number>();

export function reservePing(
  userId: string,
  now: number = Date.now(),
): { accept: boolean; retryAfterMs: number } {
  const last = lastPingByUser.get(userId) ?? 0;
  const remaining = THROTTLE_FLOOR_MS - (now - last);
  if (remaining > 0) return { accept: false, retryAfterMs: remaining };
  // ATOMICALLY stamp now. The synchronous `Map.set` is the gate: the next
  // concurrent ping on the same userId (in the next microtask) sees this
  // stamp and returns reject.
  lastPingByUser.set(userId, now);
  return { accept: true, retryAfterMs: 0 };
}

export function releasePing(userId: string): void {
  lastPingByUser.delete(userId);
}

// Test-only — clear the in-process map so unit tests don't leak state
// between cases. Not exported from the route; called by dispatch.test.ts.
export function _resetThrottle(): void {
  lastPingByUser.clear();
}
