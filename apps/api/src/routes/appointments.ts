import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { db, appointments, jobs } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitDomainEvent } from "../lib/events.js";

const createBody = z.object({
  jobId: z.string().uuid(),
  technicianId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

// Reschedule / reassign — the backend for calendar drag-and-drop.
const patchBody = z.object({
  technicianId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export async function appointmentRoutes(app: FastifyInstance) {
  // List, optionally within [from, to] for a calendar view.
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { from, to } = req.query as { from?: string; to?: string };
    const conds = [eq(appointments.orgId, orgId)];
    if (from) conds.push(gte(appointments.startsAt, new Date(from)));
    if (to) conds.push(lte(appointments.startsAt, new Date(to)));
    return db
      .select()
      .from(appointments)
      .where(and(...conds))
      .orderBy(asc(appointments.startsAt));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { startsAt, endsAt, ...rest } = parsed.data;
    if (new Date(endsAt) <= new Date(startsAt)) {
      return reply.code(400).send({ error: "endsAt must be after startsAt" });
    }

    // Job must belong to this org (no cross-tenant scheduling).
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, rest.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [row] = await db
      .insert(appointments)
      .values({ orgId, ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt) })
      .returning();
    // Moving a lead onto the calendar implies it's scheduled.
    await db.update(jobs).set({ status: "scheduled" }).where(eq(jobs.id, rest.jobId));
    safeEmitActivity(
      orgId,
      "appointment.scheduled",
      `Scheduled appointment for ${new Date(startsAt).toLocaleString()}`,
      { jobId: rest.jobId },
    );
    // Phase 5c trigger engine: wire the new appointment into the per-org
    // automation rules. Plugins also see this event via safeEmitDomainEvent.
    // ponytail: "appointment.created" is a sister of "appointment.scheduled"
    //   — same shape, different intent (the former is fired on insert for
    //   any channel that wants to confirm; the latter is the activity-log
    //   summary and used by rule fans). Ceiling: collapse to one event with
    //   a type discriminator if rule authors start asking for the diff.
    void safeEmitDomainEvent({
      orgId,
      key: "appointment.created",
      occurredAt: new Date().toISOString(),
      payload: {
        id: row.id,
        jobId: rest.jobId,
        startsAt,
        endsAt,
        technicianId: rest.technicianId ?? null,
      },
    });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { startsAt, endsAt, ...rest } = parsed.data;
    const [row] = await db
      .update(appointments)
      .set({
        ...rest,
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
      })
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
