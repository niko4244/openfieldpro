// Phase 5c: HTTP surface for automation rules and runs. Org-scoped via
// resolveOrgId. Writes update the rules and runs the editor wires up;
// reads power the "Automation" tab in /settings. The /rules GET pairs
// each rule with its most recent run so the editor can render a
// status column ("fired 4m ago", "failed 2h ago", "never ran") without
// a second round-trip.
//
// ponytail: the same Zod enum for event_key lives alongside EventKey in
//   apps/api/src/lib/events.ts. The list is intentionally short — extend
//   both at once.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveOrgId } from "./org.js";
import { type AutomationRunStatus } from "@ofp/db";
import {
  createRule,
  deleteRule as deleteRuleData,
  getRule,
  listRules,
  updateRule as updateRuleData,
  type AutomationRuleDTO,
} from "../automation/rules.js";
import { listRuns, recentRunsByRule } from "../automation/runs.js";

// Keep this enum in lock-step with EventKey in apps/api/src/lib/events.ts.
// Adding a new domain event touches both surfaces.
const EVENT_KEYS = [
  "appointment.created",
  "appointment.scheduled",
  "invoice.created",
  "invoice.paid",
  "payment.received",
  "job.scheduled",
  "job.completed",
  "job.canceled",
  "review.request",
] as const;

const createBody = z.object({
  name: z.string().min(1).max(120),
  eventKey: z.enum(EVENT_KEYS),
  channel: z.enum(["email", "sms"]),
  templateId: z.string().uuid(),
  conditionFn: z.string().max(64).nullable().optional(),
  enabled: z.boolean().optional().default(true),
});
const patchBody = createBody.partial();

/** GET /api/automation/rules return shape: rule + optional latest run. */
type RuleWithLastRun = AutomationRuleDTO & {
  lastRun: {
    status: AutomationRunStatus;
    firedAt: string;
    variantLabel: string | null;
    error: string | null;
  } | null;
};

export async function automationRoutes(app: FastifyInstance) {
  // ── Rules ──
  app.get("/rules", async (req): Promise<RuleWithLastRun[]> => {
    const orgId = await resolveOrgId(req);
    const rules = await listRules(orgId);
    const latestRunMap = await recentRunsByRule(
      orgId,
      rules.map((r) => r.id),
    );
    return rules.map((r) => ({
      ...r,
      lastRun: latestRunMap[r.id]
        ? {
            status: latestRunMap[r.id].status,
            firedAt: latestRunMap[r.id].firedAt,
            variantLabel: latestRunMap[r.id].variantLabel,
            error: latestRunMap[r.id].error,
          }
        : null,
    }));
  });

  app.get<{ Params: { id: string } }>("/rules/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const r = await getRule(orgId, req.params.id);
    if (!r) return reply.code(404).send({ error: "not found" });
    return r;
  });

  app.post("/rules", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = await createRule(orgId, parsed.data);
      return reply.code(201).send(created);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("automation_rules_org_name_idx")) {
        return reply.code(409).send({
          error: `a rule named "${parsed.data.name}" already exists`,
        });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>("/rules/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const updated = await updateRuleData(orgId, req.params.id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/rules/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const ok = await deleteRuleData(orgId, req.params.id);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // ── Runs (read-only audit) ──
  app.get("/runs", async (req) => {
    const orgId = await resolveOrgId(req);
    const q = (req.query ?? {}) as { ruleId?: string; limit?: string };
    return listRuns(orgId, {
      ruleId: typeof q.ruleId === "string" ? q.ruleId : undefined,
      limit: q.limit ? Math.min(parseInt(q.limit, 10) || 200, 500) : 200,
    });
  });
}
