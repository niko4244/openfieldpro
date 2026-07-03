// Issue a license key (maintainer tool — buyers never run this).
//
// First run generates an Ed25519 keypair: the PRIVATE key is written to
// OFP_LICENSE_PRIVATE_KEY_FILE (default ~/.ofp/license-signing-key.pem,
// OUTSIDE the repo — never commit it) and the PUBLIC key PEM is printed so
// it can be pasted into src/lib/license.ts (DEFAULT_PUBLIC_KEY_PEM).
// Subsequent runs sign a key with the existing private key.
//
// Usage (repo root):
//   pnpm license:generate --tier pro --name "Acme HVAC" --email owner@acme.com --expires 2027-07-01
//   pnpm license:generate --tier founder --name "Early Supporter" --lifetime
//   pnpm license:generate --tier business --name "BigCo" --expires 2027-07-01 --json
//
// Flags:
//   --tier pro|founder|business   (alias: --plan; default pro)
//   --name / --email              customer identity, embedded in the payload
//   --expires YYYY-MM-DD          annual/subscription key (alias: --exp)
//   --lifetime                    never expires (default for founder)
//   --note "text"                 free-form note for your records
//   --json                        print {key, payload} JSON for record-keeping
import { generateKeyPairSync, createPrivateKey, sign as edSign, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { PLANS } from "@ofp/shared";

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
const arg = (...names: string[]): string | undefined => {
  for (const name of names) {
    const i = args.indexOf(`--${name}`);
    if (i >= 0) return args[i + 1];
  }
  return undefined;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const tier = arg("tier", "plan") ?? "pro";
if (!(PLANS as readonly string[]).includes(tier) || tier === "free") {
  console.error(`--tier must be one of: pro, founder, business (got "${tier}")`);
  process.exit(1);
}

const expiresRaw = arg("expires", "exp");
const lifetime = flag("lifetime") || tier === "founder"; // founder is lifetime by definition
if (expiresRaw && lifetime) {
  console.error("--expires and --lifetime are mutually exclusive (founder keys are always lifetime)");
  process.exit(1);
}
if (!expiresRaw && !lifetime) {
  console.error(`annual ${tier} keys need --expires YYYY-MM-DD (or pass --lifetime explicitly)`);
  process.exit(1);
}
const exp = expiresRaw ? new Date(expiresRaw) : undefined;
if (exp && Number.isNaN(exp.getTime())) {
  console.error(`--expires is not a date: "${expiresRaw}"`);
  process.exit(1);
}

const payload = {
  product: "openfieldpro",
  plan: tier,
  iat: new Date().toISOString(),
  id: randomUUID(),
  ...(exp ? { exp: exp.toISOString() } : {}),
  ...(arg("name") ? { name: arg("name") } : {}),
  ...(arg("email") ? { email: arg("email") } : {}),
  ...(arg("note") ? { note: arg("note") } : {}),
};

const privateKey = createPrivateKey(readFileSync(keyFile));
const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
const sig = edSign(null, payloadBytes, privateKey);
const key = `OFP1.${payloadBytes.toString("base64url")}.${sig.toString("base64url")}`;

if (flag("json")) {
  console.log(JSON.stringify({ key, payload }, null, 2));
} else {
  console.log(`${tier}${exp ? ` (expires ${exp.toISOString().slice(0, 10)})` : " (lifetime)"} license key:\n`);
  console.log(key);
}
