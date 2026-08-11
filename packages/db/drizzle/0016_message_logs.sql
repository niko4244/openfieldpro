--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "message_logs_org_document_idx" ON "message_logs" ("org_id","kind","document_id");
