CREATE TYPE "public"."milestone_status" AS ENUM('draft', 'ready', 'invoiced', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."proposal_tier" AS ENUM('good', 'better', 'best', 'custom');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('email', 'sms', 'manual');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"tier" "proposal_tier" DEFAULT 'custom' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"included" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_reminder_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"days_after_due" integer DEFAULT 0 NOT NULL,
	"channel" "reminder_channel" DEFAULT 'email' NOT NULL,
	"message" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"company_address" text,
	"company_phone" text,
	"company_email" text,
	"company_website" text,
	"license_number" text,
	"logo_url" text,
	"accent_color" text DEFAULT '#2463eb' NOT NULL,
	"template_style" text DEFAULT 'modern' NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"default_tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"default_discount_cents" integer DEFAULT 0 NOT NULL,
	"payment_terms" text DEFAULT 'Due on receipt' NOT NULL,
	"accepted_payment_methods" text DEFAULT 'Credit card, ACH, cash, check' NOT NULL,
	"late_fee_policy" text DEFAULT 'Late fees may apply to overdue balances.' NOT NULL,
	"memo" text DEFAULT 'Thank you for your business.' NOT NULL,
	"footer" text DEFAULT 'Questions? Contact us before paying.' NOT NULL,
	"terms_and_conditions" text DEFAULT 'All work is subject to the terms agreed before service.' NOT NULL,
	"show_line_item_prices" boolean DEFAULT true NOT NULL,
	"show_payment_history" boolean DEFAULT true NOT NULL,
	"show_company_contact" boolean DEFAULT true NOT NULL,
	"show_customer_details" boolean DEFAULT true NOT NULL,
	"show_service_address" boolean DEFAULT true NOT NULL,
	"show_technician" boolean DEFAULT true NOT NULL,
	"show_tax_and_discount" boolean DEFAULT true NOT NULL,
	"show_terms" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress_invoice_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"invoice_id" uuid,
	"label" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"percent_bps" integer DEFAULT 0 NOT NULL,
	"status" "milestone_status" DEFAULT 'draft' NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"org_id" uuid,
	"invoice_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "accepted_option_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_options" ADD CONSTRAINT "estimate_options_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_options" ADD CONSTRAINT "estimate_options_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_reminder_schedules" ADD CONSTRAINT "invoice_reminder_schedules_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_reminder_schedules" ADD CONSTRAINT "invoice_reminder_schedules_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_invoice_milestones" ADD CONSTRAINT "progress_invoice_milestones_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_invoice_milestones" ADD CONSTRAINT "progress_invoice_milestones_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_invoice_milestones" ADD CONSTRAINT "progress_invoice_milestones_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_options_estimate_idx" ON "estimate_options" USING btree ("org_id","estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_reminders_invoice_idx" ON "invoice_reminder_schedules" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_templates_org_idx" ON "invoice_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "progress_milestones_job_idx" ON "progress_invoice_milestones" USING btree ("org_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_event_uidx" ON "stripe_webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_public_token_uidx" ON "customers" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_public_token_idx" ON "estimates" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_public_token_idx" ON "invoices" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_uidx" ON "invoices" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_idx" ON "payments" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_payment_uidx" ON "payments" USING btree ("org_id","provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotency_uidx" ON "payments" USING btree ("org_id","idempotency_key");