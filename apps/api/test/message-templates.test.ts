// Runnable check (no DB): node --import tsx --test test/message-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMessageTemplate } from "../src/message-templates.ts";

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
