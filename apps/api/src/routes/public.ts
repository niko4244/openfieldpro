import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, orgs, customers, jobs, estimates, estimateOptions, lineItems, invoices, payments, invoiceTemplates, properties } from "@ofp/db";
import { safeEmitActivity } from "../activities.js";
import { buildInvoicePdf } from "../invoice-pdf.js";

const bookBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
});

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

function newPublicToken(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

async function ensureCustomerPortalToken(customer: { id: string; orgId: string; publicToken?: string | null }) {
  if (customer.publicToken) return customer.publicToken;
  const publicToken = newPublicToken("cust");
  await db.update(customers).set({ publicToken }).where(and(eq(customers.orgId, customer.orgId), eq(customers.id, customer.id)));
  return publicToken;
}

async function publicInvoiceByToken(token: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice || invoice.status === "void") return null;
  const [job] = await db
    .select({ id: jobs.id, title: jobs.title, description: jobs.description, customerId: jobs.customerId, propertyId: jobs.propertyId, orgId: jobs.orgId })
    .from(jobs)
    .where(and(eq(jobs.orgId, invoice.orgId), eq(jobs.id, invoice.jobId)));
  if (!job) return null;
  const [customer] = await db
    .select({ id: customers.id, orgId: customers.orgId, publicToken: customers.publicToken, name: customers.name, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.orgId, invoice.orgId), eq(customers.id, job.customerId)));
  const [property] = job.propertyId
    ? await db.select({ address: properties.address }).from(properties).where(and(eq(properties.orgId, invoice.orgId), eq(properties.id, job.propertyId))).limit(1)
    : [];
  const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, invoice.orgId));
  const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, invoice.orgId)).limit(1);
  const items = await db
    .select({ description: lineItems.description, quantity: lineItems.quantity, unitPrice: lineItems.unitPrice, taxable: lineItems.taxable })
    .from(lineItems)
    .where(and(eq(lineItems.orgId, invoice.orgId), eq(lineItems.jobId, invoice.jobId)));
  const paymentRows = await db
    .select({ id: payments.id, amount: payments.amount, method: payments.method, paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.orgId, invoice.orgId), eq(payments.invoiceId, invoice.id)));
  const paid = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(invoice.total - paid, 0);
  const portalToken = customer ? await ensureCustomerPortalToken(customer) : null;
  const portalUrl = portalToken ? `${publicAppUrl()}/public/customer/${portalToken}` : null;
  return { invoice, job, customer: customer ? { ...customer, publicToken: portalToken } : null, property, org, template, lineItems: items, payments: paymentRows, totals: { paid, balance }, portalToken, portalUrl };
}

