import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, appointments, customers, jobs, properties, users } from "@ofp/db";
import { JOB_STATUS } from "@ofp/shared";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";

const boardQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const assignBody = z.object({
  technicianId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
const routeQuery = z.object({
  date: z.string().optional(),
  technicianId: z.string().uuid().optional(),
  startLat: z.string().optional(),
  startLng: z.string().optional(),
});

function toNumber(value?: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function dayWindow(dateText?: string) {
  const base = dateText ? new Date(`${dateText}T00:00:00.000Z`) : new Date();
  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function bucket(status: string, appointmentId?: string | null) {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "inProgress";
  if (appointmentId || status === "scheduled") return "scheduled";
  return "unscheduled";
}

export async function dispatchRoutes(app: FastifyInstance) {
  app.get("/board", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = boardQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const appointmentConds = [eq(appointments.orgId, orgId)];
    if (parsed.data.from) appointmentConds.push(gte(appointments.startsAt, new Date(parsed.data.from)));
    if (parsed.data.to) appointmentConds.push(lte(appointments.startsAt, new Date(parsed.data.to)));

    const [jobRows, appointmentRows, customerRows, propertyRows, technicianRows] = await Promise.all([
      db.select().from(jobs).where(eq(jobs.orgId, orgId)),
      db.select().from(appointments).where(and(...appointmentConds)).orderBy(asc(appointments.startsAt)),
      db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.orgId, orgId)),
      db.select({ id: properties.id, address: properties.address, lat: properties.lat, lng: properties.lng }).from(properties).where(eq(properties.orgId, orgId)),
      db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.orgId, orgId)),
    ]);

    const customerById = new Map(customerRows.map((customer) => [customer.id, customer]));
    const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
    const appointmentByJobId = new Map(appointmentRows.map((appointment) => [appointment.jobId, appointment]));
    const technicianById = new Map(technicianRows.map((tech) => [tech.id, tech]));
    const cards = jobRows
      .filter((job) => job.status !== "canceled")
      .map((job) => {
        const appointment = appointmentByJobId.get(job.id);
        const customer = customerById.get(job.customerId);
        const property = job.propertyId ? propertyById.get(job.propertyId) : null;
        const technicianId = appointment?.technicianId ?? job.assignedTo ?? null;
        return {
          id: job.id,
          title: job.title,
          status: job.status,
          total: job.total,
          scheduledAt: job.scheduledAt,
          appointment,
          technician: technicianId ? technicianById.get(technicianId) ?? null : null,
          customer,
          property,
          bucket: bucket(job.status, appointment?.id),
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      technicians: technicianRows,
      columns: {
        unscheduled: cards.filter((card) => card.bucket === "unscheduled"),
        scheduled: cards.filter((card) => card.bucket === "scheduled"),
        inProgress: cards.filter((card) => card.bucket === "inProgress"),
        completed: cards.filter((card) => card.bucket === "completed"),
      },
    };
  });

  app.post("/jobs/:jobId/assign", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [existing] = await db.select().from(appointments).where(and(eq(appointments.orgId, orgId), eq(appointments.jobId, jobId)));
    if (existing) {
      const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
      const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endsAt;
      if (endsAt <= startsAt) return reply.code(400).send({ error: "endsAt must be after startsAt" });
      const [appointment] = await db
        .update(appointments)
        .set({ technicianId: parsed.data.technicianId ?? existing.technicianId, startsAt, endsAt })
        .where(and(eq(appointments.orgId, orgId), eq(appointments.id, existing.id)))
        .returning();
      await db.update(jobs).set({ assignedTo: appointment.technicianId, status: "scheduled" }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
      safeEmitActivity(orgId, "dispatch.reassigned", `Updated dispatch assignment for ${job.title}`, { jobId });
      return { jobId, appointment };
    }

    if (!parsed.data.startsAt || !parsed.data.endsAt) return reply.code(400).send({ error: "startsAt and endsAt are required for a new dispatch appointment" });
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (endsAt <= startsAt) return reply.code(400).send({ error: "endsAt must be after startsAt" });
    const [appointment] = await db
      .insert(appointments)
      .values({ orgId, jobId, technicianId: parsed.data.technicianId ?? null, startsAt, endsAt })
      .returning();
    await db.update(jobs).set({ assignedTo: parsed.data.technicianId ?? null, status: "scheduled", scheduledAt: startsAt }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
    safeEmitActivity(orgId, "dispatch.assigned", `Dispatched ${job.title} for ${startsAt.toLocaleString()}`, { jobId });
    return reply.code(201).send({ jobId, appointment });
  });

  app.patch("/jobs/:jobId/status", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const parsed = z.object({ status: z.enum(JOB_STATUS) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db.update(jobs).set({ status: parsed.data.status }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId))).returning();
    if (!job) return reply.code(404).send({ error: "job not found" });
    safeEmitActivity(orgId, "dispatch.status", `Dispatch moved job to ${parsed.data.status.replaceAll("_", " ")}`, { jobId });
    return job;
  });

  app.get("/route-plan", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = routeQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { start, end } = dayWindow(parsed.data.date);
    const appointmentRows = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.orgId, orgId), gte(appointments.startsAt, start), lte(appointments.startsAt, end)))
      .orderBy(asc(appointments.startsAt));
    const filtered = parsed.data.technicianId ? appointmentRows.filter((row) => row.technicianId === parsed.data.technicianId) : appointmentRows;
    const jobRows = await db.select().from(jobs).where(eq(jobs.orgId, orgId));
    const propertyRows = await db.select({ id: properties.id, address: properties.address, lat: properties.lat, lng: properties.lng }).from(properties).where(eq(properties.orgId, orgId));
    const jobById = new Map(jobRows.map((job) => [job.id, job]));
    const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
    let current = { lat: toNumber(parsed.data.startLat) ?? 0, lng: toNumber(parsed.data.startLng) ?? 0 };
    const stops = filtered.map((appointment, index) => {
      const job = jobById.get(appointment.jobId);
      const property = job?.propertyId ? propertyById.get(job.propertyId) : null;
      const lat = toNumber(property?.lat);
      const lng = toNumber(property?.lng);
      const hasCoords = lat !== null && lng !== null;
      const miles = hasCoords ? milesBetween(current, { lat, lng }) : null;
      if (hasCoords) current = { lat, lng };
      return {
        sequence: index + 1,
        appointmentId: appointment.id,
        jobId: appointment.jobId,
        title: job?.title ?? "Job",
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        technicianId: appointment.technicianId,
        address: property?.address ?? null,
        lat,
        lng,
        driveMilesFromPrevious: miles === null ? null : Number(miles.toFixed(1)),
        mapUrl: property?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}` : null,
      };
    });
    return {
      date: start.toISOString().slice(0, 10),
      technicianId: parsed.data.technicianId ?? null,
      stops,
      totalKnownMiles: Number(stops.reduce((sum, stop) => sum + (stop.driveMilesFromPrevious ?? 0), 0).toFixed(1)),
      missingCoordinateStops: stops.filter((stop) => stop.lat === null || stop.lng === null).length,
    };
  });
}
