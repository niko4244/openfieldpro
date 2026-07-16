import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  estimates,
  estimateOptions,
  estimateOptionLineItems,
  jobs,
  lineItems,
  orgs,
} from "@ofp/db";
import { mergeBusinessSettings } from "@ofp/shared";
import { defaultEstimateExpiresAt, estimateNumber } from "../estimates.js";
import { resolveOrgId } from "./org.js";

type EstimateLifecycle = "draft" | "sent" | "approved" | "declined" | "expired";

const createBody = z.object({ jobId: z.string().uuid() });
const optionBody = z.object({ label: z.string().trim().min(1).max(80) });
const lineBody = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  unitCost: z.number().int().nonnegative().default(0),
});
const linePatchBody = lineBody.partial().refine((value) => Object.keys(value).length > 0, "at least one field is required");
const decisionBody = z.object({ optionId: z.string().uuid(), signatureName: z.string().trim().max(160).optional() });

export function estimateOptionTotal(lines: { quantity: number; unitPrice: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

export function nextEstimateLifecycle(
  status: EstimateLifecycle,
  selectedOptionId: string | null,
  requestedOptionId: string,
): "approved" {
  if (status === "approved") {
    if (selectedOptionId === requestedOptionId) return "approved";
    throw new Error("estimate was already approved with a different option");
  }
  if (status === "declined") throw new Error("declined estimates cannot be approved");
  if (status === "expired") throw new Error("expired estimates cannot be approved");
  if (status === "draft") throw new Error("estimate must be sent before approval");
  return "approved";
}

export function assertEstimateApprovalAllowed(
  input: {
    status: EstimateLifecycle;
    expiresAt: Date | null;
    signatureRequired: boolean;
    signatureName?: string;
  },
  now = new Date(),
) {
  if (input.status === "expired" || (input.expiresAt && input.expiresAt.getTime() < now.getTime())) {
    throw new Error("estimate expired");
  }
  if (input.signatureRequired && !input.signatureName?.trim()) throw new Error("customer signature is required");
}

async function detail(orgId: string, id: string) {
  const [estimate] = await db.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
  if (!estimate) return null;
  const options = await db.select().from(estimateOptions)
    .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id)))
    .orderBy(asc(estimateOptions.position));
  const optionIds = options.map((option) => option.id);
  const lines = optionIds.length
    ? await db.select().from(estimateOptionLineItems)
      .where(and(eq(estimateOptionLineItems.orgId, orgId), inArray(estimateOptionLineItems.optionId, optionIds)))
      .orderBy(asc(estimateOptionLineItems.createdAt))
    : [];
  const withLines = options.map((option) => ({
    ...option,
    lineItems: lines.filter((line) => line.optionId === option.id),
  }));
  // Legacy clients still expect one flat lineItems collection.
  const legacyLines = withLines[0]?.lineItems ?? [];
  return { ...estimate, options: withLines, lineItems: legacyLines };
}

async function editableOption(orgId: string, estimateId: string, optionId: string) {
  const [row] = await db.select({ option: estimateOptions, estimate: estimates })
    .from(estimateOptions)
    .innerJoin(estimates, eq(estimates.id, estimateOptions.estimateId))
    .where(and(
      eq(estimateOptions.orgId, orgId),
      eq(estimateOptions.id, optionId),
      eq(estimateOptions.estimateId, estimateId),
      eq(estimates.orgId, orgId),
    ));
  if (!row || row.estimate.status === "approved" || row.estimate.status === "declined" || row.estimate.status === "expired") return null;
  return row;
}

async function recomputeOption(orgId: string, estimateId: string, optionId: string) {
  const lines = await db.select().from(estimateOptionLineItems)
    .where(and(eq(estimateOptionLineItems.orgId, orgId), eq(estimateOptionLineItems.optionId, optionId)));
  const total = estimateOptionTotal(lines);
  await db.update(estimateOptions).set({ total, updatedAt: new Date() })
    .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.id, optionId), eq(estimateOptions.estimateId, estimateId)));
  const [first] = await db.select({ id: estimateOptions.id, total: estimateOptions.total }).from(estimateOptions)
    .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, estimateId)))
    .orderBy(asc(estimateOptions.position)).limit(1);
  if (first) await db.update(estimates).set({ total: first.id === optionId ? total : first.total, updatedAt: new Date() })
    .where(and(eq(estimates.orgId, orgId), eq(estimates.id, estimateId)));
  return total;
}

