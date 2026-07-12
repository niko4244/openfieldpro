import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, gte, lte, asc, lt, gt, ne, inArray } from "drizzle-orm";
import { db, appointments, jobs, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { resolveAppointmentWindow } from "./appointment-validation.js";
import { verifiedClaims } from "../operational-authorization.js";

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

async function technicianIsAssignable(orgId: string, technicianId: string) {
  const [technician] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.id, technicianId),
        inArray(users.role, ["technician", "owner"]),
        eq(users.active, true),
      ),
    );
  return Boolean(technician);
}

async function findTechnicianConflict({
  orgId,
  technicianId,
  startsAt,
  endsAt,
  excludeAppointmentId,
}: {
  orgId: string;
  technicianId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string;
}) {
  const overlap = and(
    eq(appointments.orgId, orgId),
    eq(appointments.technicianId, technicianId),
    lt(appointments.startsAt, endsAt),
    gt(appointments.endsAt, startsAt),
  );

  const [conflict] = await db
    .select({
      id: appointments.id,
      jobId: appointments.jobId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(excludeAppointmentId ? and(overlap, ne(appointments.id, excludeAppointmentId)) : overlap)
    .limit(1);

  return conflict;
}

function conflictResponse(conflict: {
  id: string;
  jobId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  return {
    error: "technician has an overlapping appointment",
    conflict: {
      appointmentId: conflict.id,
      jobId: conflict.jobId,
      startsAt: conflict.startsAt.toISOString(),
      endsAt: conflict.endsAt.toISOString(),
    },
  };
}

export async function appointmentRoutes(app: FastifyInstance) {
  // List, optionally within [from, to] for a calendar view.
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { from, to } = req.query as { from?: string; to?: string };
    const conds = [eq(appointments.orgId, orgId)];
    if (claims.role === "technician") {
      conds.push(eq(appointments.technicianId, claims.userId));
    }
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
    const window = resolveAppointmentWindow(
      { startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
      {},
    );
    if (!window.ok) return reply.code(400).send({ error: window.error });

    // Job must belong to this org (no cross-tenant scheduling).
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, rest.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    if (rest.technicianId && !(await technicianIsAssignable(orgId, rest.technicianId))) {
      return reply
        .code(400)
        .send({ error: "technician must be an active technician or owner in this organization" });
    }

    if (rest.technicianId) {
      const conflict = await findTechnicianConflict({
        orgId,
        technicianId: rest.technicianId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });
      if (conflict) return reply.code(409).send(conflictResponse(conflict));
    }

    const [row] = await db
      .insert(appointments)
      .values({
        orgId,
        ...rest,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      })
      .returning();

    // Keep the commercial work order aligned with the dispatch record.
    await db
      .update(jobs)
      .set({
        status: "scheduled",
        scheduledAt: window.startsAt,
        assignedTo: rest.technicianId ?? null,
      })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, rest.jobId)));

    safeEmitActivity(
      orgId,
      "appointment.scheduled",
      `Scheduled appointment for ${window.startsAt.toLocaleString()}`,
      { jobId: rest.jobId },
    );
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [current] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id)));
    if (!current) return reply.code(404).send({ error: "not found" });

    const { technicianId, startsAt, endsAt } = parsed.data;
    if (technicianId && !(await technicianIsAssignable(orgId, technicianId))) {
      return reply
        .code(400)
        .send({ error: "technician must be an active technician or owner in this organization" });
    }

    const window = resolveAppointmentWindow(current, { startsAt, endsAt });
    if (!window.ok) return reply.code(400).send({ error: window.error });

    const targetTechnicianId = technicianId !== undefined ? technicianId : current.technicianId;
    if (targetTechnicianId) {
      const conflict = await findTechnicianConflict({
        orgId,
        technicianId: targetTechnicianId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        excludeAppointmentId: id,
      });
      if (conflict) return reply.code(409).send(conflictResponse(conflict));
    }

    const [row] = await db
      .update(appointments)
      .set({
        ...(technicianId !== undefined ? { technicianId } : {}),
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      })
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    // Reassignment and rescheduling must update the work order used by jobs,
    // reports, mobile sync, and customer-facing status views.
    await db
      .update(jobs)
      .set({
        scheduledAt: window.startsAt,
        assignedTo: targetTechnicianId ?? null,
      })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, current.jobId)));

    const assignmentChanged = technicianId !== undefined && technicianId !== current.technicianId;
    const scheduleChanged =
      window.startsAt.getTime() !== current.startsAt.getTime() ||
      window.endsAt.getTime() !== current.endsAt.getTime();

    if (assignmentChanged || scheduleChanged) {
      safeEmitActivity(
        orgId,
        assignmentChanged ? "appointment.assigned" : "appointment.rescheduled",
        assignmentChanged
          ? technicianId
            ? "Appointment assigned to a technician"
            : "Appointment returned to the unassigned queue"
          : `Appointment rescheduled for ${window.startsAt.toLocaleString()}`,
        { jobId: current.jobId },
      );
    }

    return row;
  });
}
