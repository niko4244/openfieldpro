// Customer portal links. Owner routes (session-authenticated) create, list, and
// revoke links; token routes are anonymous and are authorized by the bearer
// token itself, which is stored only as a SHA-256 hash.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  portalLinks,
  customers,
  orgs,
  invoices,
  payments,
  servicePlans,
  customerServicePlans,
  servicePlanVisits,
} from "@ofp/db";
import { mergeBusinessSettings, type PortalLinkScope } from "@ofp/shared";
import {
  DEFAULT_PORTAL_LINK_TTL_DAYS,
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  hashPortalToken,
  parsePortalLinkScopes,
  portalLinkEncryptionKey,
  portalLinkExpiry,
  portalLinkStatus,
} from "../portal-links.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { resolveJwtSecret, resolvePublicWebUrl } from "../runtime-security.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { renderMessageTemplate } from "../message-templates.js";
import { resolveSmtpConfig, sendEmail } from "../mailer.js";

const createLinkBody = z.object({
  customerId: z.string().uuid(),
  scopes: z.array(z.enum(["balance", "checkout", "receipts", "service_plans"])).min(1),
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
});

const checkoutBody = z.object({ invoiceId: z.string().uuid() });

function portalLinkRow(row: typeof portalLinks.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    sentCount: row.sentCount,
    lastSentAt: row.lastSentAt,
    createdAt: row.createdAt,
  };
}

async function resolveTokenLink(token: string) {
  const tokenHash = hashPortalToken(token);
  const [link] = await db
    .select()
    .from(portalLinks)
    .where(eq(portalLinks.tokenHash, tokenHash))
    .limit(1);
  return link ?? null;
}

const portalSessionRateLimit = createFixedWindowRateLimit({
  max: 60,
  windowMs: 60 * 1000,
  key: (request: FastifyRequest) => `${requestIpKey(request)}:portal`,
});

const portalCheckoutRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 10 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const token = (request.params as { token?: string } | undefined)?.token ?? "unknown";
    return `${requestIpKey(request)}:${token}`;
  },
});

