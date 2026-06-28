import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, customers, invoiceTemplates, invoices, jobs, lineItems, orgs, payments, properties, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const templateBody = z.object({
  companyName: z.string().min(1),
  companyAddress: z.string().max(500).optional().or(z.literal("")),
  companyPhone: z.string().max(80).optional().or(z.literal("")),
  companyEmail: z.string().email().optional().or(z.literal("")),
  companyWebsite: z.string().url().optional().or(z.literal("")),
  licenseNumber: z.string().max(120).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2463eb"),
  templateStyle: z.enum(["modern", "classic", "compact"]).default("modern"),
  invoicePrefix: z.string().min(1).max(12).default("INV"),
  defaultTaxRateBps: z.number().int().min(0).max(2000).default(0),
  defaultDiscountCents: z.number().int().min(0).default(0),
  paymentTerms: z.string().min(1).max(240).default("Due on receipt"),
  acceptedPaymentMethods: z.string().min(1).max(240).default("Credit card, ACH, cash, check"),
  lateFeePolicy: z.string().max(300).default("Late fees may apply to overdue balances."),
  memo: z.string().max(500).default("Thank you for your business."),
  footer: z.string().max(500).default("Questions? Contact us before paying."),
  termsAndConditions: z.string().max(1000).default("All work is subject to the terms agreed before service."),
  showLineItemPrices: z.boolean().default(true),
  showPaymentHistory: z.boolean().default(true),
  showCompanyContact: z.boolean().default(true),
  showCustomerDetails: z.boolean().default(true),
  showServiceAddress: z.boolean().default(true),
  showTechnician: z.boolean().default(true),
  showTaxAndDiscount: z.boolean().default(true),
  showTerms: z.boolean().default(true),
});

type Template = typeof invoiceTemplates.$inferSelect;
type TemplateBase = Omit<Template, "id" | "updatedAt" | "createdAt">;

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function fallbackTemplate(orgName: string, orgId: string): TemplateBase {
  return {
    orgId,
    companyName: orgName,
    companyAddress: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    licenseNumber: null,
    logoUrl: null,
    accentColor: "#2463eb",
    templateStyle: "modern",
    invoicePrefix: "INV",
    defaultTaxRateBps: 0,
    defaultDiscountCents: 0,
    paymentTerms: "Due on receipt",
    acceptedPaymentMethods: "Credit card, ACH, cash, check",
    lateFeePolicy: "Late fees may apply to overdue balances.",
    memo: "Thank you for your business.",
    footer: "Questions? Contact us before paying.",
    termsAndConditions: "All work is subject to the terms agreed before service.",
    showLineItemPrices: true,
    showPaymentHistory: true,
    showCompanyContact: true,
    showCustomerDetails: true,
    showServiceAddress: true,
    showTechnician: true,
    showTaxAndDiscount: true,
    showTerms: true,
  };
}

async function readTemplate(orgId: string) {
  const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).limit(1);
  if (template) return template;
  const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return fallbackTemplate(org?.name ?? "OpenFieldPro", orgId);
}

function calculateTotals(input: {
  template: Template | TemplateBase;
  invoice: { total: number; taxRateBps?: number | null; discountCents?: number | null };
  items: Array<{ quantity: number; unitPrice: number; taxable?: boolean | null }>;
  paid: number;
}) {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) || input.invoice.total;
  const discount = Math.min(input.invoice.discountCents ?? input.template.defaultDiscountCents, subtotal);
  const taxableSubtotal = input.items.reduce((sum, item) => sum + (item.taxable === false ? 0 : item.quantity * item.unitPrice), 0) || Math.max(subtotal - discount, 0);
  const taxRateBps = input.invoice.taxRateBps ?? input.template.defaultTaxRateBps;
  const taxableBase = Math.max(taxableSubtotal - discount, 0);
  const tax = Math.round((taxableBase * taxRateBps) / 10000);
  const total = Math.max(subtotal - discount + tax, 0);
  return { subtotal, discount, tax, taxRateBps, total, paid: input.paid, balance: Math.max(total - input.paid, 0) };
}

