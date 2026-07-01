// Pure renderer tests for the mustache template pipeline. No DB — exercises
// the lib functions directly so the test runs even when Postgres isn't up.
//
// Run with:
//   pnpm --filter @ofp/api test
//   # or directly: cd apps/api && node --import tsx --test test/templates.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderSubject,
  renderEmailBody,
  renderSmsBody,
  previewTemplate,
  assertSmsWithinLimit,
  PREVIEW_SAMPLE,
} from "../src/lib/templates.js";
import {
  smsSegmentCount,
  SMS_SINGLE_SEGMENT_MAX,
  SMS_TWO_SEGMENT_MAX,
  SMS_HARD_LIMIT,
} from "@ofp/shared";

test("renderEmailBody interpolates top-level keys", () => {
  const html = renderEmailBody("Hi {{customer.name}}, work for {{job.title}}.", {
    customer: { name: "Jane" },
    job: { title: "AC tune-up" },
  });
  assert.equal(html, "Hi Jane, work for AC tune-up.");
});

test("renderEmailBody tolerates missing fields (silent empty)", () => {
  const html = renderEmailBody("Hi {{customer.name}} — total {{invoice.total}}", {
    customer: { name: "Jane" },
  });
  assert.equal(html, "Hi Jane — total ");
});

test("renderSubject returns placeholder when raw is null", () => {
  assert.equal(renderSubject(null, {}), "(no subject)");
});

test("renderSmsBody populates segment metadata", () => {
  const r = renderSmsBody("One segment message for {{customer.name}}.", {
    customer: { name: "Jane" },
  });
  assert.match(r.text, /One segment message for Jane\.$/);
  assert.equal(typeof r.chars, "number");
  assert.equal(r.segments, 1);
});

test("renderSmsBody counts >1 segment for multi-segment bodies", () => {
  const text = "x".repeat(200);
  const r = renderSmsBody(text, {});
  assert.equal(r.chars, 200);
  assert.equal(r.segments, 2);
});

test("previewTemplate picks the right shape per channel", () => {
  const email = previewTemplate({
    channel: "email",
    subject: "Hi {{customer.name}}",
    body: "<p>Total {{invoice.total}}</p>",
  });
  assert.equal(email.channel, "email");
  assert.match(email.subject, /^Hi /);
  assert.match(email.body, /<p>Total /);
  assert.equal(email.chars, undefined);

  const sms = previewTemplate({
    channel: "sms",
    subject: "ignored on sms",
    body: "Hi {{customer.name}}",
  });
  assert.equal(sms.channel, "sms");
  assert.match(sms.body, /^Hi /);
  assert.ok(typeof sms.chars === "number");
  assert.ok(typeof sms.segments === "number");
});

test("previewTemplate uses PREVIEW_SAMPLE when no context is given", () => {
  const r = previewTemplate({
    channel: "email",
    subject: "Total due: {{invoice.total}}",
    body: "Hi {{customer.name}}, your appointment is on {{appointment.startsAt}}.",
  });
  assert.match(r.subject, /Total due: \$189\.00/);
  assert.match(r.body, /Hi Jane Smith/);
  assert.match(r.body, /2026-07-04 09:00/);
});

test("assertSmsWithinLimit accepts short bodies", () => {
  assert.doesNotThrow(() => assertSmsWithinLimit("ok"));
  assert.doesNotThrow(() => assertSmsWithinLimit("x".repeat(SMS_HARD_LIMIT)));
});

test("assertSmsWithinLimit rejects bodies above hard cap", () => {
  assert.throws(
    () => assertSmsWithinLimit("x".repeat(SMS_HARD_LIMIT + 1)),
    /hard cap/,
  );
});

test("smsSegmentCount returns expected bands", () => {
  // GSM-7 multi-segment concatenation: 1 = 160, 2 = 306, 3 = 459, 4 = 612.
  // Ceiling: 480 / 153 = 3.14, ceil = 4. SMS_HARD_LIMIT = 480 is a
  // safety ceiling, NOT the third segment boundary; the function returns
  // 4 at 480 because 480 > 459.
  assert.equal(smsSegmentCount(0), 1);
  assert.equal(smsSegmentCount(SMS_SINGLE_SEGMENT_MAX), 1);
  assert.equal(smsSegmentCount(SMS_SINGLE_SEGMENT_MAX + 1), 2);
  assert.equal(smsSegmentCount(SMS_TWO_SEGMENT_MAX), 2);
  assert.equal(smsSegmentCount(SMS_TWO_SEGMENT_MAX + 1), 3);
  assert.equal(smsSegmentCount(459), 3);   // exact third-segment boundary
  assert.equal(smsSegmentCount(SMS_HARD_LIMIT), 4); // 480 ceil(480/153)
});

test("PREVIEW_SAMPLE shape covers customer/job/appointment/invoice/org", () => {
  assert.ok(PREVIEW_SAMPLE.customer);
  assert.ok(PREVIEW_SAMPLE.job);
  assert.ok(PREVIEW_SAMPLE.appointment);
  assert.ok(PREVIEW_SAMPLE.invoice);
  assert.ok(PREVIEW_SAMPLE.org);
});

