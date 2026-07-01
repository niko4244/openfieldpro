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
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
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
    // Phase 6 — magic-link approval flow. Token is single-use-of-link; high
    // entropy random, stored raw in V1. Kept off the offline-write surface
    // (no version columns needed — only the dispatcher/web sends, only the
    // public endpoint writes signature/accepted).
    approvalToken: text("approval_token"),
    approvalTokenSentAt: timestamp("approval_token_sent_at", {
      withTimezone: true,
    }),
    signatureData: text("signature_data"), // data:image/png;base64,...
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: text("signed_by"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    // Partial unique index: many estimates stay null until /send is called;
    // when set, the token must be globally unique. Distinct estimates sent to
    // different customers cannot collide.
    approvalTokenIdx: uniqueIndex("estimates_approval_token_idx")
      .on(t.approvalToken)
      .where(sql`${t.approvalToken} IS NOT NULL`),
  }),
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
  /* ponytail: RRULE is stored as raw RFC 5545 string (e.g. FREQ=WEEKLY;BYDAY=MO,WE).
     SDKs parse it on read. No client library — clients get the raw string and do
     lightweight parsing.  Ceiling: no recurrence-id support for exceptions.
     Upgrade: store exdates array for individual instance cancellation. */
  rrule: text("rrule"),
  scheduledTime: text("scheduled_time"), /* HH:MM in org timezone, e.g. "14:00" */
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
  reply: text("reply"),
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

// Photo uploads linked to jobs. `object_key` is the unique storage path
// (e.g. "ofp/{orgId}/{uuid}.{ext}"). Files live on local disk in Phase-5a;
// upgrading to S3/R2 requires swapping the uploads module, not the schema.
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: ts(),
  },
  (t) => ({ orgJob: index("photos_org_job_idx").on(t.orgId, t.jobId) }),
);

// Convenience: raw SQL to enable PostGIS (run once; harmless if repeated).
export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis`;

// ── Price-book catalog ──
export const catalogCategories = pgTable("catalog_categories", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: ts(),
});

export const catalogItems = pgTable(
  "catalog_items",
  {
    id: id(),
    orgId: orgId(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => catalogCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").default(0).notNull(),
    costCents: integer("cost_cents").default(0).notNull(),
    taxable: boolean("taxable").default(true).notNull(),
    active: boolean("active").default(true).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgCategory: index("catalog_org_category_idx").on(t.orgId, t.categoryId),
  }),
);

// Customer-owned equipment (HVAC units, water heaters, etc). Linked to a customer
// so techs can see install history, warranty, and service notes at a glance.
// ponytail: no property_id — single-address assumption. Ceiling: some customers
// have multiple properties. Upgrade: add a properties table and link equipment to it.
export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "furnace", "ac_unit", "water_heater"
    make: text("make"),
    model: text("model"),
    serialNumber: text("serial_number"),
    installDate: timestamp("install_date", { withTimezone: true }),
    warrantyExpiry: timestamp("warranty_expiry", { withTimezone: true }),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({
    cust: index("equipment_customer_idx").on(t.orgId, t.customerId),
  }),
);

// In-app notifications for users (job assigned, invoice paid, review received, etc).
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "job.assigned", "invoice.paid", "review.received"
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"), // optional deep-link to the relevant page
    read: boolean("read").default(false).notNull(),
    createdAt: ts(),
  },
  (t) => ({
    user: index("notif_user_idx").on(t.orgId, t.userId, t.createdAt),
    unread: index("notif_unread_idx").on(t.orgId, t.userId, t.read),
  }),
);

// ── Plugin portal (Phase E foundation) ──
// Open integration architecture, the differentiator vs HCP's closed store. A
// plugin is a manifest (`plugins`) an org activates (`plugin_installs`).
// Activation mints a per-install scoped token (`api_tokens`) the plugin uses for
// INBOUND calls; OUTBOUND domain events are delivered to the install's webhook
// as HMAC-signed POSTs and journaled in `plugin_events`.

// Manifest registry. ponytail: global catalog (no org_id) — v1 ships first-party
// plugins shared across orgs. Ceiling: no org-private/custom plugins yet.
// Upgrade: add a nullable org_id (NULL = first-party, set = org-private).
export const plugins = pgTable(
  "plugins",
  {
    id: id(),
    slug: text("slug").notNull(), // stable manifest id, e.g. "twilio-sms"
    name: text("name").notNull(),
    description: text("description"),
    version: text("version").default("1.0.0").notNull(), // semver from plugin.json
    author: text("author"),
    iconUrl: text("icon_url"),
    // Domain events this plugin subscribes to (see PLUGIN_EVENTS in plugins/bus.ts).
    events: text("events").array().notNull().default(sql`'{}'`),
    // OAuth-style scopes the plugin requests, e.g. ["customers:read","jobs:read"].
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    // Default webhook URL from the manifest; an install may override it.
    webhookUrl: text("webhook_url"),
    // Delivery shaper: "generic" POSTs the signed event envelope (default);
    // "slack"/"discord"/"ntfy" format a human message into that target's shape.
    transform: text("transform").default("generic").notNull(),
    firstParty: boolean("first_party").default(false).notNull(),
    createdAt: ts(),
  },
  (t) => ({ slug: uniqueIndex("plugins_slug_idx").on(t.slug) }),
);

// An org's activation of a plugin. Holds per-install config (external API keys,
// prefs), the receiving webhook URL, and the HMAC secret used to sign outbound
// deliveries to THIS install.
export const pluginInstalls = pgTable(
  "plugin_installs",
  {
    id: id(),
    orgId: orgId(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    webhookUrl: text("webhook_url"), // overrides the manifest default
    webhookSecret: text("webhook_secret").notNull(), // whsec_… signing key
    installedAt: ts(),
  },
  (t) => ({
    orgPlugin: uniqueIndex("plugin_installs_org_plugin_idx").on(t.orgId, t.pluginId),
  }),
);

// Scoped API tokens for INBOUND plugin calls. Only the SHA-256 hash is stored;
// the plaintext (ofp_…) is shown exactly once at creation. `prefix` is the first
// chars, kept for display so an owner can identify a token without seeing it.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    orgId: orgId(),
    installId: uuid("install_id").references(() => pluginInstalls.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    hash: uniqueIndex("api_tokens_hash_idx").on(t.tokenHash),
    org: index("api_tokens_org_idx").on(t.orgId),
  }),
);

// Outbound webhook delivery journal — one row per (install, event) attempt.
// ponytail: fire-and-forget, no retry queue. Ceiling: failed deliveries are
// recorded but not retried. Upgrade: a worker that re-delivers `failed`/`pending`
// rows with exponential backoff (transactional outbox).
export const pluginEvents = pgTable(
  "plugin_events",
  {
    id: id(),
    orgId: orgId(),
    installId: uuid("install_id")
      .notNull()
      .references(() => pluginInstalls.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // domain event name, e.g. "invoice.paid"
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").default("pending").notNull(), // pending | delivered | failed | skipped | dead
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // When the retry worker should next attempt this delivery. NULL = terminal
    // (delivered/skipped/dead) or not yet scheduled. See plugins/retry.ts.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    install: index("plugin_events_install_idx").on(t.installId, t.createdAt),
    status: index("plugin_events_status_idx").on(t.orgId, t.status),
    due: index("plugin_events_due_idx").on(t.status, t.nextAttemptAt),
  }),
);
