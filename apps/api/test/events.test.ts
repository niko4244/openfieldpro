// Phase 5c trigger engine: pure-Node tests for the deterministic helpers
// in apps/api/src/lib/events.ts. No DB needed for these — they're the
// contract every DB-touching layer rests on. Run with:
//   pnpm --filter @ofp/api test
//   # or: cd apps/api && node --import tsx --test test/events.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeForHash,
  eventIdFor,
  recipientKeyFor,
} from "../src/lib/events.js";

test("canonicalizeForHash sorts object keys recursively", () => {
  const a = canonicalizeForHash({ z: 1, a: { y: 1, x: 2 } });
  const b = canonicalizeForHash({ a: { x: 2, y: 1 }, z: 1 });
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("canonicalizeForHash leaves arrays in given order", () => {
  const a = canonicalizeForHash({ tags: ["z", "a", "m"] });
  assert.deepEqual(a, { tags: ["z", "a", "m"] });
});

test("canonicalizeForHash returns primitives unchanged", () => {
  assert.equal(canonicalizeForHash(42), 42);
  assert.equal(canonicalizeForHash("hello"), "hello");
  assert.equal(canonicalizeForHash(null), null);
  assert.equal(canonicalizeForHash(true), true);
});

test("eventIdFor is deterministic for the same envelope shape", () => {
  const env = {
    orgId: "org-1",
    key: "invoice.paid",
    occurredAt: "2026-06-30T12:00:00.000Z",
    payload: { id: "inv-1", total: 18900 },
  };
  assert.equal(eventIdFor(env), eventIdFor(env));
});

test("eventIdFor changes when any envelope field changes", () => {
  const base = {
    orgId: "org-1",
    key: "invoice.paid",
    occurredAt: "2026-06-30T12:00:00.000Z",
    payload: { id: "inv-1", total: 18900 },
  };
  const id = eventIdFor(base);
  assert.notEqual(id, eventIdFor({ ...base, orgId: "org-2" }));
  assert.notEqual(id, eventIdFor({ ...base, key: "invoice.created" }));
  assert.notEqual(
    id,
    eventIdFor({ ...base, occurredAt: "2026-06-30T12:00:01.000Z" }),
  );
  assert.notEqual(
    id,
    eventIdFor({ ...base, payload: { id: "inv-1", total: 18901 } }),
  );
});

test("eventIdFor ignores key insertion order in payload", () => {
  const env1 = {
    orgId: "org-1",
    key: "invoice.paid",
    occurredAt: "2026-06-30T12:00:00.000Z",
    payload: { a: 1, b: 2, c: 3 },
  };
  const env2 = {
    orgId: "org-1",
    key: "invoice.paid",
    occurredAt: "2026-06-30T12:00:00.000Z",
    payload: { c: 3, b: 2, a: 1 },
  };
  assert.equal(eventIdFor(env1), eventIdFor(env2));
});

test("eventIdFor produces 32-char hex strings", () => {
  const id = eventIdFor({
    orgId: "o",
    key: "k",
    occurredAt: "2026-06-30T00:00:00.000Z",
    payload: { x: 1 },
  });
  assert.equal(id.length, 32);
  assert.match(id, /^[0-9a-f]{32}$/);
});

test("recipientKeyFor picks email first for email channel", () => {
  const k = recipientKeyFor("email", {
    customer: { email: "JA@EXAMPLE.COM" },
    job: { id: "job-1" },
  });
  assert.equal(k, "email:ja@example.com");
});

test("recipientKeyFor falls back to job-prefixed key for email", () => {
  const k = recipientKeyFor("email", { job: { id: "job-1" } });
  assert.equal(k, "email-noid:job:job-1");
});

test("recipientKeyFor uses preview-email when no identifiers", () => {
  assert.equal(recipientKeyFor("email", {}), "preview-email");
  assert.equal(
    recipientKeyFor("email", { customer: { phone: "555" } }),
    "preview-email",
  );
});

test("recipientKeyFor picks phone first for sms channel", () => {
  assert.equal(
    recipientKeyFor("sms", {
      customer: { phone: "555-0101", email: "x@example.com" },
    }),
    "phone:555-0101",
  );
});

test("recipientKeyFor sms falls back to sms-noid:job:<id>", () => {
  assert.equal(
    recipientKeyFor("sms", { job: { id: "job-1" } }),
    "sms-noid:job:job-1",
  );
});

test("recipientKeyFor sms terminal uses preview-sms (no collision with email)", () => {
  assert.equal(recipientKeyFor("sms", {}), "preview-sms");
  assert.notEqual(
    recipientKeyFor("sms", {}),
    recipientKeyFor("email", {}),
  );
});
