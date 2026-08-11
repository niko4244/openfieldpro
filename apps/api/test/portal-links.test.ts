// Runnable check (no DB): node --experimental-strip-types --test test/portal-links.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PORTAL_LINK_TTL_DAYS,
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  hashPortalToken,
  parsePortalLinkScopes,
  portalLinkEncryptionKey,
  portalLinkExpiry,
  portalLinkStatus,
  PORTAL_TOKEN_PREFIX,
} from "../src/portal-links.ts";

test("generated tokens are prefixed, unique, and only stored hashed", () => {
  const first = generatePortalToken();
  const second = generatePortalToken();
  assert.ok(first.token.startsWith(PORTAL_TOKEN_PREFIX));
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashPortalToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.tokenPrefix, first.token.slice(0, PORTAL_TOKEN_PREFIX.length + 10));
  assert.notEqual(hashPortalToken(first.token), hashPortalToken(second.token));
});

test("the same token always hashes the same way", () => {
  const token = "pl_sample-secret-token-value";
  assert.equal(hashPortalToken(token), hashPortalToken(token));
});

test("portalLinkStatus reports active when not revoked and not expired", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  const link = { revokedAt: null, expiresAt: new Date(now + 86_400_000) };
  assert.equal(portalLinkStatus(link, now), "active");
});

test("portalLinkStatus reports expired once the expiry passes", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  const link = { revokedAt: null, expiresAt: new Date(now) };
  assert.equal(portalLinkStatus(link, now), "expired");
  assert.equal(portalLinkStatus({ revokedAt: null, expiresAt: new Date(now - 1) }, now), "expired");
});

test("portalLinkStatus reports revoked even when the expiry is still in the future", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  const link = { revokedAt: new Date(now), expiresAt: new Date(now + 30 * 86_400_000) };
  assert.equal(portalLinkStatus(link, now), "revoked");
});

test("parsePortalLinkScopes keeps only known scopes and deduplicates", () => {
  assert.deepEqual(parsePortalLinkScopes(["balance", "checkout", "balance", "service_plans"]), ["balance", "checkout", "service_plans"]);
  assert.deepEqual(parsePortalLinkScopes(["balance", "admin", 42, null]), ["balance"]);
  assert.deepEqual(parsePortalLinkScopes("balance"), []);
  assert.deepEqual(parsePortalLinkScopes(undefined), []);
});

test("encrypted portal tokens round-trip and are recoverable for emailing", () => {
  const key = portalLinkEncryptionKey("test-server-secret");
  const { token } = generatePortalToken();
  const cipher = encryptPortalToken(token, key);
  assert.equal(decryptPortalToken(cipher, key), token);
});

test("encrypted tokens cannot be decrypted with a different key or tampered ciphertext", () => {
  const keyA = portalLinkEncryptionKey("secret-a");
  const keyB = portalLinkEncryptionKey("secret-b");
  const { token } = generatePortalToken();
  const cipher = encryptPortalToken(token, keyA);
  assert.equal(decryptPortalToken(cipher, keyB), null);
  const [version, iv, tag, body] = cipher.split(".");
  assert.equal(decryptPortalToken(`${version}.${iv}.${tag}.${body.slice(0, -2)}x`, keyA), null);
  assert.equal(decryptPortalToken("garbage", keyA), null);
  assert.equal(decryptPortalToken("v2.abc.def.ghi", keyA), null);
});

test("portalLinkExpiry rejects invalid input and explicit null means no expiry", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  assert.equal(portalLinkExpiry(7, now)?.getTime(), now + 7 * 86_400_000);
  assert.equal(portalLinkExpiry(undefined, now), null);
  assert.equal(portalLinkExpiry(null, now), null);
  assert.equal(portalLinkExpiry(0, now), null);
  assert.equal(portalLinkExpiry(-5, now), null);
});

test("the 30-day default matches the constant callers apply", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  assert.equal(now + DEFAULT_PORTAL_LINK_TTL_DAYS * 86_400_000, portalLinkExpiry(DEFAULT_PORTAL_LINK_TTL_DAYS, now)?.getTime());
});
