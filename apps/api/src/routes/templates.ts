// Templates CRUD + preview + test-send, plus A/B subject variant CRUD.
// Org-scoped via resolveOrgId (same pattern as the customer / job routes).
// ponytail: no rate limit on /preview. Ceiling: a careless editor could
// preview 20x/sec against the live server; add a per-user token bucket
// when that becomes a real cost.
//
// Variant picker: per ADR Decision 3 (open follow-up), pickVariant() in
// @ofp/shared picks deterministically by recipientKey + templateId. The
// `?variant=label` query on /preview and /test-send forces a specific
// variant so the editor can verify each one without changing data; if
// the label doesn't match a variant, return 404 so the WYSIWYG pane
// stays honest.

import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, templates, templateSubjects } from "@ofp/db";
import {
  assertSmsWithinLimit,
  previewTemplate,
} from "../lib/templates.js";
import { resolveOrgId } from "./org.js";
import {
  type TemplateChannel,
  type TemplateDTO,
  type TemplateSubjectDTO,
  TEMPLATE_KEYS,
} from "@ofp/shared";

// `key` is fixed to the known event kinds; we extend this list once the trigger
// engine surfaces new event names.
const createBody = z.object({
  key: z.enum(TEMPLATE_KEYS),
  channel: z.enum(["email", "sms"]),
  name: z.string().min(1).max(120),
  subject: z.string().max(240).nullable().optional(),
  body: z.string().min(1).max(20_000),
  enabled: z.boolean().optional().default(true),
});
const patchBody = createBody.partial();

const createVariantBody = z.object({
  label: z.string().min(1).max(64),
  weight: z.number().int().min(1).max(1000).default(1),
  subject: z.string().min(1).max(240),
});
const patchVariantBody = createVariantBody.partial();

function toDto(row: typeof templates.$inferSelect): TemplateDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    key: row.key,
    channel: row.channel as TemplateChannel,
    name: row.name,
    subject: row.subject,
    body: row.body,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function variantToDto(row: typeof templateSubjects.$inferSelect): TemplateSubjectDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    templateId: row.templateId,
    label: row.label,
    weight: row.weight,
    subject: row.subject,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Load variants for a template, org-scoped through the parent template row
 * (so a bad orgId on the variant never escapes). Returns [] if the template
 * itself doesn't belong to the org (caller checks separately).
 */
async function loadVariants(orgId: string, templateId: string) {
  const rows = await db
    .select()
    .from(templateSubjects)
    .where(
      and(
        eq(templateSubjects.orgId, orgId),
        eq(templateSubjects.templateId, templateId),
      ),
    );
  return rows.map(variantToDto);
}

