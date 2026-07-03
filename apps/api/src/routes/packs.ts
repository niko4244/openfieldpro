// Industry & AI workflow packs (docs/PRO_FEATURES.md). Installing a pack
// seeds its starter price-book line items and customer-comms templates into
// tables that already exist — no new tables, no marketplace server.
// ponytail: "installed" status is derived (do the pack's rows already exist?)
// rather than tracked in a separate `pack_installs` table — one fewer
// migration, and the install handler is naturally idempotent (only inserts
// what's missing, or relies on the (org_id, key, channel) unique index).
// Ceiling: if a user edits a seed row enough that the pre-check (existing
// names / unique-key conflict) no longer recognizes it as seeded,
// isInstalled() returns false forever and re-install can only insert items
// the user deleted outright — it can't restore mutations. Catalog items
// also have a hard category-name dependency on the pack name, which a future
// rename would break silently.
// Upgrade: add `pack_installs(org_id, pack_id, source_version, installed_at)`
// (and start writing `source_version` into seed rows) once partial-edit
// confusion becomes a real support burden.
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { db, catalogCategories, catalogItems, templates } from "@ofp/db";
import { WORKFLOW_PACKS, planAtLeast, featuresForPlan, type Plan } from "@ofp/shared";
import { resolveOrgId, requireRole } from "./org.js";
import { orgEffectivePlan } from "../lib/entitlement.js";

function packFlag(plan: string, kind: "industry" | "ai"): boolean {
  const f = featuresForPlan(plan);
  return kind === "industry" ? f.industryPacks : f.aiWorkflowPacks;
}

async function isInstalled(orgId: string, packId: string): Promise<boolean> {
  // A pack is "installed" once its namespaced templates exist for this org —
  // templates are the one artifact every pack (including the AI pack) seeds.
  const pack = WORKFLOW_PACKS.find((p) => p.id === packId);
  if (!pack || pack.templates.length === 0) return false;
  const keys = pack.templates.map((t) => t.key);
  const rows = await db
    .select({ key: templates.key })
    .from(templates)
    .where(and(eq(templates.orgId, orgId), inArray(templates.key, keys)));
  return rows.length >= pack.templates.length;
}

export async function packRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner"));

  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const plan = await orgEffectivePlan(orgId);
    const installed = await Promise.all(WORKFLOW_PACKS.map((p) => isInstalled(orgId, p.id)));
    return WORKFLOW_PACKS.map((p, i) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      description: p.description,
      tierRequired: p.tierRequired,
      checklists: p.checklists,
      itemCounts: { catalogItems: p.catalogItems.length, templates: p.templates.length },
      planSatisfied: planAtLeast(plan, p.tierRequired) && packFlag(plan, p.kind),
      installed: installed[i],
    }));
  });

  app.post("/:id/install", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const pack = WORKFLOW_PACKS.find((p) => p.id === id);
    if (!pack) return reply.code(404).send({ error: "pack not found" });

    const plan = await orgEffectivePlan(orgId);
    if (!planAtLeast(plan, pack.tierRequired) || !packFlag(plan, pack.kind)) {
      return reply.code(402).send({ error: `${pack.name} requires the ${pack.tierRequired} plan`, requiredPlan: pack.tierRequired as Plan });
    }

    // Catalog items: no natural unique key, so pre-check by name within a
    // pack-named category and only insert what's missing (idempotent).
    // Templates: the unique index on (org_id, key, channel) makes this a
    // one-shot idempotent insert. Both blocks run inside a single Drizzle
    // transaction so a failure between them rolls back the partial seed;
    // otherwise the org would end up with half-installed rows while
    // isInstalled() reports false forever (Ponytail "ceiling" above).
    const { installedItems, installedTemplates } = await db.transaction(async (tx) => {
      let installedItems: (typeof catalogItems.$inferSelect)[] = [];
      if (pack.catalogItems.length > 0) {
        let [category] = await tx
          .select()
          .from(catalogCategories)
          .where(and(eq(catalogCategories.orgId, orgId), eq(catalogCategories.name, pack.name)));
        if (!category) {
          [category] = await tx
            .insert(catalogCategories)
            .values({ orgId, name: pack.name, description: `Seeded by the ${pack.name} pack` })
            .returning();
        }
        const existing = await tx
          .select({ name: catalogItems.name })
          .from(catalogItems)
          .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.categoryId, category.id)));
        const have = new Set(existing.map((r) => r.name));
        const missing = pack.catalogItems.filter((i) => !have.has(i.name));
        if (missing.length > 0) {
          installedItems = await tx
            .insert(catalogItems)
            .values(missing.map((i) => ({ orgId, categoryId: category.id, ...i })))
            .returning();
        }
      }

      let installedTemplates: (typeof templates.$inferSelect)[] = [];
      if (pack.templates.length > 0) {
        installedTemplates = await tx
          .insert(templates)
          .values(pack.templates.map((t) => ({ orgId, ...t, enabled: true })))
          .onConflictDoNothing()
          .returning();
      }

      return { installedItems, installedTemplates };
    });

    return reply.code(201).send({
      pack: pack.id,
      installedCatalogItems: installedItems,
      installedTemplates,
      checklists: pack.checklists,
    });
  });
}
