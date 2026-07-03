// Verify a license key locally — the same check the server runs at
// redemption and on every entitlement read. Useful before sending a key to
// a customer, or for a customer to sanity-check a key they received.
//
// Usage (repo root):
//   pnpm license:verify --key "OFP1...."
//   pnpm license:verify --key "OFP1...." --json
//
// Exit code 0 = valid, 1 = invalid/expired/malformed.
import { verifyLicenseKey } from "../src/lib/license.ts";

const args = process.argv.slice(2);
const i = args.indexOf("--key");
const key = i >= 0 ? args[i + 1] : undefined;
if (!key) {
  console.error('usage: pnpm license:verify --key "<license key>" [--json]');
  process.exit(1);
}

try {
  const payload = verifyLicenseKey(key);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ valid: true, payload }, null, 2));
  } else {
    console.log(`VALID ${payload.plan} license`);
    console.log(`  issued:  ${payload.iat}`);
    console.log(`  expires: ${payload.exp ?? "never (lifetime)"}`);
    if (payload.name) console.log(`  name:    ${payload.name}`);
    if (payload.email) console.log(`  email:   ${payload.email}`);
    if (payload.note) console.log(`  note:    ${payload.note}`);
  }
} catch (e) {
  const message = (e as Error).message;
  if (args.includes("--json")) {
    console.log(JSON.stringify({ valid: false, error: message }, null, 2));
  } else {
    console.error(`INVALID: ${message}`);
  }
  process.exit(1);
}
