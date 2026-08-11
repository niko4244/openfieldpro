import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs } from "@ofp/db";
import {
  DEFAULT_BUSINESS_SETTINGS,
  mergeBusinessSettings,
  validateMessageTemplate,
  type MessageTemplateKind,
} from "@ofp/shared";
import { resolveOrgId } from "./org.js";
import { deleteOrgLogo, saveOrgLogo } from "../uploads.js";

const time = z.string().regex(/^\d{2}:\d{2}$/);
const documentFormat = z.enum(["email", "envelope"]);
const dueTerm = z.enum(["on_receipt", "work_start", "work_completion", "net_days"]);
const approvalMode = z.enum(["single_option", "multiple_options"]);
const depositMode = z.enum(["none", "fixed", "percent"]);

export const businessSettingsSchema = z.object({
  businessHours: z.object({
    timezone: z.string().min(1).max(80),
    workDays: z.array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).max(7),
    startTime: time,
    endTime: time,
  }).default({
    timezone: DEFAULT_BUSINESS_SETTINGS.businessHours.timezone,
    workDays: ["mon", "tue", "wed", "thu", "fri"],
    startTime: DEFAULT_BUSINESS_SETTINGS.businessHours.startTime,
    endTime: DEFAULT_BUSINESS_SETTINGS.businessHours.endTime,
  }),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  invoice: z.object({
    dueTerm,
    netDays: z.number().int().min(0).max(365),
    format: documentFormat,
    defaultMessage: z.string().max(1000),
    paymentInstructions: z.string().max(1000),
    reminderDays: z.array(z.number().int().min(0).max(365)).max(12),
    visibility: z.object({
      showBusinessInfo: z.boolean(),
      showCustomerInfo: z.boolean(),
      showJobInfo: z.boolean(),
      showLineItems: z.boolean(),
      showLineItemPrices: z.boolean(),
      showPayments: z.boolean(),
      showBalance: z.boolean(),
    }),
  }).default(DEFAULT_BUSINESS_SETTINGS.invoice),
  estimate: z.object({
    expirationDays: z.number().int().min(0).max(365),
    approvalMode,
    signatureRequired: z.boolean(),
    depositMode,
    depositValue: z.number().int().min(0).max(1_000_000_000),
    format: documentFormat,
    defaultMessage: z.string().max(1000),
    optionLabels: z.tuple([
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
    ]),
    visibility: z.object({
      showBusinessInfo: z.boolean(),
      showCustomerInfo: z.boolean(),
      showJobInfo: z.boolean(),
      showLineItems: z.boolean(),
      showLineItemPrices: z.boolean(),
      showOptionSummary: z.boolean(),
    }),
  }).default(DEFAULT_BUSINESS_SETTINGS.estimate),
  payments: z.object({
    onlinePaymentsEnabled: z.boolean(),
    allowManualCash: z.boolean(),
    allowManualCheck: z.boolean(),
    allowManualCard: z.boolean(),
    allowPartialPayments: z.boolean(),
    tipsEnabled: z.boolean(),
  }).default(DEFAULT_BUSINESS_SETTINGS.payments),
  taxes: z.object({
    taxEnabled: z.boolean(),
    taxLabel: z.string().trim().min(1).max(80),
    defaultTaxRateBps: z.number().int().min(0).max(100_000),
    discountsEnabled: z.boolean(),
    defaultDiscountLabel: z.string().trim().min(1).max(80),
  }).default(DEFAULT_BUSINESS_SETTINGS.taxes),
  messages: z.object({
    invoiceEmailSubject: z.string().trim().min(1).max(160),
    invoiceEmailBody: z.string().trim().min(1).max(2000),
    estimateEmailSubject: z.string().trim().min(1).max(160),
    estimateEmailBody: z.string().trim().min(1).max(2000),
    reviewRequestBody: z.string().trim().min(1).max(1000),
    portalLinkSubject: z.string().trim().min(1).max(160),
    portalLinkBody: z.string().trim().min(1).max(2000),
  })
    .default(DEFAULT_BUSINESS_SETTINGS.messages)
    .superRefine((messages, ctx) => {
      // Templates may only reference variables defined for their kind — a
      // typo like {{costumerName}} is a hard save error, not a silent empty.
      const fields: Array<[keyof typeof messages, MessageTemplateKind]> = [
        ["invoiceEmailSubject", "invoice"],
        ["invoiceEmailBody", "invoice"],
        ["estimateEmailSubject", "estimate"],
        ["estimateEmailBody", "estimate"],
        ["portalLinkSubject", "portal_link"],
        ["portalLinkBody", "portal_link"],
        ["reviewRequestBody", "review_request"],
      ];
      for (const [field, kind] of fields) {
        const validation = validateMessageTemplate(messages[field], kind);
        if (validation.unknown.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `unknown variable(s): ${validation.unknown.join(", ")}`,
          });
        }
      }
    }),
  numbering: z.object({
    invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/),
    invoiceNextNumber: z.number().int().min(1).max(999_999_999),
    estimatePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/),
    estimateNextNumber: z.number().int().min(1).max(999_999_999),
  }).default(DEFAULT_BUSINESS_SETTINGS.numbering),
  portal: z.object({
    enabled: z.boolean(),
    showSponsorSlot: z.boolean(),
    allowEstimateApproval: z.boolean(),
    allowInvoicePayment: z.boolean(),
    allowServiceHistory: z.boolean(),
  }).default(DEFAULT_BUSINESS_SETTINGS.portal),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  documentFooter: z.string().nullable().optional(),
  publicEmail: z.string().email().nullable().optional(),
  publicPhone: z.string().nullable().optional(),
  publicAddress: z.string().nullable().optional(),
  removeOpenFieldProAttribution: z.boolean().optional(),
  businessSettings: businessSettingsSchema.optional(),
});

