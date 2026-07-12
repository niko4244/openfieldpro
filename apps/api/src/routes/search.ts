import type { FastifyInstance } from "fastify";
import { eq, and, ilike, inArray } from "drizzle-orm";
import { db, jobs, customers, invoices } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { assignedCustomerIds } from "../field-access.js";

// ponytail: flat text search, no full-text index. Ceiling: slow on large datasets.
// Upgrade: use PostgreSQL tsvector column + GIN index.
export async function searchRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) return { jobs: [], customers: [], invoices: [] };

    const term = `%${q.trim()}%`;
    const visibleCustomerIds = await assignedCustomerIds(orgId, claims);
    const jobConditions = [eq(jobs.orgId, orgId), ilike(jobs.title, term)];
    if (claims.role === "technician") jobConditions.push(eq(jobs.assignedTo, claims.userId));

    const customerPromise = visibleCustomerIds && visibleCustomerIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(
            and(
              eq(customers.orgId, orgId),
              ilike(customers.name, term),
              ...(visibleCustomerIds ? [inArray(customers.id, visibleCustomerIds)] : []),
            ),
          )
          .limit(5);

    const invoicePromise = claims.role === "technician"
      ? Promise.resolve([])
      : db
          .select({ id: invoices.id, number: invoices.number })
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), ilike(invoices.number, term)))
          .limit(5);

    const [jobResults, customerResults, invoiceResults] = await Promise.all([
      db
        .select({ id: jobs.id, title: jobs.title })
        .from(jobs)
        .where(and(...jobConditions))
        .limit(5),
      customerPromise,
      invoicePromise,
    ]);

    return { jobs: jobResults, customers: customerResults, invoices: invoiceResults };
  });
}
