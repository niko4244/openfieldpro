--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "deposit_invoice_id" uuid REFERENCES "invoices"("id") ON DELETE SET NULL;
