// Runnable check for offline license-key verification.
// Run: npx tsx --test test/license.test.ts   (from apps/api)
import test from "node:test";
import assert from "node:assert";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { verifyLicenseKey, resolvePlan } from "../src/lib/license.ts";

// Ephemeral keypair; env override keeps the test independent of the
// maintainer's real key.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
process.env.OFP_LICENSE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();

function makeKey(payload: object): string {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = edSign(null, bytes, privateKey);
  return `OFP1.${bytes.toString("base64url")}.${sig.toString("base64url")}`;
}

const good = { product: "openfieldpro", plan: "pro", iat: new Date().toISOString() };

test("valid key verifies and returns the plan", () => {
  assert.equal(verifyLicenseKey(makeKey(good)).plan, "pro");
});

test("business tier key verifies", () => {
  assert.equal(verifyLicenseKey(makeKey({ ...good, plan: "business" })).plan, "business");
});

test("unknown plan is rejected", () => {
  assert.throws(() => verifyLicenseKey(makeKey({ ...good, plan: "enterprise" })), /unknown plan/);
});

test("tampered payload is rejected", () => {
  const key = makeKey(good);
  const [p, payload, sig] = key.split(".");
  const forged = Buffer.from(JSON.stringify({ ...good, plan: "pro", note: "forged" }), "utf8");
  assert.throws(() => verifyLicenseKey(`${p}.${forged.toString("base64url")}.${sig}`), /invalid signature/);
  void payload;
});

test("expired key is rejected", () => {
  assert.throws(() => verifyLicenseKey(makeKey({ ...good, exp: "2020-01-01" })), /expired/);
});

test("wrong product is rejected", () => {
  assert.throws(() => verifyLicenseKey(makeKey({ ...good, product: "other" })), /wrong product/);
});

test("garbage is rejected", () => {
  assert.throws(() => verifyLicenseKey("OFP1.not.real"), /invalid signature|malformed/);
  assert.throws(() => verifyLicenseKey("hello"), /malformed/);
});

// ── Founder / lifetime ──

test("founder key verifies and is lifetime (no exp)", () => {
  const p = verifyLicenseKey(makeKey({ ...good, plan: "founder" }));
  assert.equal(p.plan, "founder");
  assert.equal(p.exp, undefined);
});

test("lifetime key never expires — valid decades out", () => {
  const key = makeKey({ ...good, plan: "founder" });
  assert.equal(verifyLicenseKey(key, new Date("2099-01-01")).plan, "founder");
});

test("payload identity fields round-trip", () => {
  const p = verifyLicenseKey(
    makeKey({ ...good, id: "lic-1", name: "Acme HVAC", email: "owner@acme.test" }),
  );
  assert.equal(p.name, "Acme HVAC");
  assert.equal(p.email, "owner@acme.test");
});

// ── resolvePlan: the entitlement read used by org/plugins/emails ──

test("resolvePlan: no key → free, no license info", () => {
  assert.deepEqual(resolvePlan(null), { plan: "free", license: null });
});

test("resolvePlan: valid pro annual → pro with expiry facts", () => {
  const exp = new Date(Date.now() + 86400_000).toISOString();
  const { plan, license } = resolvePlan(makeKey({ ...good, exp, name: "Acme" }));
  assert.equal(plan, "pro");
  assert.equal(license?.expiresAt, exp);
  assert.equal(license?.lifetime, false);
  assert.equal(license?.customerName, "Acme");
  assert.equal(license?.invalidReason, null);
});

test("resolvePlan: founder → lifetime", () => {
  const { plan, license } = resolvePlan(makeKey({ ...good, plan: "founder" }));
  assert.equal(plan, "founder");
  assert.equal(license?.lifetime, true);
  assert.equal(license?.expiresAt, null);
});

test("resolvePlan: expired annual falls back to free, with reason", () => {
  const { plan, license } = resolvePlan(makeKey({ ...good, exp: "2020-01-01" }));
  assert.equal(plan, "free");
  assert.match(license?.invalidReason ?? "", /expired/);
});

test("resolvePlan: tampered/garbage keys fall back to free without throwing", () => {
  assert.equal(resolvePlan("hello").plan, "free");
  assert.equal(resolvePlan("OFP1.bm90.cmVhbA").plan, "free");
});
