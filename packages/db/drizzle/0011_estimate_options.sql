DO $$ BEGIN
 CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'sent', 'approved', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "status" "estimate_status" DEFAULT 'draft' NOT NULL;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "selected_option_id" uuid;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "signature_name" text;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "copied_to_job_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "estimates" SET "status" = 'approved' WHERE "accepted" = true AND "status" = 'draft';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_options" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "estimate_id" uuid NOT NULL REFERENCES "estimates"("id") ON DELETE cascade,
 "label" text NOT NULL,
 "position" integer DEFAULT 0 NOT NULL,
 "total" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "estimate_options_position_idx" ON "estimate_options" ("estimate_id", "position");
CREATE INDEX IF NOT EXISTS "estimate_options_org_estimate_idx" ON "estimate_options" ("org_id", "estimate_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_option_line_items" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "option_id" uuid NOT NULL REFERENCES "estimate_options"("id") ON DELETE cascade,
 "description" text NOT NULL,
 "quantity" integer DEFAULT 1 NOT NULL,
 "unit_price" integer DEFAULT 0 NOT NULL,
 "unit_cost" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "estimate_option_lines_org_option_idx" ON "estimate_option_line_items" ("org_id", "option_id");
--> statement-breakpoint
INSERT INTO "estimate_options" ("org_id", "estimate_id", "label", "position", "total")
SELECT e."org_id", e."id", 'Good', 0, e."total"
FROM "estimates" e
WHERE NOT EXISTS (SELECT 1 FROM "estimate_options" o WHERE o."estimate_id" = e."id");
--> statement-breakpoint
INSERT INTO "estimate_option_line_items" ("org_id", "option_id", "description", "quantity", "unit_price", "unit_cost")
SELECT e."org_id", o."id", li."description", li."quantity", li."unit_price", li."unit_cost"
FROM "estimate_options" o
JOIN "estimates" e ON e."id" = o."estimate_id"
JOIN "line_items" li ON li."job_id" = e."job_id" AND li."org_id" = e."org_id"
WHERE o."position" = 0
  AND NOT EXISTS (SELECT 1 FROM "estimate_option_line_items" oli WHERE oli."option_id" = o."id");
--> statement-breakpoint
UPDATE "estimates" e SET "selected_option_id" = o."id"
FROM "estimate_options" o
WHERE e."accepted" = true AND o."estimate_id" = e."id" AND o."position" = 0 AND e."selected_option_id" IS NULL;
