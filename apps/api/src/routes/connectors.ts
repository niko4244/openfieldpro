// Business-tier connector status (docs/PRO_FEATURES.md). Read-only catalog:
// no OAuth, no outbound calls. planSatisfied tells the UI whether to show an
// "unlock" prompt or the (currently: none) connect action.
import type { FastifyInstance } from "fastify";
import { CONNECTORS, planAtLeast } from "@ofp/shared";
import { resolveOrgId, requireRole } from "./org.js";
import { orgEffectivePlan } from "../lib/entitlement.js";

export async function connectorRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner"));

  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const plan = await orgEffectivePlan(orgId);
    return CONNECTORS.map((c) => ({ ...c, planSatisfied: planAtLeast(plan, c.tierRequired) }));
  });
}