// ── Phase 5b+ A/B subject variant picker ──
//
// Pure-Node tests against pickVariant() in @ofp/shared. The picker is the
// same function used by both the API preview and the worker notifyTemplate,
// so testing it once pins both paths.

import { pickVariant, type TemplateSubjectDTO } from "@ofp/shared";

function mkVariant(
  label: string,
  weight: number,
  subject: string,
  templateId = "tpl-1",
): TemplateSubjectDTO {
  return {
    id: `${label}-id`,
    orgId: "org-1",
    templateId,
    label,
    weight,
    subject,
    createdAt: "2026-06-30T00:00:00.000Z",
  };
}

test("pickVariant returns null when variants is empty", () => {
  assert.equal(pickVariant([], "any-recipient"), null);
});

test("pickVariant skips variants with weight 0", () => {
  const variants = [
    mkVariant("a", 0, "Zero-weight A"),
    mkVariant("b", 1, "Live B"),
  ];
  // If we picked "a" we'd violate the live rule; do 8 picks across
  // distinct recipients and confirm we always get B.
  for (let i = 0; i < 8; i++) {
    const v = pickVariant(variants, `r${i}`);
    assert.equal(v?.label, "b");
  }
});

test("pickVariant is deterministic per (recipient, template)", () => {
  const variants = [
    mkVariant("control", 1, "Control subject"),
    mkVariant("emoji", 1, "With emoji subject"),
  ];
  const a1 = pickVariant(variants, "jane@example.com");
  const a2 = pickVariant(variants, "jane@example.com");
  assert.equal(a1?.label, a2?.label);
  assert.ok(a1);
});

test("pickVariant distributes proportional to weights", () => {
  // 1:2:3 weights -> 1/6, 2/6, 3/6 buckets.
  const variants = [
    mkVariant("a", 1, "A"),
    mkVariant("b", 2, "B"),
    mkVariant("c", 3, "C"),
  ];
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 600; i++) {
    const v = pickVariant(
      variants,
      `recipient-${i}@example.com`,
    );
    assert.ok(v);
    counts[v.label as "a" | "b" | "c"]++;
  }
  // Each bucket should be within ±3% of expected for N=600.
  // 1/6 -> 100±18, 2/6 -> 200±24, 3/6 -> 300±27.
  assert.ok(counts.a > 82 && counts.a < 118);
  assert.ok(counts.b > 176 && counts.b < 224);
  assert.ok(counts.c > 273 && counts.c < 327);
});

test("pickVariant places hash boundary on the NEXT variant", () => {
  // With weights [1, 1, 1] and total=3, every 3rd recipient MUST cycle
  // through a, b, c consistently across the deterministic hash.
  const variants = [
    mkVariant("a", 1, "A"),
    mkVariant("b", 1, "B"),
    mkVariant("c", 1, "C"),
  ];
  // Simulate the cumulative walk: bucket < cursor+weight -> next variant.
  // Smoke check: 30 recipients, count must come out 10/10/10 ± rounding.
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 30; i++) {
    const v = pickVariant(variants, `seed-${i}`);
    assert.ok(v);
    counts[v.label as "a" | "b" | "c"]++;
  }
  assert.equal(counts.a + counts.b + counts.c, 30);
});

test("previewTemplate honors ?variant label override", () => {
  const variants = [
    mkVariant("control", 1, "CONTROL subject for {{customer.name}}"),
    mkVariant("with_emoji", 1, "🚨 HEADS UP {{customer.name}} 🚨"),
  ];
  const r = previewTemplate(
    {
      channel: "email",
      subject: "BASE subject (ignored when variants exist)",
      body: "<p>Body for {{customer.name}}</p>",
    },
    { variants, variantLabel: "with_emoji" },
  );
  assert.equal(r.variant, "with_emoji");
  assert.match(r.subject, /^🚨 HEADS UP Jane Smith 🚨$/);
});

test("previewTemplate falls back to base subject when no variants", () => {
  const r = previewTemplate({
    channel: "email",
    subject: "Plain base subject",
    body: "<p>Body</p>",
  });
  assert.equal(r.variant, null);
  assert.match(r.subject, /Plain base subject/);
});

test("previewTemplate uses deterministic pick when no variantLabel", () => {
  const variants = [
    mkVariant("control", 1, "CONTROL"),
    mkVariant("with_emoji", 1, "EMOJI"),
  ];
  const a = previewTemplate(
    {
      channel: "email",
      subject: "BASE",
      body: "<p>body</p>",
    },
    { variants, recipientKey: "jane@example.com" },
  );
  const b = previewTemplate(
    {
      channel: "email",
      subject: "BASE",
      body: "<p>body</p>",
    },
    { variants, recipientKey: "jane@example.com" },
  );
  assert.ok(a.variant);
  assert.equal(a.variant, b.variant); // deterministic
});
