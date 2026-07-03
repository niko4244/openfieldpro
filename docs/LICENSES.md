# Licensing — how OpenFieldPro is licensed and how license keys work

Two unrelated things share the word "license." This page covers both.

## 1. The software license: AGPL-3.0

The entire codebase is **AGPL-3.0** (`LICENSE` at the repo root).

- **Self-hosting is free, forever.** Run it for your business, modify it,
  never pay anyone. Unlimited users, technicians, jobs, and customers.
- **Hosting a modified version for others?** The AGPL's network clause
  applies: you must publish your modifications under AGPL too.
- **Commercial exceptions.** The copyright holder can sell commercial
  licenses/exceptions to companies that can't accept AGPL terms — see
  [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

## 2. License *keys*: offline plan activation

A license key is an **Ed25519-signed blob** that flips a self-hosted install
from Free to Pro, Founder, or Business. It is verified entirely locally:

- **No license server.** Nothing to host, nothing that can go down.
- **No phone-home, no telemetry.** The app never contacts OpenFieldPro
  infrastructure — activation works air-gapped.
- **Pasted once.** The admin pastes the key in *Settings → General →
  Plan & License*; the server verifies the signature against a public key
  baked into `apps/api/src/lib/license.ts` and stores the key.
- **Re-verified on every read.** Annual keys carry a signed `exp` date; when
  it passes, the install quietly falls back to Free. **No data is ever
  deleted, hidden, or held hostage** — Free is the complete core product.
- **Lifetime keys** (Founder) simply have no `exp` and never expire.

### Key anatomy

```
OFP1.<base64url(payload JSON)>.<base64url(Ed25519 signature)>
```

The payload is human-readable JSON (base64url-decode it to debug):

```json
{
  "product": "openfieldpro",
  "plan": "pro",                      // pro | founder | business
  "iat": "2026-07-01T00:00:00.000Z",  // issued
  "exp": "2027-07-01T00:00:00.000Z",  // omitted on lifetime keys
  "id": "…uuid…",                     // license id, for the seller's records
  "name": "Acme HVAC",                // optional customer name
  "email": "owner@acme.example",      // optional customer email
  "note": "…"                         // optional free-form note
}
```

Any byte change breaks the signature — readable, but tamper-proof.

> The example above is illustrative only; it is not a signed, working key.

### Issuing keys (maintainer)

```bash
pnpm license:generate --tier pro --name "Acme HVAC" --email owner@acme.example --expires 2027-07-01
pnpm license:generate --tier founder --name "Early Supporter" --email owner@acme.example --lifetime
pnpm license:generate --tier business --name "BigCo" --expires 2027-07-01 --json   # JSON for your records
pnpm license:verify  --key "OFP1...."
```

First run generates the signing keypair and writes the **private key** to
`~/.ofp/license-signing-key.pem` (override with
`OFP_LICENSE_PRIVATE_KEY_FILE`). Back it up; **never commit it**. The public
key in the repo is not a secret.

Forks that want to issue their own keys: run the generator once, paste the
printed public key into `DEFAULT_PUBLIC_KEY_PEM` (or set
`OFP_LICENSE_PUBLIC_KEY`), and sell keys for your fork. The open-source deal
is the code, not the key.

### Failure behavior (by design)

| Situation | Result |
|---|---|
| No key pasted | Free — complete core product |
| Malformed / tampered / wrong-product key | Rejected at paste with a clear error; install stays as-is |
| Annual key passes its `exp` | Install reads as Free again; Settings explains why; **all data intact** |
| Paste a new key later | Entitlement restored instantly, offline |

Tests: `apps/api/test/license.test.ts` and `apps/api/test/features.test.ts`.
