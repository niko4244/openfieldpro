import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, invoiceTemplates, invoices, lineItems, orgs, payments } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const templateBody = z.object({
  companyName: z.string().min(1),
  logoUrl: z.string().url().optional().or(z.literal("")),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2463eb"),
  templateStyle: z.enum(["modern", "classic", "compact"]).default("modern"),
  invoicePrefix: z.string().min(1).max(12).default("INV"),
  paymentTerms: z.string().min(1).max(240).default("Due on receipt"),
  memo: z.string().max(500).default("Thank you for your business."),
  footer: z.string().max(500).default("Questions? Contact us before paying."),
  showLineItemPrices: z.boolean().default(true),
  showPaymentHistory: z.boolean().default(true),
});

type Template = typeof invoiceTemplates.$inferSelect;

function fallbackTemplate(orgName: string, orgId: string): Omit<Template, "id" | "updatedAt" | "createdAt"> {
  return {
    orgId,
    companyName: orgName,
    logoUrl: null,
    accentColor: "#2463eb",
    templateStyle: "modern",
    invoicePrefix: "INV",
    paymentTerms: "Due on receipt",
    memo: "Thank you for your business.",
    footer: "Questions? Contact us before paying.",
    showLineItemPrices: true,
    showPaymentHistory: true,
  };
}

async function readTemplate(orgId: string) {
  const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).limit(1);
  if (template) return template;
  const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return fallbackTemplate(org?.name ?? "OpenFieldPro", orgId);
}

function previewPayload(input: {
  template: Omit<Template, "id" | "updatedAt" | "createdAt"> | Template;
  invoice: { id?: string; number: string; status: string; total: number; dueAt?: Date | string | null };
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  paid: number;
}) {
  const balance = Math.max(input.invoice.total - input.paid, 0);
  return {
    template: input.template,
    invoice: input.invoice,
    lineItems: input.items.map((item) => ({ ...item, amount: item.quantity * item.unitPrice })),
    totals: { total: input.invoice.total, paid: input.paid, balance },
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
    const next = { ...parsed.data, logoUrl: parsed.data.logoUrl || null, orgId, updatedAt: new Date() };
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
      const items = await db.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.jobId, invoice.jobId)));
      const paidRows = await db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoice.id)));
      const paid = paidRows.reduce((sum, payment) => sum + payment.amount, 0);
      return previewPayload({ template, invoice, items, paid });
    }

    return previewPayload({
      template,
      invoice: { number: `${template.invoicePrefix}-1042`, status: "draft", total: 38900, dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      items: [
        { description: "Diagnostic labor", quantity: 1, unitPrice: 14900 },
        { description: "Replacement part", quantity: 1, unitPrice: 21000 },
        { description: "Trip and disposal fee", quantity: 1, unitPrice: 3000 },
      ],
      paid: 0,
    });
  });
}
