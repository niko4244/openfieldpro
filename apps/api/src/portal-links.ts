// Customer portal links: signed bearer tokens that are never stored in plain
// form, expire by default, and can be revoked by the owner at any time.
// Only the SHA-256 hash and a short display prefix are persisted.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { PORTAL_LINK_SCOPES, type PortalLinkScope } from "@ofp/shared";

const CIPHER_ALGO = "aes-256-gcm";
const CIPHER_VERSION = "v1";

export const PORTAL_TOKEN_PREFIX = "pl_";

export interface GeneratedPortalToken {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

export function generatePortalToken(bytes = 32): GeneratedPortalToken {
  const secret = randomBytes(bytes).toString("base64url");
  const token = `${PORTAL_TOKEN_PREFIX}${secret}`;
  return { token, tokenHash: hashPortalToken(token), tokenPrefix: token.slice(0, PORTAL_TOKEN_PREFIX.length + 10) };
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface PortalLinkRecord {
  revokedAt: Date | string | null;
  expiresAt: Date | string | null;
}

export type PortalLinkStatus = "active" | "expired" | "revoked";

export function portalLinkStatus(link: PortalLinkRecord, now: number = Date.now()): PortalLinkStatus {
  if (link.revokedAt && new Date(link.revokedAt).getTime() <= now) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now) return "expired";
  return "active";
}

export function parsePortalLinkScopes(input: unknown): PortalLinkScope[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((value): value is PortalLinkScope => PORTAL_LINK_SCOPES.includes(value as PortalLinkScope)))];
}

/** Default link lifetime in days when the owner does not choose one. */
export const DEFAULT_PORTAL_LINK_TTL_DAYS = 30;

export function portalLinkExpiry(expiresInDays: number | null | undefined, now: number = Date.now()): Date | null {
  if (expiresInDays == null) return null;
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) return null;
  return new Date(now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000));
}

/**
 * The raw token must be recoverable to email the portal link to the customer,
 * but a database leak alone must not expose usable links. We encrypt the token
 * at rest with AES-256-GCM using a key derived (HKDF) from the server secret.
 */
export function portalLinkEncryptionKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("ofp-portal-links"), Buffer.from("token-encryption-v1"), 32),
  );
}

export function encryptPortalToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CIPHER_VERSION}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptPortalToken(cipherText: string, key: Buffer): string | null {
  const parts = cipherText.split(".");
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) return null;
  try {
    const decipher = createDecipheriv(CIPHER_ALGO, key, Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered, wrong key, or truncated — treat as unrecoverable
  }
}
