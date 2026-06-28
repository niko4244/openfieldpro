// OpenFieldPro relational schema — the field-service domain.
// Multi-tenant (org_id everywhere). Money stored as integer cents.
//
// Phase-1 modules covered: orgs, users/technicians, customers, properties,
// jobs (work orders), line items, estimates, invoices, payments, appointments.
// Each table mirrors a field-service workflow concept so the remaining UI is mechanical.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "lead",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);
export const userRole = pgEnum("user_role", ["owner", "dispatcher", "technician"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  createdAt: ts(),
});

export const invoiceTemplates = pgTable(
  "invoice_templates",
  {
    id: id(),
    orgId: orgId(),
    companyName: text("company_name").notNull(),
    companyAddress: text("company_address"),
    companyPhone: text("company_phone"),
    companyEmail: text("company_email"),
    companyWebsite: text("company_website"),
    licenseNumber: text("license_number"),
    logoUrl: text("logo_url"),
    accentColor: text("accent_color").default("#2463eb").notNull(),
    templateStyle: text("template_style").default("modern").notNull(),
    invoicePrefix: text("invoice_prefix").default("INV").notNull(),
    defaultTaxRateBps: integer("default_tax_rate_bps").default(0).notNull(),
    defaultDiscountCents: integer("default_discount_cents").default(0).notNull(),
    paymentTerms: text("payment_terms").default("Due on receipt").notNull(),
    acceptedPaymentMethods: text("accepted_payment_methods").default("Credit card, ACH, cash, check").notNull(),
    lateFeePolicy: text("late_fee_policy").default("Late fees may apply to overdue balances.").notNull(),
    memo: text("memo").default("Thank you for your business.").notNull(),
    footer: text("footer").default("Questions? Contact us before paying.").notNull(),
    termsAndConditions: text("terms_and_conditions").default("All work is subject to the terms agreed before service.").notNull(),
    showLineItemPrices: boolean("show_line_item_prices").default(true).notNull(),
    showPaymentHistory: boolean("show_payment_history").default(true).notNull(),
    showCompanyContact: boolean("show_company_contact").default(true).notNull(),
    showCustomerDetails: boolean("show_customer_details").default(true).notNull(),
    showServiceAddress: boolean("show_service_address").default(true).notNull(),
    showTechnician: boolean("show_technician").default(true).notNull(),
    showTaxAndDiscount: boolean("show_tax_and_discount").default(true).notNull(),
    showTerms: boolean("show_terms").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: ts(),
  },
  (t) => ({ orgIdx: index("invoice_templates_org_idx").on(t.orgId) }),
);

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: orgId(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").default("technician").notNull(),
    passwordHash: text("password_hash"),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
  },
  (t) => ({ orgEmail: index("users_org_email_idx").on(t.orgId, t.email) }),
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({ orgIdx: index("customers_org_idx").on(t.orgId) }),
);

// Service location(s) for a customer. lat/lng kept as numerics for now;
// PostGIS geometry is available in the image for a later routing/dispatch upgrade.
export const properties = pgTable("properties", {
  id: id(),
  orgId: orgId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  lat: text("lat"),
  lng: text("lng"),
  createdAt: ts(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: jobStatus("status").default("lead").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    total: integer("total").default(0).notNull(),
    laborCostCents: integer("labor_cost_cents").default(0).notNull(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("jobs_org_status_idx").on(t.orgId, t.status),
    sched: index("jobs_scheduled_idx").on(t.scheduledAt),
  }),
);

export const lineItems = pgTable("line_items", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: integer("unit_price").default(0).notNull(),
  unitCost: integer("unit_cost").default(0).notNull(),
  taxable: boolean("taxable").default(true).notNull(),
  createdAt: ts(),
});

export const estimates = pgTable(
  "estimates",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    total: integer("total").default(0).notNull(),
    accepted: boolean("accepted").default(false).notNull(),
    publicToken: text("public_token"),
    createdAt: ts(),
  },
  (t) => ({ publicTokenIdx: index("estimates_public_token_idx").on(t.publicToken) }),
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    poNumber: text("po_number"),
    status: invoiceStatus("status").default("draft").notNull(),
    total: integer("total").default(0).notNull(),
    taxRateBps: integer("tax_rate_bps").default(0).notNull(),
    discountCents: integer("discount_cents").default(0).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({ orgStatus: index("invoices_org_status_idx").on(t.orgId, t.status) }),
);

export const payments = pgTable("payments", {
  id: id(),
  orgId: orgId(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  method: text("method").default("manual").notNull(),
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recurringJobs = pgTable("recurring_jobs", {
  id: id(),
  orgId: orgId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  intervalDays: integer("interval_days").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
});

export const reviews = pgTable("reviews", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: ts(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    cust: index("activities_customer_idx").on(t.orgId, t.customerId, t.createdAt),
    job: index("activities_job_idx").on(t.jobId),
  }),
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    technicianId: uuid("technician_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: ts(),
  },
  (t) => ({ window: index("appts_window_idx").on(t.orgId, t.startsAt) }),
);

export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis`;
