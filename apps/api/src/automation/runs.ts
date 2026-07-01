// Phase 5c: automation_runs read layer (audit log of every fire attempt).
// Read-only API: rows are written by lib/events.ts on evaluate, never
// updated by user code except via lib (status flips stay server-internal).
// ponytail: no DELETE; audit is append-only so an owner can prove "yes we
//   sent invoice X's receipt email today" weeks later.

import { and, eq, desc, inArray } from "drizzle-orm";
import { db, automationRuns, type AutomationRunStatus } from "@ofp/db";

export interface AutomationRunDTO {
  id: string;
  orgId: string;
  ruleId: string;
  eventId: string;
  eventKey: string;
  // 'pending' is the transient state between the audit row INSERT
  // (best-case optimistic, claimed to gate concurrent evaluators) and
  // the post-notify UPDATE in lib/events.ts::evaluateRulesForEvent.
  // Calls that filter on status='fired' see only completed fires.
  status: AutomationRunStatus;
  variantLabel: string | null;
  error: string | null;
  firedAt: string;
}

function toDto(row: typeof automationRuns.$inferSelect): AutomationRunDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    ruleId: row.ruleId,
    eventId: row.eventId,
    eventKey: row.eventKey,
    status: row.status,
    variantLabel: row.variantLabel,
    error: row.error,
    firedAt: row.firedAt.toISOString(),
  };
}

export async function listRuns(
  orgId: string,
  filters: { ruleId?: string; limit?: number } = {},
): Promise<AutomationRunDTO[]> {
  const conds = [eq(automationRuns.orgId, orgId)];
  if (filters.ruleId) conds.push(eq(automationRuns.ruleId, filters.ruleId));

  const rows = await db
    .select()
    .from(automationRuns)
    .where(and(...conds))
    .orderBy(desc(automationRuns.firedAt))
    .limit(filters.limit ?? 200);
  return rows.map(toDto);
}

export async function getRun(
  orgId: string,
  id: string,
): Promise<AutomationRunDTO | null> {
  const [row] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.orgId, orgId), eq(automationRuns.id, id)))
    .limit(1);
  return row ? toDto(row) : null;
}

/** Bulk fetch for an org's recent runs across many rules. Returns id-keyed
 *  map so call sites can resolve rule -> latest run in O(1). Used by
 *  the editor's "rules list" page. */
export async function recentRunsByRule(
  orgId: string,
  ruleIds: ReadonlyArray<string>,
): Promise<Record<string, AutomationRunDTO>> {
  if (ruleIds.length === 0) return {};
  const rows = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.orgId, orgId),
        inArray(automationRuns.ruleId, ruleIds as string[]),
      ),
    )
    .orderBy(desc(automationRuns.firedAt));
  // Keep only the most recent per rule.
  const map: Record<string, AutomationRunDTO> = {};
  for (const r of rows) {
    if (map[r.ruleId]) continue;
    map[r.ruleId] = toDto(r);
  }
  return map;
}
