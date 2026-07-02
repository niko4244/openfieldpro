// Server-side renderer used by /api/templates/:id/preview and the worker's
// notifyTemplate(). ponytail: single-call functions, no caching. Ceiling:
// orgs sending thousands of emails/sec warrant a memoized render. For v1 the
// per-call cost is < 1ms; not worth optimizing.
//
// Phase 5b+ A/B: previewTemplate() accepts `opts.variants` so the picked
// variant subject overrides the template's base subject. The picker lives
// in @ofp/shared::pickVariant so the worker and API both call the same
// hash function. Empty variants / no override => falls back to base subject
// exactly like before the A/B follow-up landed.

import Mustache from "mustache";
import { formatMoney } from "@ofp/shared";
import {
  type TemplateContext,
  type TemplateDTO,
  type TemplateSubjectDTO,
  pickVariant,
  smsSegmentCount,
  SMS_HARD_LIMIT,
} from "@ofp/shared";

// Identity escape: we render author-controlled template bodies verbatim on
// email, so HTML escaping isn't the renderer's job. Templates are
// org-internal content; ponytail: no per-call sanitization. Ceiling: if
// untrusted content (customer-submitted review replies) ever flows into a
// template body, swap this for Mustache's default HTML-escape.
const IDENTITY_ESCAPE = (text: string): string => text;

// Mustache.render's third arg is `PartialsOrLookupFn`; the config bag lives
// in the fourth position. We pass `{}` as partials and the escape fn here.
function renderMustache(
  raw: string,
  ctx: TemplateContext,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Mustache.render(raw, ctx as unknown as Record<string, unknown>, {} as any, {
    escape: IDENTITY_ESCAPE,
  });
}

export function renderSubject(raw: string | null, ctx: TemplateContext): string {
  if (!raw) return "(no subject)";
  return renderMustache(raw, ctx);
}

export function renderEmailBody(rawHtml: string, ctx: TemplateContext): string {
  return renderMustache(rawHtml, ctx);
}

/**
 * Branded HTML shell applied to every rendered email so plain-paragraph
 * template bodies come out looking like a real business email instead of
 * unstyled text on a white page. Authors who paste a full HTML document
 * (contains `<html`) are left alone; bodies with no HTML tags at all get
 * their newlines converted to <br> first.
 */
export function wrapEmailHtml(bodyHtml: string, ctx: TemplateContext): string {
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml;
  const orgName = ctx.org?.name ?? "OpenFieldPro";
  const hasTags = /<[a-z][^>]*>/i.test(bodyHtml);
  const content = hasTags ? bodyHtml : bodyHtml.replace(/\r?\n/g, "<br>\n");
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#111827;color:#ffffff;border-radius:8px 8px 0 0;padding:18px 24px;font-size:17px;font-weight:bold;letter-spacing:0.2px;">
      ${orgName}
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;color:#111827;font-size:14px;line-height:1.6;">
      ${content}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">
      Sent by ${orgName} &middot; Powered by OpenFieldPro
    </p>
  </div>
</body>
</html>`;
}

export function renderSmsBody(
  rawText: string,
  ctx: TemplateContext,
): { text: string; chars: number; segments: number } {
  const text = renderMustache(rawText, ctx);
  return { text, chars: text.length, segments: smsSegmentCount(text.length) };
}

/**
 * Canonical sample data for /preview. Hard-coded on purpose — preview must
 * never hit the DB to avoid leaking real customer rows when an owner is
 * iterating on a template's wording.
 */
export const PREVIEW_SAMPLE: TemplateContext = {
  customer: { name: "Jane Smith", email: "jane@example.com", phone: "555-0101" },
  job: {
    id: "a1b2c3d4-1111-2222-3333-444455556666",
    title: "AC tune-up",
    status: "scheduled",
    scheduledAt: "2026-07-04 09:00",
    total: formatMoney(18900),
  },
  appointment: {
    id: "f1e2d3c4-5555-6666-7777-888899990000",
    startsAt: "2026-07-04 09:00",
    endsAt: "2026-07-04 11:00",
  },
  invoice: {
    id: "1a2b3c4d-9999-8888-7777-666655554444",
    number: "INV-1042",
    total: formatMoney(18900),
    dueAt: "2026-07-18",
  },
  org: { name: "Acme HVAC", timezone: "America/New_York" },
};

export interface PreviewResult {
  subject: string;
  body: string;
  channel: "email" | "sms";
  /** SMS only. */
  chars?: number;
  segments?: number;
  /** Phase 5b+ A/B: which variant label was used, or null for base subject. */
  variant?: string | null;
}

export interface PreviewOpts {
  /**
   * Pre-loaded variant rows for this template. Empty / undefined => falls
   * back to the template's base `subject` field, identical to Phase 5b.
   */
  variants?: ReadonlyArray<TemplateSubjectDTO>;
  /**
   * Deterministic seed for the picker. The editor passes "preview" so a
   * reload gives the same variant every time. The worker should pass a
   * recipient-stable string so the same email stays in the same variant
   * across re-sends.
   */
  recipientKey?: string;
  /**
   * Force a specific variant by label. Used by the editor's WYSIWYG
   * check ("show me how this variant renders"). 404 lives in the route.
   */
  variantLabel?: string | null;
}

/**
 * Render a template into a preview shape. Subject resolution order:
 *   1. `opts.variantLabel` if set (the editor's "force this variant" path).
 *   2. `pickVariant(variants, recipientKey)` if any variants exist.
 *   3. `template.subject` (the Phase 5b single-subject path, unchanged).
 */
export function previewTemplate(
  template: Pick<TemplateDTO, "subject" | "body" | "channel">,
  opts: PreviewOpts = {},
  ctx: TemplateContext = PREVIEW_SAMPLE,
): PreviewResult {
  let baseSubject: string;
  let pickedLabel: string | null = null;

  if (opts.variantLabel && opts.variants && opts.variants.length > 0) {
    const v = opts.variants.find((x) => x.label === opts.variantLabel);
    if (v) {
      baseSubject = renderSubject(v.subject, ctx);
      pickedLabel = v.label;
    } else {
      // route has already 404'd; defensive fallback to base subject.
      baseSubject = renderSubject(template.subject, ctx);
    }
  } else if (opts.variants && opts.variants.length > 0) {
    const picked = pickVariant(opts.variants, opts.recipientKey ?? "preview");
    if (picked) {
      baseSubject = renderSubject(picked.subject, ctx);
      pickedLabel = picked.label;
    } else {
      baseSubject = renderSubject(template.subject, ctx);
    }
  } else {
    baseSubject = renderSubject(template.subject, ctx);
  }

  if (template.channel === "sms") {
    const r = renderSmsBody(template.body, ctx);
    return {
      subject: baseSubject,
      body: r.text,
      channel: "sms",
      chars: r.chars,
      segments: r.segments,
      variant: pickedLabel,
    };
  }
  return {
    subject: baseSubject,
    body: wrapEmailHtml(renderEmailBody(template.body, ctx), ctx),
    channel: "email",
    variant: pickedLabel,
  };
}

/**
 * Throw if an SMS template body would be too expensive to send. Hard cap at 480
 * chars (3 segments) — beyond that the cost curve gets steep and most orgs
 * haven't explicitly opted in.
 */
export function assertSmsWithinLimit(rawText: string): void {
  if (rawText.length > SMS_HARD_LIMIT) {
    throw new Error(
      `SMS template body is ${rawText.length} characters; the hard cap is ${SMS_HARD_LIMIT} (3 segments).`,
    );
  }
}
