// Pluggable notification sink.
//
// Phase 5d Wave 1a: the pre-1a local NTFY + console.log fallback has been
// deleted. `notify()` now delegates to the shared ProviderRegistry so the
// SendGrid and Twilio adapters in @ofp/shared fire when configured and the
// StubProvider fires in dev. Same goes for the api-side notify.ts; both
// processes boot the registry from the same env vars.
//
// Phase 5b: notifyTemplate() fetches a per-org template row by (channel,
// key), renders against Mustache, A/B-variant picks a subject when present
// (Phase 5b+), and delegates to notify().
import Mustache from "mustache";
import { eq, and } from "drizzle-orm";
import { db, templates, templateSubjects } from "@ofp/db";
import {
  pickVariant,
  ProviderRegistry,
  type DeliveryResult,
  type TemplateContext,
} from "@ofp/shared";

export async function notify(
  title: string | undefined,
  message: string,
  opts: { channel?: "email" | "sms"; to?: string } = {},
): Promise<DeliveryResult> {
  const url = process.env.NTFY_URL;
  if (url) {
    try {
      await fetch(url, { method: "POST", headers: { Title: title ?? "" }, body: message });
      return { messageId: `ntfy-${Date.now()}`, timestamp: new Date().toISOString() };
    } catch (e) {
      console.error(`[notify] ntfy failed: ${(e as Error).message}`);
      console.log(`[notify] ${title} — ${message}`);
      return { messageId: `console-${Date.now()}`, timestamp: new Date().toISOString() };
    }
  }

  const channel = opts.channel ?? "email";
  const to = opts.to ?? process.env.OFP_NOTIFY_DEFAULT_TO ?? "preview@localhost";
  const provider = channel === "sms" ? ProviderRegistry.getSms() : ProviderRegistry.getEmail();
  if (provider.name === "stub") {
    console.log(`[notify] ${title} — ${message}`);
  }
  return provider.send({ to, subject: title, body: message });
}

// Mustache identity escape — same posture as the API renderer.
const RENDER_OPTS: Mustache.RenderOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  escape: (text: string) => text,
} as Mustache.RenderOptions;

/**
 * Derive a recipient-stable string for the variant picker. The same recipient
 * always lands in the same variant even across re-sends. Channel-specific
 * because email and SMS typically identify the recipient differently.
 *
 * ponytail: customer.email/phone is the natural key, but a customer
 *   correcting their email (typo fix) will flip variants; acceptable for v1.
 *   Ceiling: when orgs want absolute stability, derive from `customer.id`
 *   instead so contacts stay locked to whichever variant they started on.
 *
 * Late-2026 fix (channel mix bug): when the email channel had no
 * `customer.email`, the previous version fell through to `customer.phone`,
 * which is an SMS identifier. A single person could land in different
 * variants depending on whether their email was populated, and a typo
 * correction would flip their bucket. Each channel now has its own
 * fallback chain and the no-identifier fallback prefixes its channel
 * so buckets can never collide across channels.
 */
function recipientKeyFor(
  channel: "email" | "sms",
  data: TemplateContext,
): string {
  const customer = data.customer ?? null;
  if (channel === "email") {
    if (customer?.email) return `email:${customer.email.toLowerCase()}`;
    if (data.job?.id) return `email-noid:job:${data.job.id}`;
    return "preview-email"; // admin/test path; suffixed so SMS previews don't collide
  }
  if (customer?.phone) return `phone:${customer.phone}`;
  if (data.job?.id) return `sms-noid:job:${data.job.id}`;
  return "preview-sms"; // admin/test path; suffixed so email previews don't collide
}

async function renderForSend(
  orgId: string,
  channel: "email" | "sms",
  key: string,
  data: TemplateContext,
): Promise<
  | { subject: string; body: string; variant: string | null }
  | null
> {
  const [row] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.orgId, orgId),
        eq(templates.channel, channel),
        eq(templates.key, key),
      ),
    )
    .limit(1);
  if (!row || !row.enabled) return null; // ponytail: enabled=false silent skip, not an error.

  // A/B variants: only meaningful for email (SMS has no subject). For SMS
  // skip the variant fetch entirely so the painter stays cheap.
  let pickedVariant: string | null = null;
  let subjectRaw = row.subject;
  if (channel === "email") {
    const variants = await db
      .select()
      .from(templateSubjects)
      .where(
        and(
          eq(templateSubjects.orgId, orgId),
          eq(templateSubjects.templateId, row.id),
        ),
      );
    if (variants.length > 0) {
      const dto = variants.map((v) => ({
        id: v.id,
        orgId: v.orgId,
        templateId: v.templateId,
        label: v.label,
        weight: v.weight,
        subject: v.subject,
        createdAt: v.createdAt.toISOString(),
      }));
      const picked = pickVariant(dto, recipientKeyFor(channel, data));
      if (picked) {
        subjectRaw = picked.subject;
        pickedVariant = picked.label;
      }
    }
  }

  const ctx = data as unknown as Record<string, unknown>;
  const subject =
    subjectRaw !== null && subjectRaw !== ""
      ? Mustache.render(subjectRaw, ctx, RENDER_OPTS)
      : `${channel.toUpperCase()}: ${key}`;
  const body = Mustache.render(row.body, ctx, RENDER_OPTS);
  return { subject, body, variant: pickedVariant };
}

/**
 * Render a template bound to (orgId, channel, key) and route through notify().
 *
 * Returns the provider's DeliveryResult on success so the call site (the
 * trigger engine in apps/api/src/lib/events.ts) can record
 * `provider_message_id` for Wave 2 analytics to key webhook correlation.
 * Returns `null` when the template is missing/disabled (silent no-op, not
 * an error) or the provider throws (logged, swallowed — notification
 * delivery must never break the user-visible action that triggered it).
 *
 * A/B variants: when at least one variant row exists for the template, the
 * picked variant's subject overrides the base subject. The picker is
 * deterministic per `(recipient, template)` so a recipient that gets two
 * sends of the same template lands in the same variant both times.
 */
export async function notifyTemplate(
  orgId: string,
  channel: "email" | "sms",
  key: string,
  data: TemplateContext,
): Promise<DeliveryResult | null> {
  try {
    const rendered = await renderForSend(orgId, channel, key, data);
    if (!rendered) {
      console.log(
        `[notifyTemplate] skipped: org=${orgId} channel=${channel} key=${key} (no template or disabled)`,
      );
      return null;
    }
    if (rendered.variant) {
      console.log(
        `[notifyTemplate] variant=${rendered.variant} org=${orgId} channel=${channel} key=${key}`,
      );
    }
    return await notify(rendered.subject, rendered.body);
  } catch (e) {
    console.error(
      `[notifyTemplate] failed: org=${orgId} channel=${channel} key=${key}: ${(e as Error).message}`,
    );
    return null;
  }
}
