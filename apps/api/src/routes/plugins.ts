// Plugin management API (org-scoped, owner-facing). Powers the Integrations
// tab: browse the manifest catalog, install/uninstall, toggle, edit config,
// and inspect the outbound-event delivery journal.
//
// Installing a plugin mints two secrets:
//   • a per-install webhook signing secret (whsec_…), stored to sign deliveries;
//   • a scoped API token (ofp_…) the plugin uses for inbound calls — the
//     plaintext is returned exactly once here and only its hash is persisted.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, plugins, pluginInstalls, apiTokens, pluginEvents, orgs } from "@ofp/db";
import { planAtLeast, type Plan } from "@ofp/shared";
import { resolveOrgId, requireRole } from "./org.js";
import { generateToken, generateWebhookSecret } from "../plugins/crypto.js";

// Open-core seam: premium first-party plugins gate on the org's plan
// (docs/MONETIZATION.md). Everything not listed here is free. ponytail:
// slug map in code, not a manifest column — three entries don't earn a
// migration. Ceiling: many premium plugins. Upgrade: `required_plan`
// column on the plugins table.
const REQUIRED_PLAN: Record<string, Plan> = {
  quickbooks: "business",
  zapier: "business",
};

async function orgPlan(orgId: string): Promise<string> {
  const [row] = await db.select({ plan: orgs.plan }).from(orgs).where(eq(orgs.id, orgId));
  return row?.plan ?? "free";
}

const installBody = z.object({
  pluginId: z.string().uuid(),
  webhookUrl: z.string().url().optional(),
  config: z.record(z.unknown()).optional(),
});

const patchBody = z.object({
  enabled: z.boolean().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function pluginRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("owner"));
  // Catalog + this org's install status for each plugin.
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const [catalog, installs] = await Promise.all([
      db.select().from(plugins).orderBy(plugins.name),
      db.select().from(pluginInstalls).where(eq(pluginInstalls.orgId, orgId)),
    ]);
    const byPlugin = new Map(installs.map((i) => [i.pluginId, i]));
    const plan = await orgPlan(orgId);
    return catalog.map((p) => {
      const install = byPlugin.get(p.id);
      const requiredPlan = REQUIRED_PLAN[p.slug] ?? "free";
      return {
        ...p,
        installed: !!install,
        installId: install?.id ?? null,
        enabled: install?.enabled ?? false,
        requiredPlan,
        planSatisfied: planAtLeast(plan, requiredPlan),
      };
    });
  });

  // This org's installs (joined with manifest name/slug for display).
  app.get("/installs", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({
        id: pluginInstalls.id,
        pluginId: pluginInstalls.pluginId,
        slug: plugins.slug,
        name: plugins.name,
        enabled: pluginInstalls.enabled,
        config: pluginInstalls.config,
        webhookUrl: pluginInstalls.webhookUrl,
        installedAt: pluginInstalls.installedAt,
      })
      .from(pluginInstalls)
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(eq(pluginInstalls.orgId, orgId))
      .orderBy(desc(pluginInstalls.installedAt));
  });

  // Install a plugin for this org. Returns the install plus the one-time token.
  app.post("/installs", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = installBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [plugin] = await db.select().from(plugins).where(eq(plugins.id, parsed.data.pluginId));
    if (!plugin) return reply.code(404).send({ error: "plugin not found" });

    const requiredPlan = REQUIRED_PLAN[plugin.slug] ?? "free";
    if (!planAtLeast(await orgPlan(orgId), requiredPlan)) {
      return reply
        .code(402)
        .send({ error: `${plugin.name} requires the ${requiredPlan} plan`, requiredPlan });
    }

    const [existing] = await db
      .select({ id: pluginInstalls.id })
      .from(pluginInstalls)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.pluginId, plugin.id)));
    if (existing) return reply.code(409).send({ error: "already installed", installId: existing.id });

    const [install] = await db
      .insert(pluginInstalls)
      .values({
        orgId,
        pluginId: plugin.id,
        webhookUrl: parsed.data.webhookUrl,
        webhookSecret: generateWebhookSecret(),
        config: parsed.data.config ?? {},
      })
      .returning();

    const minted = generateToken();
    await db.insert(apiTokens).values({
      orgId,
      installId: install.id,
      name: `${plugin.slug} token`,
      tokenHash: minted.tokenHash,
      prefix: minted.prefix,
      scopes: plugin.scopes,
    });

    // `token` is shown once — the client must surface it to the user now.
    return reply.code(201).send({ install, token: minted.token, scopes: plugin.scopes });
  });

  app.patch("/installs/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    // Re-check the plan gate on enable: covers installs that predate the
    // gate and orgs whose annual key lapsed.
    if (parsed.data.enabled === true) {
      const [joined] = await db
        .select({ slug: plugins.slug, name: plugins.name })
        .from(pluginInstalls)
        .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
        .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.id, id)));
      if (!joined) return reply.code(404).send({ error: "not found" });
      const requiredPlan = REQUIRED_PLAN[joined.slug] ?? "free";
      if (!planAtLeast(await orgPlan(orgId), requiredPlan)) {
        return reply
          .code(402)
          .send({ error: `${joined.name} requires the ${requiredPlan} plan`, requiredPlan });
      }
    }
    const [row] = await db
      .update(pluginInstalls)
      .set(parsed.data)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // Uninstall — cascades the install's tokens and event journal (FK on delete).
  app.delete("/installs/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(pluginInstalls)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // Outbound delivery journal for this org (newest first). Optional ?installId.
  app.get("/events", async (req) => {
    const orgId = await resolveOrgId(req);
    const { installId } = req.query as { installId?: string };
    const conditions = [eq(pluginEvents.orgId, orgId)];
    if (installId) conditions.push(eq(pluginEvents.installId, installId));
    return db
      .select()
      .from(pluginEvents)
      .where(and(...conditions))
      .orderBy(desc(pluginEvents.createdAt))
      .limit(50);
  });
}
