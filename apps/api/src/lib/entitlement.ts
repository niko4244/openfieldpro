// Org → effective plan, re-verified from the stored license key on every
// call (see lib/license.ts resolvePlan). Kept separate from license.ts so
// the crypto stays pure/db-free and unit-testable.
import { eq } from "drizzle-orm";
import { db, orgs } from "@ofp/db";
import { resolvePlan } from "./license.js";
import type { Plan } from "@ofp/shared";

/** The org's current entitlement: expired/invalid/missing keys → 'free'. */
export async function orgEffectivePlan(orgId: string): Promise<Plan> {
  const [row] = await db
    .select({ plan: orgs.plan, licenseKey: orgs.licenseKey })
    .from(orgs)
    .where(eq(orgs.id, orgId));
  if (!row) return "free";
  if (row.licenseKey) return resolvePlan(row.licenseKey).plan;
  // No stored key: trust the plan column (pre-0018 redemptions, manual ops).
  return (row.plan as Plan) ?? "free";
}
