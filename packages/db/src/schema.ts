// OpenFieldPro relational schema — the field-service domain.
// Multi-tenant (org_id everywhere). Money stored as integer cents.
//
// Phase-1 modules covered: orgs, users/technicians, customers, properties,
// jobs (work orders), line items, estimates, invoices, payments, appointments.
// Each table maps to a practical field-service workflow so the remaining UI is mechanical.
//
// Phase-5a PR 1: added `version` + `updated_at` to hot-path tables for LWW sync
// conflict detection. Mobile can supply UUIDs so writes can be queued offline
// without a server round-trip.

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
  customType,
} from "drizzle-orm/pg-core";

// drizzle 0.45 does not ship a bytea column type; define one mapping Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value: Buffer) => value,
  fromDriver: (value: Buffer) => value,
});
import type { PortalLinkScope } from "@ofp/shared";

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
export const estimateStatus = pgEnum("estimate_status", [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
]);
export const userRole = pgEnum("user_role", ["owner", "dispatcher", "technician"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").default("#22C55E").notNull(),
  documentFooter: text("document_footer"),
  publicEmail: text("public_email"),
  publicPhone: text("public_phone"),
  publicAddress: text("public_address"),
  removeOpenFieldProAttribution: boolean("remove_openfieldpro_attribution").default(false).notNull(),
  businessSettings: jsonb("business_settings").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  updatedAt: updatedAt(),
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
    version: version(),
    updatedAt: updatedAt(),
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
  number: text("number").notNull().default("EST-1000"),
  total: integer("total").default(0).notNull(),
  accepted: boolean("accepted").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByName: text("accepted_by_name"),
  status: estimateStatus("status").default("draft").notNull(),
  selectedOptionId: uuid("selected_option_id"),
  signatureName: text("signature_name"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  copiedToJobAt: timestamp("copied_to_job_at", { withTimezone: true }),
  depositCents: integer("deposit_cents").default(0).notNull(),
  depositInvoiceId: uuid("deposit_invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  version: version(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const estimateOptions = pgTable(
  "estimate_options",
  {
    id: id(),
    orgId: orgId(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").default(0).notNull(),
    total: integer("total").default(0).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    estimatePosition: uniqueIndex("estimate_options_position_idx").on(t.estimateId, t.position),
    orgEstimate: index("estimate_options_org_estimate_idx").on(t.orgId, t.estimateId),
  }),
);

export const estimateOptionLineItems = pgTable(
  "estimate_option_line_items",
  {
    id: id(),
    orgId: orgId(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => estimateOptions.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPrice: integer("unit_price").default(0).notNull(),
    unitCost: integer("unit_cost").default(0).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({ orgOption: index("estimate_option_lines_org_option_idx").on(t.orgId, t.optionId) }),
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

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPrice: integer("unit_price").default(0).notNull(),
    unitCost: integer("unit_cost").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({ orgInvoice: index("invoice_line_items_org_invoice_idx").on(t.orgId, t.invoiceId) }),
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
  version: version(),
  updatedAt: updatedAt(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    technicianId: uuid("technician_id").references(() => users.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStart: index("appointments_org_starts_idx").on(t.orgId, t.startsAt),
    job: index("appointments_job_idx").on(t.jobId),
  }),
);

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
  rrule: text("rrule"),
  scheduledTime: text("scheduled_time"),
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
  reply: text("reply"),
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

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey(),
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
  (t) => ({ job: index("photos_job_idx").on(t.orgId, t.jobId) }),
);

export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    make: text("make"),
    model: text("model"),
    serialNumber: text("serial_number"),
    installDate: timestamp("install_date", { withTimezone: true }),
    warrantyExpiry: timestamp("warranty_expiry", { withTimezone: true }),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({ customer: index("equipment_customer_idx").on(t.orgId, t.customerId) }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    read: boolean("read").default(false).notNull(),
    createdAt: ts(),
  },
  (t) => ({ userUnread: index("notifications_user_unread_idx").on(t.userId, t.read, t.createdAt) }),
);

export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: ts(),
  },
  (t) => ({ orgName: uniqueIndex("catalog_categories_org_name_idx").on(t.orgId, t.name) }),
);

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
    createdAt: ts(),
  },
  (t) => ({
    orgActive: index("catalog_items_org_active_idx").on(t.orgId, t.active),
    category: index("catalog_items_category_idx").on(t.categoryId),
  }),
);

export const plugins = pgTable(
  "plugins",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    version: text("version").default("1.0.0").notNull(),
    author: text("author"),
    iconUrl: text("icon_url"),
    webhookUrl: text("webhook_url"),
    events: jsonb("events").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    scopes: jsonb("scopes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    transform: text("transform").default("identity").notNull(),
    firstParty: boolean("first_party").default(false).notNull(),
    createdAt: ts(),
  },
  (t) => ({ slug: uniqueIndex("plugins_slug_idx").on(t.slug) }),
);

export const pluginInstalls = pgTable(
  "plugin_installs",
  {
    id: id(),
    orgId: orgId(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgPlugin: uniqueIndex("plugin_installs_org_plugin_idx").on(t.orgId, t.pluginId) }),
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    orgId: orgId(),
    installId: uuid("install_id").references(() => pluginInstalls.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({ tokenHash: uniqueIndex("api_tokens_hash_idx").on(t.tokenHash) }),
);

export const pluginEvents = pgTable(
  "plugin_events",
  {
    id: id(),
    orgId: orgId(),
    installId: uuid("install_id")
      .notNull()
      .references(() => pluginInstalls.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    install: index("plugin_events_install_idx").on(t.installId, t.createdAt),
    retry: index("plugin_events_retry_idx").on(t.status, t.nextAttemptAt),
  }),
);

export const portalLinks = pgTable(
  "portal_links",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenCipher: text("token_cipher"),
    scopes: jsonb("scopes").$type<PortalLinkScope[]>().default(sql`'[]'::jsonb`).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    sentCount: integer("sent_count").default(0).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    tokenHash: uniqueIndex("portal_links_hash_idx").on(t.tokenHash),
    orgCustomer: index("portal_links_org_customer_idx").on(t.orgId, t.customerId),
  }),
);

export const messageLogs = pgTable(
  "message_logs",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind").notNull(),
    documentId: uuid("document_id").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    messageId: text("message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgDocument: index("message_logs_org_document_idx").on(t.orgId, t.kind, t.documentId),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind").notNull(),
    documentId: uuid("document_id").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    // Generated server-side and immutable once stored, so the bytea lives in
    // the database and is covered by database backups.
    data: bytea("data").notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgDocument: uniqueIndex("documents_org_kind_document_idx").on(t.orgId, t.kind, t.documentId),
  }),
);
