// Issue a Pro license key (maintainer tool — buyers never run this).
//
// First run generates an Ed25519 keypair: the PRIVATE key is written to
// OFP_LICENSE_PRIVATE_KEY_FILE (default ~/.ofp/license-signing-key.pem,
// OUTSIDE the repo — never commit it) and the PUBLIC key PEM is printed so
// it can be pasted into src/lib/license.ts (DEFAULT_PUBLIC_KEY_PEM).
// Subsequent runs sign a key with the existing private key.
//
// Usage (from apps/api):
//   npx tsx scripts/make-license-key.ts [--plan pro] [--exp 2027-12-31] [--note "customer@x"]
import { generateKeyPairSync, createPrivateKey, sign as edSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const keyFile =
  process.env.OFP_LICENSE_PRIVATE_KEY_FILE ??
  path.join(homedir(), ".ofp", "license-signing-key.pem");

if (!existsSync(keyFile)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(path.dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`New signing keypair. Private key written to: ${keyFile}`);
  console.log(`Public key (paste into apps/api/src/lib/license.ts DEFAULT_PUBLIC_KEY_PEM):\n`);
  console.log(publicKey.export({ type: "spki", format: "pem" }).toString());
}

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const payload = {
  product: "openfieldpro",
  plan: arg("plan") ?? "pro",
  iat: new Date().toISOString(),
  ...(arg("exp") ? { exp: new Date(arg("exp")!).toISOString() } : {}),
  ...(arg("note") ? { note: arg("note") } : {}),
};

const privateKey = createPrivateKey(readFileSync(keyFile));
const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
const sig = edSign(null, payloadBytes, privateKey);
const key = `OFP1.${payloadBytes.toString("base64url")}.${sig.toString("base64url")}`;

console.log("License key:\n");
console.log(key);
