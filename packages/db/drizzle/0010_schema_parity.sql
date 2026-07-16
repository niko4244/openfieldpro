DO $$ BEGIN
 CREATE TYPE "public"."service_plan_status" AS ENUM('active', 'paused', 'canceled', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."service_visit_status" AS ENUM('planned', 'scheduled', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."correction_severity" AS ENUM('low', 'medium', 'high', 'safety_critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."correction_status" AS ENUM('open', 'triaged', 'in_review', 'fixed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_mode" AS ENUM('field', 'guided', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_session_status" AS ENUM('not_started', 'identification_required', 'workflow_ready', 'testing', 'blocked', 'inconclusive', 'diagnosed', 'escalated', 'under_review', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_step_type" AS ENUM('check', 'decision', 'reference', 'stop');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workflow_lifecycle_status" AS ENUM('draft', 'extracted', 'needs_endpoint_review', 'needs_route_review', 'needs_electrical_review', 'needs_field_review', 'pilot', 'validated', 'published', 'suspended', 'retired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workflow_support_status" AS ENUM('validated', 'pilot', 'experimental', 'unsupported');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "logo_url" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "brand_color" text DEFAULT '#22C55E' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_footer" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_email" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_phone" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_address" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "remove_openfieldpro_attribution" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "reply" text;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plugin_installs' AND column_name='created_at')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plugin_installs' AND column_name='installed_at') THEN
   ALTER TABLE "plugin_installs" RENAME COLUMN "created_at" TO "installed_at";
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" TYPE jsonb USING to_jsonb("scopes");
--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" SET DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "events" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "events" TYPE jsonb USING to_jsonb("events");
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "events" SET DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "scopes" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "scopes" TYPE jsonb USING to_jsonb("scopes");
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "scopes" SET DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "transform" SET DEFAULT 'identity';
--> statement-breakpoint
ALTER TABLE "plugin_events" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_categories" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "name" text NOT NULL,
 "description" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_categories_org_name_idx" ON "catalog_categories" ("org_id", "name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_items" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "category_id" uuid NOT NULL REFERENCES "catalog_categories"("id") ON DELETE cascade,
 "name" text NOT NULL,
 "description" text,
 "price_cents" integer DEFAULT 0 NOT NULL,
 "cost_cents" integer DEFAULT 0 NOT NULL,
 "taxable" boolean DEFAULT true NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_org_active_idx" ON "catalog_items" ("org_id", "active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_category_idx" ON "catalog_items" ("category_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_plans" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "name" text NOT NULL,
 "description" text,
 "included_visits_per_term" integer DEFAULT 2 NOT NULL,
 "term_months" integer DEFAULT 12 NOT NULL,
 "price_cents" integer DEFAULT 0 NOT NULL,
 "priority_scheduling" boolean DEFAULT false NOT NULL,
 "benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "version" integer DEFAULT 1 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plans_org_idx" ON "service_plans" ("org_id", "active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_service_plans" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
 "service_plan_id" uuid NOT NULL REFERENCES "service_plans"("id") ON DELETE restrict,
 "status" "service_plan_status" DEFAULT 'active' NOT NULL,
 "starts_at" timestamp with time zone NOT NULL,
 "renews_at" timestamp with time zone,
 "renewal_reminder_at" timestamp with time zone,
 "visits_included" integer DEFAULT 2 NOT NULL,
 "visits_completed" integer DEFAULT 0 NOT NULL,
 "notes" text,
 "version" integer DEFAULT 1 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_service_plans_customer_idx" ON "customer_service_plans" ("org_id", "customer_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_service_plans_plan_idx" ON "customer_service_plans" ("org_id", "service_plan_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_plan_visits" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "customer_service_plan_id" uuid NOT NULL REFERENCES "customer_service_plans"("id") ON DELETE cascade,
 "job_id" uuid REFERENCES "jobs"("id") ON DELETE set null,
 "title" text NOT NULL,
 "status" "service_visit_status" DEFAULT 'planned' NOT NULL,
 "due_at" timestamp with time zone,
 "completed_at" timestamp with time zone,
 "notes" text,
 "version" integer DEFAULT 1 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plan_visits_plan_idx" ON "service_plan_visits" ("org_id", "customer_service_plan_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plan_visits_due_idx" ON "service_plan_visits" ("org_id", "due_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_workflows" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "name" text NOT NULL, "product_type" text NOT NULL, "make" text, "model_family" text,
 "version_number" integer DEFAULT 1 NOT NULL,
 "support_status" "workflow_support_status" DEFAULT 'experimental' NOT NULL,
 "lifecycle_status" "workflow_lifecycle_status" DEFAULT 'draft' NOT NULL,
 "source_revision" text, "applicability" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "limitations" jsonb DEFAULT '[]'::jsonb NOT NULL, "published_at" timestamp with time zone,
 "retired_at" timestamp with time zone, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_workflows_org_status_idx" ON "diagnostic_workflows" ("org_id", "lifecycle_status", "support_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_workflows_model_idx" ON "diagnostic_workflows" ("org_id", "make", "model_family");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_steps" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "workflow_id" uuid NOT NULL REFERENCES "diagnostic_workflows"("id") ON DELETE cascade,
 "step_key" text NOT NULL, "public_label" text NOT NULL, "sequence" integer DEFAULT 0 NOT NULL,
 "mode" "diagnostic_mode" DEFAULT 'both' NOT NULL, "step_type" "diagnostic_step_type" DEFAULT 'check' NOT NULL,
 "purpose" text, "safety_state" text, "power_state" text, "operating_condition" text, "meter_mode" text,
 "point_1_label" text, "point_1_endpoint" text, "point_2_label" text, "point_2_endpoint" text,
 "connector" text, "pin" text, "wire_color" text, "expected_text" text, "unit" text,
 "pass_interpretation" text, "fail_interpretation" text, "branch_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "accessibility_note" text,
 "validation_status" text DEFAULT 'unreviewed' NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_steps_workflow_key_idx" ON "diagnostic_steps" ("workflow_id", "step_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_steps_sequence_idx" ON "diagnostic_steps" ("workflow_id", "sequence");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_sessions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
 "equipment_id" uuid NOT NULL REFERENCES "equipment"("id") ON DELETE restrict,
 "workflow_id" uuid REFERENCES "diagnostic_workflows"("id") ON DELETE set null,
 "workflow_version" integer, "status" "diagnostic_session_status" DEFAULT 'not_started' NOT NULL,
 "customer_complaint" text, "technician_observation" text, "error_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "service_tests" jsonb DEFAULT '[]'::jsonb NOT NULL, "disposition" text, "summary" text,
 "started_by" uuid REFERENCES "users"("id") ON DELETE set null,
 "started_at" timestamp with time zone DEFAULT now() NOT NULL, "completed_at" timestamp with time zone,
 "version" integer DEFAULT 1 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_org_status_idx" ON "diagnostic_sessions" ("org_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_job_idx" ON "diagnostic_sessions" ("job_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_equipment_idx" ON "diagnostic_sessions" ("equipment_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_measurements" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "session_id" uuid NOT NULL REFERENCES "diagnostic_sessions"("id") ON DELETE cascade,
 "step_id" uuid NOT NULL REFERENCES "diagnostic_steps"("id") ON DELETE restrict,
 "entered_by" uuid REFERENCES "users"("id") ON DELETE set null,
 "value_text" text, "unit" text, "result" text NOT NULL, "note" text,
 "photo_id" uuid REFERENCES "photos"("id") ON DELETE set null, "unable_reason" text,
 "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_measurements_session_idx" ON "diagnostic_measurements" ("session_id", "recorded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_measurements_step_idx" ON "diagnostic_measurements" ("step_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_correction_reports" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "workflow_id" uuid NOT NULL REFERENCES "diagnostic_workflows"("id") ON DELETE cascade,
 "workflow_version" integer NOT NULL,
 "session_id" uuid REFERENCES "diagnostic_sessions"("id") ON DELETE set null,
 "step_id" uuid REFERENCES "diagnostic_steps"("id") ON DELETE set null,
 "reported_by" uuid REFERENCES "users"("id") ON DELETE set null,
 "category" text NOT NULL, "severity" "correction_severity" DEFAULT 'medium' NOT NULL,
 "description" text NOT NULL, "status" "correction_status" DEFAULT 'open' NOT NULL,
 "root_cause" text, "resolution" text, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_corrections_workflow_idx" ON "diagnostic_correction_reports" ("workflow_id", "status", "severity");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_equipment_links" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
 "equipment_id" uuid NOT NULL REFERENCES "equipment"("id") ON DELETE cascade,
 "linked_by" uuid REFERENCES "users"("id") ON DELETE set null,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_equipment_links_job_idx" ON "job_equipment_links" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_equipment_links_equipment_idx" ON "job_equipment_links" ("org_id", "equipment_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trace_routes" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "step_id" uuid NOT NULL REFERENCES "diagnostic_steps"("id") ON DELETE cascade,
 "label" text NOT NULL, "route_kind" text NOT NULL, "endpoint_1" text, "endpoint_2" text,
 "segment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL, "continuity_valid" boolean DEFAULT false NOT NULL,
 "disconnected_islands" integer DEFAULT 0 NOT NULL, "unintended_branches" integer DEFAULT 0 NOT NULL,
 "visual_audit_status" text DEFAULT 'pending' NOT NULL, "validation_notes" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_routes_step_idx" ON "trace_routes" ("step_id");
