// OpenFieldPro relational schema — the field-service domain.
// Multi-tenant (org_id everywhere). Money stored as integer cents.
//
// Phase-1 modules covered: orgs, users/technicians, customers, properties,
// jobs (work orders), line items, estimates, invoices, payments, appointments.
// Each table mirrors a HouseCall Pro concept so the remaining UI is mechanical.
//
// Phase-5a PR 1: added `version` + `updated_at` to 7 tables for LWW sync
// conflict detection. The 4 hot-path tables (jobs, line_items, invoices,
// appointments) flipped to `idClient()` — mobile supplies the UUID so
// writes can be queued offline without a server round-trip.

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
// Phase-5a PR 1: every LWW-tracked table carries `version` (integer, default 1)
// and `updated_at` (BEFORE UPDATE trigger auto-bumps both — see migration
// `0001_add_version_cols.sql`).
// Ponytail: hot-path tables keep `defaultRandom()` on `id`. Mobile offline
// writes supply their own UUID; server routes omit `id` and rely on the
// default. Both paths share one schema with zero route changes.
const version = () => integer("version").default(1).notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  createdAt: ts(),
});

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
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({ orgIdx: index("customers_org_idx").on(t.orgId) }),
);

// Service location(s) for a customer. lat/lng kept as numerics for now;
// PostGIS geometry is available in the image for a later routing/dispatch upgrade.
// Phase-5a: not in the offline-write surface, so no version columns.
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
    total: integer("total").default(0).notNull(), // cents, denormalized from line items
    laborCostCents: integer("labor_cost_cents").default(0).notNull(), // tech labor cost for margin
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("jobs_org_status_idx").on(t.orgId, t.status),
    sched: index("jobs_scheduled_idx").on(t.scheduledAt),
  }),
);

// Line items belong to a job; estimates and invoices reference the job.
// `unitCost` is what the item costs the business (materials/labor) — the basis
// for per-job margin, the thing most low-end CRMs never surface.
export const lineItems = pgTable("line_items", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: integer("unit_price").default(0).notNull(), // cents charged
  unitCost: integer("unit_cost").default(0).notNull(), // cents it costs us
  version: version(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const estimates = pgTable("estimates", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  total: integer("total").default(0).notNull(),
  accepted: boolean("accepted").default(false).notNull(),
  version: version(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    status: invoiceStatus("status").default("draft").notNull(),
    total: integer("total").default(0).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
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
  amount: integer("amount").notNull(), // cents
  method: text("method").default("manual").notNull(), // manual | card | cash | check
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  version: version(),
  updatedAt: updatedAt(),
});

// Recurring job templates (e.g. quarterly maintenance). A worker materializes
// the next concrete job from `nextRunAt`. interval is ISO-ish: days between runs.
// Phase-5a: not in the offline-write surface.
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

// Customer reviews, requested after a job completes. rating 1–5.
// Phase-5a: not in the offline-write surface.
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

// Unified activity timeline — every meaningful touch on a customer/job in one
// place. The thing CRMs scatter across tabs; here it's one queryable log so an
// owner can see a customer's whole history at a glance.
// Phase-5a: not in the offline-write surface (always server-emitted).
export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // job.created | job.scheduled | invoice.sent | payment.received | review.left | comms.sent ...
    summary: text("summary").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    cust: index("activities_customer_idx").on(t.orgId, t.customerId, t.createdAt),
    job: index("activities_job_idx").on(t.jobId),
  }),
);

// Calendar/dispatch slots. A job can have one appointment in Phase 1.
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
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({ window: index("appts_window_idx").on(t.orgId, t.startsAt) }),
);

// Convenience: raw SQL to enable PostGIS (run once; harmless if repeated).
export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis`;
