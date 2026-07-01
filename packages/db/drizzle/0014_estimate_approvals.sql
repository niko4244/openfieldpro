-- Phase 6: Estimate magic-link approval (manual migration, matches 0012/0013 style)
-- Adds approval_token + signature columns to `estimates`.
-- Partial unique index on approval_token (only enforced when set).

ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approval_token" text;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approval_token_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "signature_data" text;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "signed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "signed_by" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estimates_approval_token_idx"
  ON "estimates" USING btree ("approval_token")
  WHERE "approval_token" IS NOT NULL;