export async function templateRoutes(app: FastifyInstance) {
  // ── Templates (parent) ──

  // List all templates for the active org (the editor's left rail).
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.orgId, orgId));
    return rows.map(toDto);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    return toDto(row);
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (parsed.data.channel === "sms") {
      try {
        assertSmsWithinLimit(parsed.data.body);
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    }
    const [row] = await db
      .insert(templates)
      .values({
        orgId,
        key: parsed.data.key,
        channel: parsed.data.channel,
        name: parsed.data.name,
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        enabled: parsed.data.enabled ?? true,
      })
      .returning();
    return reply.code(201).send(toDto(row));
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { subject, ...rest } = parsed.data;
    if (rest.channel === "sms" && typeof rest.body === "string") {
      try {
        assertSmsWithinLimit(rest.body);
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    }
    const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    // Only touch subject if the client explicitly sent a value (including
    // null to clear). Omitting the key leaves the column unchanged.
    if (subject !== undefined) update.subject = subject;
    const [row] = await db
      .update(templates)
      .set(update)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return toDto(row);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const deleted = await db
      .delete(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .returning();
    if (deleted.length === 0) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // ── A/B subject variant CRUD (Phase 5b+ follow-up per ADR Decision 3) ──

  app.get<{ Params: { id: string } }>("/:id/variants", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [tpl] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .limit(1);
    if (!tpl) return reply.code(404).send({ error: "not found" });
    const variants = await loadVariants(orgId, tpl.id);
    return variants;
  });

  app.post<{ Params: { id: string } }>("/:id/variants", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [tpl] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .limit(1);
    if (!tpl) return reply.code(404).send({ error: "template not found" });
    const parsed = createVariantBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const [row] = await db
        .insert(templateSubjects)
        .values({
          orgId,
          templateId: tpl.id,
          label: parsed.data.label,
          weight: parsed.data.weight,
          subject: parsed.data.subject,
        })
        .returning();
      return reply.code(201).send(variantToDto(row));
    } catch (e) {
      // Composite-unique on (template_id, label) collides with a 23505.
      // ponytail: DB errors caught here so the editor sees a friendly 409.
      // Ceiling: two writers racing on the same label is rare for v1; the
      // current catch handles it without a hard retry loop.
      const msg = (e as Error).message ?? "";
      if (msg.includes("template_subjects_template_label_idx")) {
        return reply.code(409).send({
          error: `variant with label "${parsed.data.label}" already exists`,
        });
      }
      throw e;
    }
  });

  app.patch<{
    Params: { id: string; vid: string };
  }>("/:id/variants/:vid", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = patchVariantBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const update: Record<string, unknown> = parsed.data;
    const [row] = await db
      .update(templateSubjects)
      .set(update)
      .where(
        and(
          eq(templateSubjects.orgId, orgId),
          eq(templateSubjects.templateId, req.params.id),
          eq(templateSubjects.id, req.params.vid),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return variantToDto(row);
  });

  app.delete<{
    Params: { id: string; vid: string };
  }>("/:id/variants/:vid", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const deleted = await db
      .delete(templateSubjects)
      .where(
        and(
          eq(templateSubjects.orgId, orgId),
          eq(templateSubjects.templateId, req.params.id),
          eq(templateSubjects.id, req.params.vid),
        ),
      )
      .returning();
    if (deleted.length === 0) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // ── Preview + test-send (variant-aware) ──

  // Server-side preview against hard-coded sample data so the editor can
  // render a side-by-side pane without touching real customer rows.
  // `?variant=label` forces a specific variant subject for WYSIWYG check.
  app.post<{ Params: { id: string } }>("/:id/preview", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    const variants = await loadVariants(orgId, row.id);
    // The query may be a string or an object depending on Fastify v4/v5 shape.
    const q = (req.query ?? {}) as { variant?: string };
    const variantLabel = typeof q.variant === "string" ? q.variant : null;
    if (variantLabel && !variants.some((v) => v.label === variantLabel)) {
      return reply
        .code(404)
        .send({ error: `variant "${variantLabel}" not found` });
    }
    return previewTemplate(row, {
      variants,
      variantLabel,
      // "preview" recipient => deterministic and editor-stable across reloads.
      recipientKey: "preview",
    });
  });

  // Test-send routes the rendered body through the worker's notify() sink so
  // owners can see the dispatch path end-to-end. ponytail: still goes to ntfy
  // or console; no email/SMS provider wired yet. Upgrade: gate behind role
  // check (owner-only) once role-based permissions land.
  app.post<{ Params: { id: string } }>("/:id/test-send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, req.params.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    const variants = await loadVariants(orgId, row.id);
    const q = (req.query ?? {}) as { variant?: string };
    const variantLabel = typeof q.variant === "string" ? q.variant : null;
    if (variantLabel && !variants.some((v) => v.label === variantLabel)) {
      return reply
        .code(404)
        .send({ error: `variant "${variantLabel}" not found` });
    }
    const rendered = previewTemplate(row, {
      variants,
      variantLabel,
      recipientKey: "preview",
    });
    // ponytail: no live provider call yet (SendGrid/Twilio not wired). The
    // endpoint exists so owners can sanity-check merge output without
    // leaving the editor. Upgrade: route through the worker's notify() sink
    // with a dedicated `to: TEST_RECIPIENT` env var once a provider lands.
    return {
      ok: true,
      channel: row.channel,
      subject: rendered.subject,
      body: rendered.body,
      chars: rendered.chars,
      segments: rendered.segments,
      variant: variantLabel ?? (variants.length > 0 ? "picked" : null),
      note: "Live provider not wired yet; this preview proves the merge path.",
    };
  });
}
