--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN "token_cipher" text;
--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN "sent_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN "last_sent_at" timestamp with time zone;