export async function estimateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = Math.max(0, skip ? parseInt(skip, 10) || 0 : 0);
    const t = Math.min(100, Math.max(1, take ? parseInt(take, 10) || 50 : 50));
    await db.update(estimates).set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(estimates.orgId, orgId), sql`${estimates.expiresAt} < now()`, inArray(estimates.status, ["draft", "sent"])));
    return db.select().from(estimates).where(eq(estimates.orgId, orgId)).orderBy(desc(estimates.createdAt)).limit(t).offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const row = await detail(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
      if (!job) return null;
      const sourceLines = await tx.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, job.id)));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-number:${orgId}`}))`);
      const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
      const settings = mergeBusinessSettings(org?.businessSettings);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(estimates).where(eq(estimates.orgId, orgId));
      const [estimate] = await tx.insert(estimates).values({
        orgId,
        jobId: job.id,
        number: estimateNumber(count, settings.numbering.estimatePrefix, settings.numbering.estimateNextNumber),
        total: job.total,
        expiresAt: defaultEstimateExpiresAt(settings.estimate.expirationDays),
        status: "draft",
      }).returning();
      const options = await tx.insert(estimateOptions).values(settings.estimate.optionLabels.map((label, position) => ({
        orgId, estimateId: estimate.id, label, position, total: job.total,
      }))).returning();
      if (sourceLines.length) {
        await tx.insert(estimateOptionLineItems).values(options.flatMap((option) => sourceLines.map((line) => ({
          orgId,
          optionId: option.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
        }))));
      }
      return estimate;
    });
    if (!result) return reply.code(404).send({ error: "job not found" });
    return reply.code(201).send(await detail(orgId, result.id));
  });

  app.patch("/:id/options/:optionId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, optionId } = req.params as { id: string; optionId: string };
    const parsed = optionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await editableOption(orgId, id, optionId))) return reply.code(409).send({ error: "option is not editable" });
    const [option] = await db.update(estimateOptions).set({ label: parsed.data.label, updatedAt: new Date() })
      .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id), eq(estimateOptions.id, optionId))).returning();
    return option;
  });

  app.post("/:id/options/:optionId/lines", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, optionId } = req.params as { id: string; optionId: string };
    const parsed = lineBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await editableOption(orgId, id, optionId))) return reply.code(409).send({ error: "option is not editable" });
    const [line] = await db.insert(estimateOptionLineItems).values({ orgId, optionId, ...parsed.data }).returning();
    const total = await recomputeOption(orgId, id, optionId);
    return reply.code(201).send({ lineItem: line, total });
  });

  app.patch("/:id/options/:optionId/lines/:lineId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, optionId, lineId } = req.params as { id: string; optionId: string; lineId: string };
    const parsed = linePatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await editableOption(orgId, id, optionId))) return reply.code(409).send({ error: "option is not editable" });
    const [line] = await db.update(estimateOptionLineItems).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(estimateOptionLineItems.orgId, orgId), eq(estimateOptionLineItems.optionId, optionId), eq(estimateOptionLineItems.id, lineId))).returning();
    if (!line) return reply.code(404).send({ error: "line item not found" });
    const total = await recomputeOption(orgId, id, optionId);
    return { lineItem: line, total };
  });

  app.delete("/:id/options/:optionId/lines/:lineId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, optionId, lineId } = req.params as { id: string; optionId: string; lineId: string };
    if (!(await editableOption(orgId, id, optionId))) return reply.code(409).send({ error: "option is not editable" });
    const [line] = await db.delete(estimateOptionLineItems)
      .where(and(eq(estimateOptionLineItems.orgId, orgId), eq(estimateOptionLineItems.optionId, optionId), eq(estimateOptionLineItems.id, lineId))).returning();
    if (!line) return reply.code(404).send({ error: "line item not found" });
    return { ok: true, total: await recomputeOption(orgId, id, optionId) };
  });

  app.post("/:id/send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [estimate] = await db.update(estimates).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id), eq(estimates.status, "draft"))).returning();
    if (!estimate) return reply.code(409).send({ error: "only draft estimates can be marked sent" });
    return estimate;
  });

  app.post("/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = decisionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-approval:${id}`}))`);
      const [estimate] = await tx.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
      if (!estimate) return { kind: "missing" as const };
      const [option] = await tx.select().from(estimateOptions).where(and(
        eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id), eq(estimateOptions.id, parsed.data.optionId),
      ));
      if (!option) return { kind: "option" as const };
      const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId));
      const settings = mergeBusinessSettings(org?.businessSettings);
      try {
        if (estimate.status === "approved") {
          nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
          return { kind: "approved" as const, estimate };
        }
        assertEstimateApprovalAllowed({
          status: estimate.status,
          expiresAt: estimate.expiresAt,
          signatureRequired: settings.estimate.signatureRequired,
          signatureName: parsed.data.signatureName,
        });
        nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
      } catch (error) {
        return { kind: "invalid" as const, error: (error as Error).message };
      }
      const now = new Date();
      const [approved] = await tx.update(estimates).set({
        status: "approved",
        accepted: true,
        acceptedAt: now,
        acceptedByName: parsed.data.signatureName,
        signatureName: parsed.data.signatureName,
        selectedOptionId: option.id,
        total: option.total,
        updatedAt: now,
      }).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id))).returning();
      return { kind: "approved" as const, estimate: approved };
    });
    if (result.kind === "missing") return reply.code(404).send({ error: "not found" });
    if (result.kind === "option") return reply.code(404).send({ error: "option not found" });
    if (result.kind === "invalid") return reply.code(409).send({ error: result.error });
    return result.estimate;
  });

  app.post("/:id/decline", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [estimate] = await db.update(estimates).set({ status: "declined", declinedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id), inArray(estimates.status, ["draft", "sent"]))).returning();
    if (!estimate) return reply.code(409).send({ error: "estimate cannot be declined" });
    return estimate;
  });

  app.post("/:id/copy-approved-to-job", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-copy:${id}`}))`);
      const [estimate] = await tx.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
      if (!estimate) return { kind: "missing" as const };
      if (estimate.status !== "approved" || !estimate.selectedOptionId) return { kind: "invalid" as const };
      if (estimate.copiedToJobAt) return { kind: "copied" as const, total: estimate.total, alreadyCopied: true };
      const optionLines = await tx.select().from(estimateOptionLineItems).where(and(
        eq(estimateOptionLineItems.orgId, orgId), eq(estimateOptionLineItems.optionId, estimate.selectedOptionId),
      ));
      await tx.delete(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, estimate.jobId)));
      if (optionLines.length) await tx.insert(lineItems).values(optionLines.map((line) => ({
        orgId,
        jobId: estimate.jobId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
      })));
      const total = estimateOptionTotal(optionLines);
      await tx.update(jobs).set({ total, updatedAt: new Date() }).where(and(eq(jobs.orgId, orgId), eq(jobs.id, estimate.jobId)));
      await tx.update(estimates).set({ copiedToJobAt: new Date(), updatedAt: new Date() }).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
      return { kind: "copied" as const, total, alreadyCopied: false };
    });
    if (result.kind === "missing") return reply.code(404).send({ error: "not found" });
    if (result.kind === "invalid") return reply.code(409).send({ error: "approve one option before copying work to the job" });
    return { ok: true, total: result.total, alreadyCopied: result.alreadyCopied };
  });

  // Backward-compatible approval endpoint selects the first option but never schedules the job.
  app.post("/:id/accept", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const body = z.object({ customerName: z.string().trim().max(160).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const [option] = await db.select().from(estimateOptions).where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, id))).orderBy(asc(estimateOptions.position)).limit(1);
    if (!option) return reply.code(404).send({ error: "option not found" });
    const [estimate] = await db.select().from(estimates).where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!estimate) return reply.code(404).send({ error: "not found" });
    const [org] = await db.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId));
    const settings = mergeBusinessSettings(org?.businessSettings);
    try {
      if (estimate.status === "approved") {
        nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
        return estimate;
      }
      assertEstimateApprovalAllowed({ status: estimate.status, expiresAt: estimate.expiresAt, signatureRequired: settings.estimate.signatureRequired, signatureName: body.data.customerName });
      nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
    const now = new Date();
    const [approved] = await db.update(estimates).set({ status: "approved", accepted: true, acceptedAt: now, acceptedByName: body.data.customerName, signatureName: body.data.customerName, selectedOptionId: option.id, total: option.total, updatedAt: now })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id), eq(estimates.status, "sent"))).returning();
    return approved;
  });
}
