// Runnable check for offline license-key verification.
// Run: npx tsx --test test/license.test.ts   (from apps/api)
import test from "node:test";
import assert from "node:assert";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { verifyLicenseKey } from "../src/lib/license.ts";

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
