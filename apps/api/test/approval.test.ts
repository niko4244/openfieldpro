// Runnable check (no DB): node --experimental-strip-types --test test/approval.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mintApprovalToken,
  buildApprovalLink,
  isValidSignatureDataUrl,
  normalizeSignerName,
} from "../src/approval.ts";

test("mintApprovalToken produces 64-char hex of shape sha256-ish", () => {
  const t = mintApprovalToken();
  assert.equal(t.length, 64);
  assert.match(t, /^[0-9a-f]+$/);
});

test("mintApprovalToken produces unique tokens across calls", () => {
  // 100 should be more than enough to catch a broken RNG.
  const tokens = new Set<string>();
  for (let i = 0; i < 100; i++) tokens.add(mintApprovalToken());
  assert.equal(tokens.size, 100);
});

test("buildApprovalLink joins base + token without double slash", () => {
  assert.equal(
    buildApprovalLink("https://example.com/", "abc123"),
    "https://example.com/approvals/abc123",
  );
  assert.equal(
    buildApprovalLink("https://example.com", "abc123"),
    "https://example.com/approvals/abc123",
  );
  // Trims multiple trailing slashes too.
  assert.equal(
    buildApprovalLink("https://example.com///", "abc123"),
    "https://example.com/approvals/abc123",
  );
});

test("isValidSignatureDataUrl accepts a valid PNG data URL", () => {
  assert.equal(isValidSignatureDataUrl("data:image/png;base64,iVBORw0KGgo="), true);
});

test("isValidSignatureDataUrl rejects non-data URLs", () => {
  assert.equal(isValidSignatureDataUrl("https://example.com/x.png"), false);
  // Wrong MIME even with the right prefix shape.
  assert.equal(isValidSignatureDataUrl("data:image/jpeg;base64,abc"), false);
});

test("isValidSignatureDataUrl rejects empty or overlong payloads", () => {
  assert.equal(isValidSignatureDataUrl(""), false);
  const huge = "data:image/png;base64," + "A".repeat(200_000);
  assert.equal(isValidSignatureDataUrl(huge), false);
});

test("isValidSignatureDataUrl rejects non-strings", () => {
  assert.equal(isValidSignatureDataUrl(null), false);
  assert.equal(isValidSignatureDataUrl(123), false);
  assert.equal(isValidSignatureDataUrl({}), false);
});

test("normalizeSignerName trims and length-caps on the high side", () => {
  assert.equal(normalizeSignerName(" Jane H. "), "Jane H.");
  assert.equal(normalizeSignerName(""), null);
  assert.equal(normalizeSignerName("   "), null);
  assert.equal(normalizeSignerName("a".repeat(200)), null);
  assert.equal(normalizeSignerName(42), null);
});
