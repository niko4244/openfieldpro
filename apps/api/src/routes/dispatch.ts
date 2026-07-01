import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, jobs, users, techLocations, properties, appointments } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { freshnessTier } from "../dispatch.js";

// GET /api/dispatch/state — combined snapshot for the dispatch map page.
//
// One roundtrip: techs with last-known location + open jobs at properties.
// freshnessTier is computed HERE (server clock) so the page renders stale
// markers correctly even if the tab hasn't refreshed in 30 minutes.
//
// ponytail: the join (5 tables) is still index-only on the hot path because
//   techLocations has a UNIQUE on (org_id, user_id), properties has the FK
//   from customers, and the appointments window index covers today's jobs.
//   Ceiling: when the org has 10k+ jobs/day, switch to a Redis-cached daily
//   snapshot + invalidate on appointment.create.
export async function dispatchRoutes(app: FastifyInstance) {
  app.get("/state", async (req, reply) => {
    const orgId = await resolveOrgId(req);

    // Role gate: only dispatcher + owner see the dispatch board.
    // - Production: require a non-null role claim; tech role \u2192 403.
    // - Dev: callerRole falls back to "dispatcher" so the page is browseable.
    const role = await callerRole(req);
    if (role !== "dispatcher" && role !== "owner") {
      return reply.code(403).send({ error: "dispatcher or owner role required" });
    }

    const now = new Date();
    // ±12h horizon keeps the dispatch board focused on TODAY rather than
    // pulling the full calendar window.
    const dayStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const dayEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    // 1) Techs in this org with their last location (LEFT JOIN; techs without
    //    a recent ping still appear on the map with `lastLocation: null`).
    const techRows = await db
      .select({
        userId: users.id,
        name: users.name,
        role: users.role,
        lat: techLocations.lat,
        lng: techLocations.lng,
        accuracyM: techLocations.accuracyM,
        capturedAt: techLocations.capturedAt,
        online: techLocations.online,
      })
      .from(users)
      .leftJoin(
        techLocations,
        and(
          eq(techLocations.userId, users.id),
          eq(techLocations.orgId, users.orgId),
        ),
      )
      .where(and(eq(users.orgId, orgId), eq(users.role, "technician")));

    const techs = techRows.map((t) => {
      // Compute freshness from the RAW Date (we stringify AFTER freshness
      // because freshnessTier's signature wants a Date, not an ISO string).
      const freshness =
        t.lat !== null && t.lng !== null && t.capturedAt !== null
          ? freshnessTier(t.capturedAt, now)
          : "dead";
      const last =
        t.lat !== null && t.lng !== null && t.capturedAt !== null
          ? {
              lat: t.lat,
              lng: t.lng,
              accuracyM: t.accuracyM ?? null,
              capturedAt: t.capturedAt.toISOString(),
              online: t.online ?? false,
            }
          : null;
      return {
        userId: t.userId,
        name: t.name,
        role: t.role,
        lastLocation: last,
        freshness,
      };
    });

    // 2) Today's appointments → assigned jobs → properties → customer.
    // dayStart + dayEnd both pushed into WHERE so LIMIT 500 covers relevant rows.
    const apptRows = await db
      .select({
        jobId: appointments.jobId,
        technicianId: appointments.technicianId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        title: jobs.title,
        status: jobs.status,
        assignedTo: jobs.assignedTo,
        scheduledAt: jobs.scheduledAt,
        customerId: jobs.customerId,
        propertyLat: properties.lat,
        propertyLng: properties.lng,
        propertyAddress: properties.address,
      })
      .from(appointments)
    .innerJoin(jobs, and(eq(jobs.id, appointments.jobId), eq(jobs.orgId, orgId)))
    // eslint-disable-next-line @typescript-eslint/no-shadow \u2014 leftJoin on properties below
    .leftJoin(properties, eq(properties.id, jobs.propertyId))
      .where(
        and(
          eq(appointments.orgId, orgId),
          gte(appointments.startsAt, dayStart),
          lte(appointments.startsAt, dayEnd),
        ),
      )
      .orderBy(desc(appointments.startsAt))
      .limit(500);

    // Local rename to avoid shadowing the imported `jobs` table reference
    // (which is used above on the same line as `.innerJoin(jobs, ...)`).
    const jobRows = apptRows.map((r) => ({
      id: r.jobId,
      title: r.title,
      status: r.status,
      scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      assignedTo: r.assignedTo ?? r.technicianId ?? null,
      // Phase 7 V1: the dispatch board reads `title` as the visible label
      // and intentionally skips a customers.name join. We can add that
      // join in V1.5 if the dispatcher asks "who's this job for?".
      customerName: r.title,
      lat: toNumOrNull(r.propertyLat),
      lng: toNumOrNull(r.propertyLng),
      address: r.propertyAddress,
    }));

    return {
      techs,
      jobs: jobRows,
      generatedAt: now.toISOString(),
    };
  });
}

function toNumOrNull(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function callerRole(
  req: import("fastify").FastifyRequest,
): Promise<"owner" | "dispatcher" | "technician" | null> {
  try {
    await req.jwtVerify();
    const claims = req.user as { role?: "owner" | "dispatcher" | "technician" };
    if (claims?.role) return claims.role;
  } catch {
    /* fall through */
  }
  if (process.env.NODE_ENV === "production") return null;
  return "dispatcher"; // dev fallback so the page is browseable
}
