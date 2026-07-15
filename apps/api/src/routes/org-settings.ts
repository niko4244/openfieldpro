import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs } from "@ofp/db";
import { DEFAULT_BUSINESS_SETTINGS, mergeBusinessSettings } from "@ofp/shared";
import { resolveOrgId } from "./org.js";

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
  }).default(DEFAULT_BUSINESS_SETTINGS.messages),
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
}
