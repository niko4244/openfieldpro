// Tenancy resolver. Prefer the org_id from a verified JWT. In local development
// only, fall back to x-org-id and then the first seeded org so the starter app
// can run before a browser login is wired.
import type { FastifyRequest } from "fastify";
import { db, orgs } from "@ofp/db";
import type { JwtClaims } from "../auth.js";

export async function resolveOrgId(req: FastifyRequest): Promise<string> {
  try {
    await req.jwtVerify();
    const claims = req.user as JwtClaims;
    if (claims?.orgId) return claims.orgId;
  } catch {
    // No valid bearer token or session cookie; local-only fallbacks below.
  }

  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  }

  const header = req.headers["x-org-id"];
  if (typeof header === "string" && header) return header;
  const [first] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  if (!first) throw new Error("no org found — run `pnpm db:seed`");
  return first.id;
}
