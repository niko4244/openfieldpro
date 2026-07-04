// Password hashing with Node's stdlib scrypt — no bcrypt/argon dependency.
// Format stored in users.password_hash:  "<saltHex>:<hashHex>".
// scrypt is the right call here: memory-hard, in the standard library, and we
// verify with a constant-time compare. (Security is explicitly not a place to be lazy.)
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const AUTH_COOKIE_NAME = "ofp_token";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  // Lengths must match before timingSafeEqual or it throws.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface JwtClaims {
  userId: string;
  orgId: string;
  name?: string;
  email?: string;
  role: string;
}

// Type the JWT payload/user across the app so req.user is JwtClaims, not `any`.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtClaims;
    user: JwtClaims;
  }
}

function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return rawValue.join("=");
    }
  }
  return null;
}

export function authTokenFromRequest(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1];
  }
  return parseCookieHeader(req.headers.cookie, AUTH_COOKIE_NAME);
}

export async function verifyRequestJwt(req: FastifyRequest): Promise<JwtClaims> {
  const token = authTokenFromRequest(req);
  if (!token) {
    await req.jwtVerify();
    return req.user as JwtClaims;
  }
  const claims = await req.server.jwt.verify<JwtClaims>(token);
  req.user = claims;
  return claims;
}

export function setAuthCookie(reply: FastifyReply, token: string): void {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=604800",
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  reply.header("set-cookie", attrs.join("; "));
}