export async function orgSettingsRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { files: 1, fileSize: 2 * 1024 * 1024, fields: 0 } });

  app.get("/me", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!row) return reply.code(404).send({ error: "organization not found" });
    return { ...row, businessSettings: mergeBusinessSettings(row.businessSettings) };
  });

  app.patch("/me", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { businessSettings, ...orgPatch } = parsed.data;
    const [row] = await db
      .update(orgs)
      .set({
        ...orgPatch,
        ...(businessSettings ? { businessSettings } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orgs.id, orgId))
      .returning();
    if (!row) return reply.code(404).send({ error: "organization not found" });
    return { ...row, businessSettings: mergeBusinessSettings(row.businessSettings) };
  });

  app.post("/logo", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    try {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no logo uploaded" });
      await saveOrgLogo(orgId, { stream: file.file, filenameHint: file.filename ?? null });
      const publicApiOrigin = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.hostname}`).replace(/\/$/, "");
      const logoUrl = `${publicApiOrigin}/api/public/${orgId}/logo?v=${Date.now()}`;
      const [row] = await db.update(orgs).set({ logoUrl, updatedAt: new Date() }).where(eq(orgs.id, orgId)).returning();
      if (!row) {
        await deleteOrgLogo(orgId);
        return reply.code(404).send({ error: "organization not found" });
      }
      return reply.code(201).send({ ...row, businessSettings: mergeBusinessSettings(row.businessSettings) });
    } catch (error) {
      const uploadError = error as { statusCode?: number; code?: string; message?: string } | null;
      if (uploadError?.statusCode) return reply.code(uploadError.statusCode).send({ error: uploadError.message ?? "logo upload failed" });
      if (uploadError?.code?.includes("TOO_LARGE")) return reply.code(413).send({ error: "logo exceeds the 2 MB size limit" });
      req.log.error({ err: error }, "organization logo upload failed");
      return reply.code(500).send({ error: "internal error" });
    }
  });

  app.delete("/logo", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteOrgLogo(orgId);
    const [row] = await db.update(orgs).set({ logoUrl: null, updatedAt: new Date() }).where(eq(orgs.id, orgId)).returning();
    if (!row) return reply.code(404).send({ error: "organization not found" });
    return { ...row, businessSettings: mergeBusinessSettings(row.businessSettings) };
  });
}
