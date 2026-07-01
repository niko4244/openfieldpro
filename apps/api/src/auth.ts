// Password hashing with Node's stdlib scrypt — no bcrypt/argon dependency.
// Format stored in users.password_hash:  "<saltHex>:<hashHex>".
// scrypt is the right call here: memory-hard, in the standard library, and we
// verify with a constant-time compare. (Security is explicitly not a place to be lazy.)
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

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
