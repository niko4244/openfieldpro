import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, techLocations, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitDomainEvent } from "../lib/events.js";
import {
  isValidAccuracy,
  isValidLatLng,
  releasePing,
  reservePing,
} from "../dispatch.js";

// Phase 7 routes:
//   POST /api/tech/location  — with coords. UPSERT-on-conflict on
//                              (org_id, user_id).
//   POST /api/tech/status    — online-flag-only toggle. Reuses the
//                              same row to keep the UPSERT-on-conflict
//                              pattern; leaves lat/lng/accuracy untouched
//                              so a tech who pauses sharing (backgrounded
//                              tab) keeps their last-known position visible
//                              as "stale" rather than dropping off the map.
//
// Identity (userId) is read from the verified JWT in BOTH routes —
// there's no `userId` field in the body. That removes a class of bugs
// where a tech could spoof another tech's history by sending their own
// userId in the body.
const pingBody = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  accuracyM: z.number().finite().min(0).max(50_000).optional(),
  online: z.boolean().optional(),
});

// Body for /status — only the online flag, no coords.
const statusBody = z.object({
  online: z.boolean(),
});

export async function techRoutes(app: FastifyInstance) {
  // POST /api/tech/location — full ping.
  app.post("/location", async (req, reply) => {
    const orgId = await resolveOrgId(req); // throws 401 in prod without JWT
    const identity = await resolveTechIdentity(req, orgId);

    const parsed = pingBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!isValidLatLng(parsed.data.lat, parsed.data.lng)) {
      return reply.code(400).send({ error: "lat/lng out of range" });
    }
    if (!isValidAccuracy(parsed.data.accuracyM)) {
      return reply.code(400).send({ error: "accuracyM out of range" });
    }

    // Throttle: reserve the slot atomically. We hold it across the UPSERT
    // await so two concurrent pings can't both pass the 5s floor.
    // On UPSERT failure we release the slot so the next legitimate ping
    // isn't blocked.
    const slot = reservePing(identity.userId);
    if (!slot.accept) {
      return reply
        .code(429)
        .header("Retry-After", String(Math.ceil(slot.retryAfterMs / 1000)))
        .send({ error: "too many pings", retryAfterMs: slot.retryAfterMs });
    }

    const capturedAt = new Date();
    let row: { id: string } | undefined;
    try {
      const inserting = await db
        .insert(techLocations)
        .values({
          orgId,
          userId: identity.userId,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          accuracyM: parsed.data.accuracyM ?? null,
          online: parsed.data.online ?? true,
          capturedAt,
        })
        .onConflictDoUpdate({
          target: [techLocations.orgId, techLocations.userId],
          set: {
            lat: parsed.data.lat,
            lng: parsed.data.lng,
            accuracyM: parsed.data.accuracyM ?? null,
            online: parsed.data.online ?? true,
            capturedAt,
            updatedAt: new Date(),
            version: sql`${techLocations.version} + 1`,
          },
        })
        .returning({ id: techLocations.id });
      row = inserting[0];
    } catch (err) {
      // Free the slot so the next legitimate ping can pass.
      releasePing(identity.userId);
      throw err;
    }

    void safeEmitDomainEvent({
      orgId,
      key: "tech.location.updated",
      occurredAt: capturedAt.toISOString(),
      payload: {
        userId: identity.userId,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        accuracyM: parsed.data.accuracyM ?? null,
        online: parsed.data.online ?? true,
        capturedAt: capturedAt.toISOString(),
      },
    });

    return reply.code(200).send({
      ok: true,
      capturedAt: capturedAt.toISOString(),
      id: row?.id,
    });
  });

  // POST /api/tech/status — online-flag-only.
  //
  // Used by the tech-tracker when the page goes hidden (online:false) or
  // returns to visible (online:true). Keeps the last-known position on
  // the row so the dispatch board shows "recent" briefly, then fades to
  // "stale" on the natural freshness clock once the tab is backgrounded
  // for > 2 minutes.
  app.post("/status", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const identity = await resolveTechIdentity(req, orgId);

    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const slot = reservePing(identity.userId);
    if (!slot.accept) {
      return reply
        .code(429)
        .header("Retry-After", String(Math.ceil(slot.retryAfterMs / 1000)))
        .send({ error: "too many pings", retryAfterMs: slot.retryAfterMs });
    }

    // Default-values-only update preserves the row's existing lat/lng.
    const capturedAt = new Date();
    let row: { id: string } | undefined;
    try {
      const updating = await db
        .update(techLocations)
        .set({
          online: parsed.data.online,
          capturedAt,
          updatedAt: capturedAt,
          version: sql`${techLocations.version} + 1`,
        })
        .where(
          and(eq(techLocations.orgId, orgId), eq(techLocations.userId, identity.userId)),
        )
        .returning({ id: techLocations.id });
      row = updating[0];
    } catch (err) {
      releasePing(identity.userId);
      throw err;
    }

    // If the tech has never sent a location, /status with online:true
    // shouldn't create an empty row at (0,0). Surface 404 so the client
    // knows it must ping /location first.
    if (!row) {
      return reply.code(404).send({
        error: "no prior location; send /api/tech/location first",
      });
    }

    void safeEmitDomainEvent({
      orgId,
      key: "tech.location.updated",
      occurredAt: capturedAt.toISOString(),
      payload: {
        userId: identity.userId,
        online: parsed.data.online,
        capturedAt: capturedAt.toISOString(),
      },
    });

    return reply.code(200).send({
      ok: true,
      online: parsed.data.online,
      capturedAt: capturedAt.toISOString(),
      id: row.id,
    });
  });
}

// Resolve the calling technician's identity.
//
// Priority:
//   1. Verified JWT — userId from `req.user.userId` (or `sub`).
//   2. Dev-only fallback: first technician (then any user) of the org.
// In production a missing JWT is a 401; in dev we keep the route callable.
async function resolveTechIdentity(
  req: import("fastify").FastifyRequest,
  orgId: string,
): Promise<{ userId: string; role: "owner" | "dispatcher" | "technician" }> {
  try {
    await req.jwtVerify();
    const claims = req.user as {
      sub?: string;
      userId?: string;
      role?: "owner" | "dispatcher" | "technician";
    };
    const userId = claims?.userId ?? claims?.sub;
    if (userId && claims?.role) {
      return { userId, role: claims.role };
    }
  } catch {
    /* fall through to dev fallback */
  }
  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  }
  // Dev: first technician, then any user.
  const [tech] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "technician")))
    .limit(1);
  if (tech) return { userId: tech.id, role: "technician" };
  const [any] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);
  if (!any) throw Object.assign(new Error("no user found"), { statusCode: 404 });
  return { userId: any.id, role: any.role };
}