async function publicCustomerByToken(token: string) {
  const [customer] = await db
    .select({ id: customers.id, orgId: customers.orgId, publicToken: customers.publicToken, name: customers.name, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(eq(customers.publicToken, token));
  if (!customer) return null;
  const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, customer.orgId));
  const jobRows = await db
    .select({ id: jobs.id, title: jobs.title, description: jobs.description, status: jobs.status, total: jobs.total, scheduledAt: jobs.scheduledAt, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.orgId, customer.orgId), eq(jobs.customerId, customer.id)))
    .orderBy(desc(jobs.createdAt));
  const jobIds = new Set(jobRows.map((job) => job.id));
  const invoiceRows = (await db.select().from(invoices).where(eq(invoices.orgId, customer.orgId)).orderBy(desc(invoices.createdAt)))
    .filter((invoice) => jobIds.has(invoice.jobId) && invoice.status !== "void");
  const paymentRows = await db
    .select({ id: payments.id, invoiceId: payments.invoiceId, amount: payments.amount, method: payments.method, paidAt: payments.paidAt })
    .from(payments)
    .where(eq(payments.orgId, customer.orgId));
  const paidByInvoice = new Map<string, number>();
  for (const payment of paymentRows) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
  const invoicesWithBalances = invoiceRows.map((invoice) => {
    const paid = paidByInvoice.get(invoice.id) ?? 0;
    return {
      id: invoice.id,
      number: invoice.number,
      status: Math.max(invoice.total - paid, 0) <= 0 ? "paid" : invoice.status,
      total: invoice.total,
      paid,
      balance: Math.max(invoice.total - paid, 0),
      dueAt: invoice.dueAt,
      createdAt: invoice.createdAt,
      publicToken: invoice.publicToken,
      publicUrl: invoice.publicToken ? `${publicAppUrl()}/public/invoices/${invoice.publicToken}` : null,
      jobId: invoice.jobId,
    };
  });
  const totals = invoicesWithBalances.reduce(
    (acc, invoice) => ({ totalBilled: acc.totalBilled + invoice.total, totalPaid: acc.totalPaid + invoice.paid, totalBalance: acc.totalBalance + invoice.balance }),
    { totalBilled: 0, totalPaid: 0, totalBalance: 0 },
  );
  return { customer, org, jobs: jobRows, invoices: invoicesWithBalances, payments: paymentRows, totals };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/estimates/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [estimate] = await db.select().from(estimates).where(eq(estimates.publicToken, token));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });

    const [job] = await db
      .select({ id: jobs.id, title: jobs.title, description: jobs.description, customerId: jobs.customerId, orgId: jobs.orgId })
      .from(jobs)
      .where(and(eq(jobs.orgId, estimate.orgId), eq(jobs.id, estimate.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.orgId, estimate.orgId), eq(customers.id, job.customerId)));
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, estimate.orgId));
    const items = await db
      .select({ description: lineItems.description, quantity: lineItems.quantity, unitPrice: lineItems.unitPrice })
      .from(lineItems)
      .where(and(eq(lineItems.orgId, estimate.orgId), eq(lineItems.jobId, estimate.jobId)));
    const options = await db
      .select()
      .from(estimateOptions)
      .where(and(eq(estimateOptions.orgId, estimate.orgId), eq(estimateOptions.estimateId, estimate.id)))
      .orderBy(estimateOptions.sortOrder);

    return { estimate, job, customer, org, lineItems: items, options };
  });

  app.post("/estimates/:token/options/:optionId/accept", async (req, reply) => {
    const { token, optionId } = req.params as { token: string; optionId: string };
    const [estimate] = await db.select().from(estimates).where(eq(estimates.publicToken, token));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    const [option] = await db.select().from(estimateOptions).where(and(eq(estimateOptions.orgId, estimate.orgId), eq(estimateOptions.estimateId, estimate.id), eq(estimateOptions.id, optionId)));
    if (!option) return reply.code(404).send({ error: "option not found" });
    if (!estimate.accepted || estimate.acceptedOptionId !== option.id) {
      await db.update(estimates).set({ accepted: true, acceptedOptionId: option.id, total: option.total }).where(and(eq(estimates.orgId, estimate.orgId), eq(estimates.id, estimate.id)));
      await db.update(jobs).set({ status: "scheduled", total: option.total }).where(and(eq(jobs.orgId, estimate.orgId), eq(jobs.id, estimate.jobId)));
      safeEmitActivity(
        estimate.orgId,
        "estimate.option.accepted.public",
        `Customer accepted ${option.title} option for $${(option.total / 100).toFixed(2)}`,
        { jobId: estimate.jobId },
      );
    }
    return { ...estimate, accepted: true, acceptedOptionId: option.id, total: option.total, acceptedOption: option, jobStatus: "scheduled" };
  });

  app.post("/estimates/:token/accept", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [estimate] = await db.select().from(estimates).where(eq(estimates.publicToken, token));
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    if (estimate.accepted) return { ...estimate, jobStatus: "scheduled" };

    const [accepted] = await db
      .update(estimates)
      .set({ accepted: true })
      .where(and(eq(estimates.orgId, estimate.orgId), eq(estimates.id, estimate.id)))
      .returning();
    await db.update(jobs).set({ status: "scheduled" }).where(and(eq(jobs.orgId, estimate.orgId), eq(jobs.id, estimate.jobId)));
    safeEmitActivity(
      estimate.orgId,
      "estimate.accepted.public",
      `Customer accepted estimate for $${(estimate.total / 100).toFixed(2)}`,
      { jobId: estimate.jobId },
    );
    return { ...accepted, jobStatus: "scheduled" };
  });

  app.get("/invoices/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const data = await publicInvoiceByToken(token);
    if (!data) return reply.code(404).send({ error: "invoice not found" });
    return data;
  });

  app.get("/invoices/:token.pdf", async (req, reply) => {
    const { token } = req.params as { token: string };
    const data = await publicInvoiceByToken(token);
    if (!data) return reply.code(404).send({ error: "invoice not found" });
    const pdf = buildInvoicePdf({
      template: data.template ?? { companyName: data.org?.name ?? "OpenFieldPro" },
      invoice: data.invoice,
      customer: data.customer,
      property: data.property,
      items: data.lineItems,
      paid: data.totals.paid,
    });
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `attachment; filename=${data.invoice.number}.pdf`);
    return pdf;
  });

  app.post("/invoices/:token/checkout", async (req, reply) => {
    const { token } = req.params as { token: string };
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return reply.code(501).send({ error: "Stripe not configured" });
    const data = await publicInvoiceByToken(token);
    if (!data) return reply.code(404).send({ error: "invoice not found" });
    if (data.totals.balance <= 0 || data.invoice.status === "paid") return reply.code(400).send({ error: "invoice already paid" });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const origin = publicAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Invoice ${data.invoice.number}` },
            unit_amount: data.totals.balance,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/public/invoices/${token}?paid=1`,
      cancel_url: `${origin}/public/invoices/${token}`,
      metadata: { invoiceId: data.invoice.id, orgId: data.invoice.orgId, publicToken: token },
    });
    return { url: session.url };
  });

  app.get("/customer-portal/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const data = await publicCustomerByToken(token);
    if (!data) return reply.code(404).send({ error: "customer portal not found" });
    return data;
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  app.post("/:orgId/book", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const parsed = bookBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });

    const { name, email, phone, title, description } = parsed.data;
    const [customer] = await db.insert(customers).values({ orgId, name, email, phone, publicToken: newPublicToken("cust") }).returning();
    const [job] = await db
      .insert(jobs)
      .values({ orgId, customerId: customer.id, title, description, status: "lead" })
      .returning();
    return reply.code(201).send({ ok: true, requestId: job.id, portalUrl: customer.publicToken ? `${publicAppUrl()}/public/customer/${customer.publicToken}` : null });
  });
}
