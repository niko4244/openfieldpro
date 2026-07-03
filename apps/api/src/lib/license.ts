// Offline license-key verification for the open-core Pro/Founder/Business plans.
//
// Fully hands-off monetization: keys are Ed25519-signed blobs sold via any
// payment link and verified locally against a public key — no license
// server, no phone-home, nothing to host. The project stays AGPL; a key
// only flips the org's `plan` column, which gates the sponsor slot and
// extended features.
//
// Key format:  OFP1.<base64url(payload JSON)>.<base64url(signature)>
// Payload:     { product: "openfieldpro", plan: "pro"|"founder"|"business",
//                iat, exp?, id?, name?, email?, note? }
// Lifetime keys (Founder) simply omit `exp`. The payload is plain JSON —
// base64url-decode it to debug — but any byte change breaks the signature.
//
// The redeemed key is stored on the org and RE-VERIFIED on every entitlement
// read (see resolvePlan): an annual key that passes `exp` degrades the org to
// 'free' locally, gracefully, without touching any data.
//
// ponytail: keys are not bound to an org, so one key activates any install.
//   Acceptable for v1 of a self-hosted product (honesty-box, like Sublime).
//   Ceiling: piracy at scale. Upgrade: include orgId in the payload at
//   purchase time and compare at redemption.

import { createPublicKey, verify as edVerify, type KeyObject } from "node:crypto";
import { PLANS, type Plan } from "@ofp/shared";

// The project maintainer's signing public key. Self-hosters who fork and
// want to issue their own keys can override with OFP_LICENSE_PUBLIC_KEY
// (SPKI PEM) — the open-source deal is the code, not the key.
const DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAo/ukE9usxyyEO96fc2ENKJwK5N3FLQTXaQo7MKYBMQo=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  product: string;
  plan: Plan;
  /** Issue timestamp, ISO 8601. */
  iat: string;
  /** Expiry, ISO 8601. Absent = lifetime (Founder keys). */
  exp?: string;
  /** Optional license id for the seller's records. */
  id?: string;
  /** Optional customer name (shown on the Settings plan card). */
  name?: string;
  /** Optional customer email. */
  email?: string;
  note?: string;
}

function publicKey(): KeyObject {
  return createPublicKey(process.env.OFP_LICENSE_PUBLIC_KEY ?? DEFAULT_PUBLIC_KEY_PEM);
}

const b64url = {
  decode: (s: string): Buffer => Buffer.from(s, "base64url"),
};

/** Verify a license key. Returns the payload on success, throws on any defect. */
export function verifyLicenseKey(key: string, now: Date = new Date()): LicensePayload {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "OFP1") {
    throw new Error("malformed license key");
  }
  const payloadBytes = b64url.decode(parts[1]);
  const sig = b64url.decode(parts[2]);
  if (!edVerify(null, payloadBytes, publicKey(), sig)) {
    throw new Error("invalid signature");
  }
  let payload: LicensePayload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8")) as LicensePayload;
  } catch {
    throw new Error("malformed payload");
  }
  if (payload.product !== "openfieldpro") throw new Error("wrong product");
  if (!PLANS.includes(payload.plan)) throw new Error("unknown plan");
  if (payload.exp && new Date(payload.exp) < now) throw new Error("license expired");
  return payload;
}

/** License facts for the Settings plan card. Never includes the raw key. */
export interface LicenseInfo {
  tier: Plan;
  /** null = lifetime. */
  expiresAt: string | null;
  lifetime: boolean;
  customerName: string | null;
  /** Set when a stored key no longer verifies (expired/invalid). */
  invalidReason: string | null;
}

/**
 * Compute the org's effective plan from its stored license key.
 * Missing/invalid/EXPIRED keys resolve to 'free' — entitlement is
 * re-derived on every read so annual keys lapse locally, with zero
 * phone-home and zero data impact.
 */
export function resolvePlan(
  licenseKey: string | null | undefined,
  now: Date = new Date(),
): { plan: Plan; license: LicenseInfo | null } {
  if (!licenseKey) return { plan: "free", license: null };
  try {
    const p = verifyLicenseKey(licenseKey, now);
    return {
      plan: p.plan,
      license: {
        tier: p.plan,
        expiresAt: p.exp ?? null,
        lifetime: !p.exp,
        customerName: p.name ?? null,
        invalidReason: null,
      },
    };
  } catch (e) {
    return {
      plan: "free",
      license: {
        tier: "free",
        expiresAt: null,
        lifetime: false,
        customerName: null,
        invalidReason: (e as Error).message,
      },
    };
  }
}
