--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pricing" jsonb;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "pricing" jsonb;
--> statement-breakpoint
ALTER TABLE "estimate_options" ADD COLUMN "pricing" jsonb;
