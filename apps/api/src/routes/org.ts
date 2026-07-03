// Tenancy resolver. Phase 2: prefer the org_id from a verified JWT. Falls back
// to the `x-org-id` header and then the first org (dev convenience) so the
// existing customer/job routes keep working without a login during local dev.
// ponytail: header/first-org fallback is dev-only. Ceiling: do NOT ship with the
// fallback enabled in prod — gate it behind NODE_ENV !== "production".
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs } from "@ofp/db";
import type { JwtClaims } from "../auth.js";
import { verifyLicenseKey } from "../lib/license.js";

export async function resolveOrgId(req: FastifyRequest): Promise<string> {
  // 1. Verified JWT (the real path once a client logs in).
  try {
    await req.jwtVerify();
    const claims = req.user as JwtClaims;
    if (claims?.orgId) return claims.orgId;
  } catch {
    /* no/invalid token — fall through to dev fallbacks */
  }

  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  }

  // 2. Dev fallbacks.
  const header = req.headers["x-org-id"];
  if (typeof header === "string" && header) return header;
  const [first] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  if (!first) throw new Error("no org found — run `pnpm db:seed`");
  return first.id;
}

// ── Role-based authorization ──

export type Role = "owner" | "dispatcher" | "technician";

export interface Identity {
  orgId: string;
  userId: string | null;
  role: Role;
}

/**
 * Like resolveOrgId but also returns who is asking. Dev fallback (no JWT
 * outside production) acts as an owner so seeded local workflows and RSC
 * fetches keep working; production requires a verified token.
 */
export async function resolveIdentity(req: FastifyRequest): Promise<Identity> {
  try {
    await req.jwtVerify();
    const claims = req.user as JwtClaims;
    if (claims?.orgId) {
      return {
        orgId: claims.orgId,
        userId: claims.userId ?? null,
        role: (claims.role as Role) ?? "technician",
      };
    }
  } catch {
    /* fall through */
  }
  // resolveOrgId throws 401 in production when unauthenticated.
  const orgId = await resolveOrgId(req);
  return { orgId, userId: null, role: "owner" };
}

/** preHandler: reject with 403 unless the caller's role is in the list. */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const { role } = await resolveIdentity(req);
    if (!roles.includes(role)) {
      return reply.code(403).send({ error: `requires role: ${roles.join(" or ")}` });
    }
  };
}

/** preHandler: reads pass through; writes (POST/PATCH/PUT/DELETE) need a role. */
export function requireRoleForWrites(...roles: Role[]) {
  const gate = requireRole(...roles);
  return async (req: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (req.method === "GET" || req.method === "HEAD") return;
    return gate(req, reply);
  };
}

// ── Org settings (Settings → General) ──

const orgPatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export async function orgSettingsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.patch("/", { preHandler: requireRole("owner") }, async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = orgPatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.timezone) {
      try {
        // Intl throws on unknown zone ids — the cheapest full validation.
        new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
      } catch {
        return reply.code(400).send({ error: "invalid timezone" });
      }
    }
    const [row] = await db
      .update(orgs)
      .set(parsed.data)
      .where(eq(orgs.id, orgId))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // Redeem an offline-signed license key: verifies locally (no license
  // server) and flips the org's plan. See ../lib/license.ts for format.
  app.post("/license", { preHandler: requireRole("owner") }, async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = z.object({ key: z.string().min(16) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "license key required" });
    let plan;
    try {
      ({ plan } = verifyLicenseKey(parsed.data.key));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const [row] = await db.update(orgs).set({ plan }).where(eq(orgs.id, orgId)).returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
