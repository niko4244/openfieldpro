// Runnable check (no DB): node --import tsx --test test/message-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMessageTemplate } from "../src/message-templates.ts";
import {
  DEFAULT_BUSINESS_SETTINGS,
  MESSAGE_TEMPLATE_KINDS,
  extractTemplateVariables,
  messageTemplateSampleVariables,
  validateMessageTemplate,
  type MessageTemplateKind,
} from "@ofp/shared";

test("renders variables into the template", () => {
  assert.equal(
    renderMessageTemplate("Hi {{customerName}}, portal: {{portalLink}}", { customerName: "Jordan Lee", portalLink: "http://localhost:3000/p/abc" }),
    "Hi Jordan Lee, portal: http://localhost:3000/p/abc",
  );
});

test("unknown and null variables render empty", () => {
  assert.equal(renderMessageTemplate("[{{missing}}][{{portalExpiresAt}}]", { portalExpiresAt: null }), "[][]");
});

test("URLs in variables are not HTML-escaped", () => {
  assert.equal(
    renderMessageTemplate("{{portalLink}}", { portalLink: "http://localhost:3000/p/abc-123?x=1" }),
    "http://localhost:3000/p/abc-123?x=1",
  );
});

test("a section renders when the value is present and is hidden otherwise", () => {
  const template = "Hello{{#portalExpiresAt}}, expires {{portalExpiresAt}}{{/portalExpiresAt}}!";
  assert.equal(renderMessageTemplate(template, { portalExpiresAt: "Aug 10, 2026" }), "Hello, expires Aug 10, 2026!");
  assert.equal(renderMessageTemplate(template, { portalExpiresAt: null }), "Hello!");
  assert.equal(renderMessageTemplate(template, {}), "Hello!");
});

test("nested sections respect the enclosing block", () => {
  const template = "{{#outer}}A{{#inner}}B{{/inner}}C{{/outer}}";
  assert.equal(renderMessageTemplate(template, { outer: "x", inner: "y" }), "ABC");
  assert.equal(renderMessageTemplate(template, { outer: "x", inner: null }), "AC");
  assert.equal(renderMessageTemplate(template, { outer: null, inner: "y" }), "");
});

test("numbers render as strings", () => {
  assert.equal(renderMessageTemplate("{{count}} items", { count: 3 }), "3 items");
});

test("extractTemplateVariables lists unique names in first-use order, skipping closers", () => {
  assert.deepEqual(
    extractTemplateVariables("{{#expiresAt}}Hi {{customerName}}, {{expiresAt}}{{/expiresAt}} {{customerName}}"),
    ["expiresAt", "customerName"],
  );
});

test("validation flags unknown variables and missing required variables", () => {
  const typo = validateMessageTemplate("Hi {{costumerName}}, invoice {{invoiceNumber}}, pay {{invoiceTotal}}", "invoice");
  assert.deepEqual(typo.unknown, ["costumerName"]);
  assert.deepEqual(typo.missingRequired, []);

  const noNumber = validateMessageTemplate("Thanks!", "invoice");
  assert.deepEqual(noNumber.unknown, []);
  assert.deepEqual(noNumber.missingRequired, ["invoiceNumber"]);
});

test("the default templates are valid for their kinds", () => {
  // Required coverage is per kind: subject and body together must carry the
  // required variables, and neither may reference unknown ones.
  const fields: Record<MessageTemplateKind, Array<keyof typeof DEFAULT_BUSINESS_SETTINGS.messages>> = {
    invoice: ["invoiceEmailSubject", "invoiceEmailBody"],
    estimate: ["estimateEmailSubject", "estimateEmailBody"],
    portal_link: ["portalLinkSubject", "portalLinkBody"],
    review_request: ["reviewRequestBody"],
  };
  for (const kind of MESSAGE_TEMPLATE_KINDS) {
    const combined = fields[kind]
      .map((field) => DEFAULT_BUSINESS_SETTINGS.messages[field])
      .join("\n");
    const result = validateMessageTemplate(combined, kind);
    assert.deepEqual(result.unknown, [], `${kind} defaults should not reference unknown variables`);
    assert.deepEqual(result.missingRequired, [], `${kind} defaults should keep required variables`);
  }
});

test("sample variables satisfy validation for every kind", () => {
  for (const kind of MESSAGE_TEMPLATE_KINDS) {
    const sample = messageTemplateSampleVariables(kind, "Test Company");
    const subject = validateMessageTemplate(Object.keys(sample).map((name) => `{{${name}}}`).join(" "), kind);
    assert.deepEqual(subject.unknown, [], `${kind} sample variables must all be defined`);
    assert.deepEqual(subject.missingRequired, [], `${kind} sample variables must cover required ones`);
  }
});

test("portal link templates may use an optional expiry section", () => {
  const template = DEFAULT_BUSINESS_SETTINGS.messages.portalLinkBody;
  const validation = validateMessageTemplate(template, "portal_link");
  assert.deepEqual(validation.unknown, []);
  assert.ok(validation.missingRequired.length === 0);
  const withExpiry = renderMessageTemplate(template, messageTemplateSampleVariables("portal_link", "ACME"));
  assert.match(withExpiry, /This link expires Sep 10, 2026/);
});
