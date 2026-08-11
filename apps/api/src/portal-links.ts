// Customer portal links: signed bearer tokens that are never stored in plain
// form, expire by default, and can be revoked by the owner at any time.
// Only the SHA-256 hash and a short display prefix are persisted.
import { createHash, randomBytes } from "node:crypto";
import { PORTAL_LINK_SCOPES, type PortalLinkScope } from "@ofp/shared";

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
