// Pure helpers for Phase 6 estimate-approval flow. Kept DB-free so the
// runnable check (apps/api/test/approval.test.ts) can verify format and
// validation without Postgres or the network. Mirrors apps/api/src/inventory.ts
// as the template.

import { randomBytes } from "node:crypto";

/** Length of the approval token in bytes. 32 bytes → 64 hex chars, ~256 bits. */
const APPROVAL_TOKEN_BYTES = 32;

/**
 * Mint a high-entropy random approval token. Hex-encoded; safe to embed
 * directly in a URL. V1 stores the raw token in `estimates.approval_token`;
 * see schema.ts Ponytail comment for the upgrade path to SHA-256 hashing.
 */
export function mintApprovalToken(): string {
  return randomBytes(APPROVAL_TOKEN_BYTES).toString("hex");
}

/** Compile a full approval URL from a host base and a token. Used by /send. */
export function buildApprovalLink(publicBaseUrl: string, token: string): string {
  const trimmed = publicBaseUrl.replace(/\/+$/, "");
  return `${trimmed}/approvals/${token}`;
}

/**
 * Validate the opaque signature payload sent by the public approve endpoint.
 *
 * Contract for V1:
 *  - Must be a `data:` URI.
 *  - Must declare `image/png` (the only signature pad output we use).
 *  - Base64 payload must be plain A-Za-z0-9+/= with optional whitespace.
 *  - Total length capped at 100 KB so a malicious payload can't bloat the row.
 *
 * Returns true iff all four checks pass. We do NOT decode/parse the binary
 * PNG header in V1; the regex + length cap is enough since the data URL
 * originates from our own canvas, so the worst case is a stale browser
 * sending a corrupt payload, which the row handles as "blank signature".
 */
const SIGNATURE_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/;

export function isValidSignatureDataUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 100_000) return false;
  return SIGNATURE_DATA_URL.test(value);
}

/** Trim/validate a free-text signer name. Returns null on empty / overlong. */
export function normalizeSignerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 120) return null;
  return trimmed;
}
