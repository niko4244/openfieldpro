// Phase 5c worker tick: catch-up for automation_events that the inline
// path couldn't process. The inline evaluation in lib/events.ts is the
// hot path (zero-latency); THIS tick is the safety net for entries that
// landed in `automation_events` with status='pending' and never got marked
// 'processed'.  Causes include: API process crash mid-emit, evaluate-time
// exceptions that didn't crash the request, or worker fallback when the
// api was unreachable to begin with.
//
// ponytail: polling at a 60s cadence is fine at v1 volume. Ceiling:
// dedicated BullMQ + Redis once we outgrow single-host reliability.

import { processPendingEvents } from "../../api/src/lib/events.ts";

/**
 * Read pending automation_events, evaluate any matching rules, mark
 * processed. Returns the per-tick tally for the worker log line.
 */
export async function processAutomationNow(
  now: Date = new Date(),
): Promise<{ processed: number; fired: number; failed: number; skipped: number }> {
  return processPendingEvents(now);
}