function previewPayload(input: {
  template: Template | TemplateBase;
  invoice: { id?: string; number: string; status: string; total: number; dueAt?: Date | string | null; createdAt?: Date | string | null; poNumber?: string | null; taxRateBps?: number | null; discountCents?: number | null; lastSentAt?: Date | string | null };
  items: Array<{ description: string; quantity: number; unitPrice: number; taxable?: boolean | null }>;
  paid: number;
  customer?: { name: string; email?: string | null; phone?: string | null } | null;
  property?: { address: string } | null;
  technician?: { name: string; email?: string | null } | null;
}) {
  const totals = calculateTotals(input);
  return {
    template: input.template,
    invoice: input.invoice,
    customer: input.customer ?? null,
    property: input.property ?? null,
    technician: input.technician ?? null,
    lineItems: input.items.map((item) => ({ ...item, amount: item.quantity * item.unitPrice })),
    totals,
  };
}

export async function invoiceTemplateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return readTemplate(orgId);
  });

  app.put("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = templateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const next = {
      ...parsed.data,
      companyAddress: emptyToNull(parsed.data.companyAddress),
      companyPhone: emptyToNull(parsed.data.companyPhone),
      companyEmail: emptyToNull(parsed.data.companyEmail),
      companyWebsite: emptyToNull(parsed.data.companyWebsite),
      licenseNumber: emptyToNull(parsed.data.licenseNumber),
      logoUrl: emptyToNull(parsed.data.logoUrl),
      orgId,
      updatedAt: new Date(),
    };
    const [existing] = await db.select({ id: invoiceTemplates.id }).from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).limit(1);
    if (existing) {
      const [updated] = await db.update(invoiceTemplates).set(next).where(eq(invoiceTemplates.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(invoiceTemplates).values(next).returning();
    return reply.code(201).send(created);
  });

  app.get("/preview", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const template = await readTemplate(orgId);
    const { invoiceId } = req.query as { invoiceId?: string };

    if (invoiceId) {
      const [invoice] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId))).limit(1);
      if (!invoice) return reply.code(404).send({ error: "invoice not found" });
      const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, invoice.jobId))).limit(1);
      const [customer] = job ? await db.select({ name: customers.name, email: customers.email, phone: customers.phone }).from(customers).where(and(eq(customers.orgId, orgId), eq(customers.id, job.customerId))).limit(1) : [];
      const [property] = job?.propertyId ? await db.select({ address: properties.address }).from(properties).where(and(eq(properties.orgId, orgId), eq(properties.id, job.propertyId))).limit(1) : [];
      const [technician] = job?.assignedTo ? await db.select({ name: users.name, email: users.email }).from(users).where(and(eq(users.orgId, orgId), eq(users.id, job.assignedTo))).limit(1) : [];
      const items = await db.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, invoice.jobId)));
      const paidRows = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoice.id)));
      const paid = paidRows.reduce((sum, payment) => sum + payment.amount, 0);
      return previewPayload({ template, invoice, items, paid, customer, property, technician });
    }

    return previewPayload({
      template,
      invoice: {
        number: `${template.invoicePrefix}-1042`,
        status: "draft",
        total: 38900,
        poNumber: "PO-8831",
        taxRateBps: template.defaultTaxRateBps,
        discountCents: template.defaultDiscountCents,
        createdAt: new Date(),
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      customer: { name: "Jordan Miller", email: "jordan@example.com", phone: "(515) 555-0199" },
      property: { address: "123 Maple Street, Ames, IA" },
      technician: { name: "Alex Tech", email: "alex@example.com" },
      items: [
        { description: "Diagnostic labor", quantity: 1, unitPrice: 14900, taxable: true },
        { description: "Replacement part", quantity: 1, unitPrice: 21000, taxable: true },
        { description: "Trip and disposal fee", quantity: 1, unitPrice: 3000, taxable: false },
      ],
      paid: 0,
    });
  });
}
