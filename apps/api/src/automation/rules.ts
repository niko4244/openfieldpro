// Phase 5c: automation_rules CRUD. Zod-validated input + Drizzle-backed
// queries, all org-scoped so a bad caller can't read another tenant's
// surfaces. Routes mount these in apps/api/src/routes/automation.ts.
//
// ponytail: rule lookup happens by event_key at fire time (see lib/events.ts),
//   not by name.  Naming is for humans; the (org_id, name) unique index is
//   so the editor can list/delete by handle without re-typing event keys.

import { and, eq, desc } from "drizzle-orm";
import { db, automationRules } from "@ofp/db";

// Channel narrowed to the literal union (matches the template_channel enum
// in packages/db/src/schema.ts). Kept inline so callers don't need to import
// the pgEnum value just for a type narrowing.
export type RuleChannel = "email" | "sms";
export interface AutomationRuleDTO {
  id: string;
  orgId: string;
  name: string;
  eventKey: string;
  channel: RuleChannel;
  templateId: string;
  conditionFn: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: typeof automationRules.$inferSelect): AutomationRuleDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    eventKey: row.eventKey,
    channel: row.channel as RuleChannel,
    templateId: row.templateId,
    conditionFn: row.conditionFn,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRules(orgId: string): Promise<AutomationRuleDTO[]> {
  const rows = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.orgId, orgId))
    .orderBy(desc(automationRules.createdAt));
  return rows.map(toDto);
}

export async function getRule(
  orgId: string,
  id: string,
): Promise<AutomationRuleDTO | null> {
  const [row] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.orgId, orgId), eq(automationRules.id, id)))
    .limit(1);
  return row ? toDto(row) : null;
}

export async function createRule(
  orgId: string,
  body: {
    name: string;
    eventKey: string;
    channel: RuleChannel;
    templateId: string;
    conditionFn?: string | null;
    enabled?: boolean;
  },
): Promise<AutomationRuleDTO> {
  const [row] = await db
    .insert(automationRules)
    .values({
      orgId,
      name: body.name,
      eventKey: body.eventKey,
      channel: body.channel,
      templateId: body.templateId,
      conditionFn: body.conditionFn ?? null,
      enabled: body.enabled ?? true,
    })
    .returning();
  return toDto(row);
}

/** Apply a patch; omits fields where undefined so the column stays untouched. */
export async function updateRule(
  orgId: string,
  id: string,
  body: Partial<{
    name: string;
    eventKey: string;
    channel: RuleChannel;
    templateId: string;
    conditionFn: string | null;
    enabled: boolean;
  }>,
): Promise<AutomationRuleDTO | null> {
  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.conditionFn === undefined) delete update.conditionFn;
  const [row] = await db
    .update(automationRules)
    .set(update)
    .where(and(eq(automationRules.orgId, orgId), eq(automationRules.id, id)))
    .returning();
  return row ? toDto(row) : null;
}

export async function deleteRule(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(automationRules)
    .where(and(eq(automationRules.orgId, orgId), eq(automationRules.id, id)))
    .returning({ id: automationRules.id });
  return deleted.length > 0;
}