export async function portalRoutes(app: FastifyInstance) {
  // ---- Owner management ---------------------------------------------------
  app.get("/links", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { customerId } = req.query as { customerId?: string };
    if (!customerId) return reply.code(400).send({ error: "customerId query parameter is required" });
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });

    const rows = await db
      .select()
      .from(portalLinks)
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.customerId, customerId)))
      .orderBy(desc(portalLinks.createdAt));
    return rows.map(portalLinkRow);
  });

  app.post("/links", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createLinkBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, parsed.data.customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });

    const scopes = parsePortalLinkScopes(parsed.data.scopes) as PortalLinkScope[];
    if (scopes.length === 0) return reply.code(400).send({ error: "at least one portal view is required" });

    const generated = generatePortalToken();
    const ttl = parsed.data.expiresInDays ?? DEFAULT_PORTAL_LINK_TTL_DAYS;
    // The raw token is stored encrypted (AES-256-GCM under the server secret)
    // so the owner can email the link to the customer later without exposing
    // usable tokens in the database.
    const tokenCipher = encryptPortalToken(generated.token, portalLinkEncryptionKey(resolveJwtSecret()));
    const [row] = await db
      .insert(portalLinks)
      .values({
        orgId,
        customerId: customer.id,
        tokenHash: generated.tokenHash,
        tokenPrefix: generated.tokenPrefix,
        tokenCipher,
        scopes,
        expiresAt: portalLinkExpiry(ttl),
      })
      .returning();

    safeEmitActivity(
      orgId,
      "portal.link_created",
      `Created a customer portal link for ${customer.name} (${scopes.join(", ")})`,
      {},
    );
    return reply.code(201).send({ link: portalLinkRow(row), token: generated.token, ttlDays: ttl });
  });

  app.post("/links/:id/revoke", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(portalLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "portal link not found" });
    safeEmitActivity(orgId, "portal.link_revoked", `Revoked a customer portal link (${row.tokenPrefix})`, {});
    return { ok: true };
  });

  // Emails the customer their signed portal link using the org's message
  // templates. Fails closed when SMTP is unconfigured or the link can't be
  // safely re-derived.
  app.post("/links/:id/send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [link] = await db
      .select()
      .from(portalLinks)
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)));
    if (!link) return reply.code(404).send({ error: "portal link not found" });
    const status = portalLinkStatus(link);
    if (status !== "active") {
      return reply.code(409).send({ error: `cannot email a portal link that ${status === "revoked" ? "has been revoked" : "has expired"}` });
    }
    if (!link.tokenCipher) {
      return reply.code(409).send({ error: "this link predates secure re-sending; create a new portal link" });
    }
    const token = decryptPortalToken(link.tokenCipher, portalLinkEncryptionKey(resolveJwtSecret()));
    if (!token) return reply.code(409).send({ error: "this portal link cannot be recovered for sending; create a new link" });

    const [customer] = await db
      .select({ name: customers.name, email: customers.email })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, link.customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });
    if (!customer.email) return reply.code(409).send({ error: `customer ${customer.name} has no email address on file` });

    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "organization not found" });
    const settings = mergeBusinessSettings(org.businessSettings);
    const smtp = resolveSmtpConfig();
    if (!smtp) {
      return reply.code(501).send({
        error: "email is not configured",
        hint: "Set SMTP_HOST, SMTP_USER, and SMTP_PASS (plus SMTP_FROM) to email portal links.",
      });
    }

    const webOrigin = resolvePublicWebUrl();
    const portalUrl = `${webOrigin}/p/${token}`;
    const variables = {
      companyName: org.name,
      customerName: customer.name,
      portalLink: portalUrl,
      portalExpiresAt: link.expiresAt
        ? new Date(link.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : null,
    };
    const subject = renderMessageTemplate(settings.messages.portalLinkSubject, variables);
    const body = renderMessageTemplate(settings.messages.portalLinkBody, variables);

    const result = await sendEmail({ to: customer.email, subject, text: body });
    if (!result) return reply.code(501).send({ error: "email is not configured" });

    await db
      .update(portalLinks)
      .set({ sentCount: link.sentCount + 1, lastSentAt: new Date() })
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)));
    safeEmitActivity(
      orgId,
      "portal.link_sent",
      `Emailed the customer portal link to ${customer.name} (${customer.email})`,
      {},
    );
    return { ok: true, to: customer.email, messageId: result.messageId, sentAt: new Date().toISOString() };
  });

  // ---- Anonymous token routes ---------------------------------------------
  app.get("/:token", { preHandler: portalSessionRateLimit }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const link = await resolveTokenLink(token);
    if (!link) return reply.code(404).send({ error: "portal link not found" });

    const status = portalLinkStatus(link);
    if (status !== "active") {
      return reply.code(410).send({ error: `portal link ${status === "revoked" ? "has been revoked" : "has expired"}` });
    }

    const [org] = await db.select().from(orgs).where(eq(orgs.id, link.orgId));
    if (!org) return reply.code(404).send({ error: "portal link not found" });
    const settings = mergeBusinessSettings(org.businessSettings);
    if (settings.portal.enabled === false) {
      return reply.code(410).send({ error: "customer portal is disabled by the service company" });
    }

    const [customer] = await db
      .select({ name: customers.name, email: customers.email, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.orgId, link.orgId), eq(customers.id, link.customerId)));
    if (!customer) return reply.code(404).send({ error: "portal link not found" });

    await db
      .update(portalLinks)
      .set({ lastUsedAt: new Date() })
      .where(eq(portalLinks.id, link.id));

    const scopes = parsePortalLinkScopes(link.scopes);
    const invoiceViews = settings.portal.allowInvoicePayment !== false;
    const views: PortalLinkScope[] = [];
    if (invoiceViews) {
      if (scopes.includes("balance")) views.push("balance");
      if (scopes.includes("checkout")) views.push("checkout");
      if (scopes.includes("receipts")) views.push("receipts");
    }
    if (scopes.includes("service_plans")) views.push("service_plans");
    if (views.length === 0) return reply.code(410).send({ error: "this portal link does not grant any views" });

    const orgInvoices = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, link.orgId), eq(invoices.status, "sent")))
      .orderBy(desc(invoices.createdAt));

    const balanceInvoices: Array<{ id: string; number: string; total: number; paid: number; remaining: number; dueAt: string | null }> = [];
    const receipts: Array<{ id: string; number: string; total: number; paidAt: string | null; payments: Array<{ amount: number; method: string; paidAt: string }> }> = [];

    if (invoiceViews) {
      for (const inv of orgInvoices) {
        const paidRows = await db
          .select({ amount: payments.amount, method: payments.method, paidAt: payments.paidAt })
          .from(payments)
          .where(and(eq(payments.orgId, link.orgId), eq(payments.invoiceId, inv.id)))
          .orderBy(asc(payments.paidAt));
        const paid = paidRows.reduce((sum, p) => sum + p.amount, 0);
        const remaining = inv.total - paid;
        if (remaining > 0 && scopes.includes("balance")) {
          balanceInvoices.push({ id: inv.id, number: inv.number, total: inv.total, paid, remaining, dueAt: inv.dueAt ? inv.dueAt.toISOString() : null });
        }
        if (scopes.includes("receipts") && inv.status === "paid") {
          receipts.push({
            id: inv.id,
            number: inv.number,
            total: inv.total,
            paidAt: paidRows.length ? paidRows[paidRows.length - 1].paidAt.toISOString() : null,
            payments: paidRows.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt.toISOString() })),
          });
        }
      }
    }

    const planViews: Array<{
      id: string;
      planName: string;
      status: string;
      visitsIncluded: number;
      visitsCompleted: number;
      renewsAt: string | null;
      nextVisit: { title: string; dueAt: string | null; status: string } | null;
    }> = [];
    if (scopes.includes("service_plans")) {
      const enrollments = await db
        .select()
        .from(customerServicePlans)
        .where(and(eq(customerServicePlans.orgId, link.orgId), eq(customerServicePlans.customerId, link.customerId), eq(customerServicePlans.status, "active")))
        .orderBy(asc(customerServicePlans.createdAt));
      for (const enrollment of enrollments) {
        const [plan] = await db
          .select({ name: servicePlans.name })
          .from(servicePlans)
          .where(and(eq(servicePlans.orgId, link.orgId), eq(servicePlans.id, enrollment.servicePlanId)));
        const [nextVisit] = await db
          .select({ title: servicePlanVisits.title, dueAt: servicePlanVisits.dueAt, status: servicePlanVisits.status })
          .from(servicePlanVisits)
          .where(and(eq(servicePlanVisits.orgId, link.orgId), eq(servicePlanVisits.customerServicePlanId, enrollment.id), eq(servicePlanVisits.status, "planned")))
          .orderBy(asc(servicePlanVisits.dueAt))
          .limit(1);
        planViews.push({
          id: enrollment.id,
          planName: plan?.name ?? "Service plan",
          status: enrollment.status,
          visitsIncluded: enrollment.visitsIncluded,
          visitsCompleted: enrollment.visitsCompleted,
          renewsAt: enrollment.renewsAt ? enrollment.renewsAt.toISOString() : null,
          nextVisit: nextVisit ? { title: nextVisit.title, dueAt: nextVisit.dueAt ? nextVisit.dueAt.toISOString() : null, status: nextVisit.status } : null,
        });
      }
    }

    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
    const totalRemaining = balanceInvoices.reduce((sum, inv) => sum + inv.remaining, 0);

    return {
      org: {
        id: org.id,
        name: org.name,
        logoUrl: org.logoUrl,
        publicEmail: org.publicEmail,
        publicPhone: org.publicPhone,
        publicAddress: org.publicAddress,
        sponsorEnabled: settings.portal.showSponsorSlot !== false,
      },
      customer,
      views,
      balance: {
        invoices: balanceInvoices,
        totalRemaining,
        paymentInstructions: settings.invoice.paymentInstructions,
      },
      checkout: {
        available: invoiceViews && stripeConfigured && settings.payments.onlinePaymentsEnabled !== false,
        totalRemaining,
      },
      receipts,
      servicePlans: planViews,
    };
  });

  app.post("/:token/checkout", { preHandler: portalCheckoutRateLimit }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = checkoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const link = await resolveTokenLink(token);
    if (!link) return reply.code(404).send({ error: "portal link not found" });
    const status = portalLinkStatus(link);
    if (status !== "active") {
      return reply.code(410).send({ error: `portal link ${status === "revoked" ? "has been revoked" : "has expired"}` });
    }

    const scopes = parsePortalLinkScopes(link.scopes);
    if (!scopes.includes("checkout")) return reply.code(403).send({ error: "this portal link does not allow checkout" });

    const [org] = await db.select().from(orgs).where(eq(orgs.id, link.orgId));
    if (!org) return reply.code(404).send({ error: "portal link not found" });
    const settings = mergeBusinessSettings(org.businessSettings);
    if (settings.portal.enabled === false || settings.portal.allowInvoicePayment === false) {
      return reply.code(403).send({ error: "online payment is not available for this portal link" });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !webhookSecret) {
      return reply.code(501).send({
        error: "online payment is not configured",
        hint: settings.invoice.paymentInstructions,
      });
    }

    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, link.orgId), eq(invoices.id, parsed.data.invoiceId)));
    if (!inv) return reply.code(404).send({ error: "invoice not found" });
    if (inv.status === "paid" || inv.status === "void") {
      return reply.code(409).send({ error: `cannot create checkout for a ${inv.status} invoice` });
    }
    const paidRows = await db
      .select({ amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.orgId, link.orgId), eq(payments.invoiceId, inv.id)));
    const paid = paidRows.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.total - paid;
    if (remaining <= 0) return reply.code(409).send({ error: "invoice has no remaining balance" });

    const webOrigin = resolvePublicWebUrl();
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `Invoice ${inv.number}` },
              unit_amount: remaining,
            },
            quantity: 1,
          },
        ],
        success_url: `${webOrigin}/p/${token}?paid=1`,
        cancel_url: `${webOrigin}/p/${token}`,
        metadata: { invoiceId: inv.id, orgId: link.orgId },
      },
      { idempotencyKey: `portal-checkout:${token}:${inv.id}:${remaining}` },
    );
    return { url: session.url };
  });
}
