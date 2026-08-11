--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE cascade,
 "description" text NOT NULL,
 "quantity" integer DEFAULT 1 NOT NULL,
 "unit_price" integer DEFAULT 0 NOT NULL,
 "unit_cost" integer DEFAULT 0 NOT NULL,
 "position" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "invoice_line_items_org_invoice_idx" ON "invoice_line_items" ("org_id", "invoice_id");
--> statement-breakpoint
INSERT INTO "invoice_line_items" ("org_id", "invoice_id", "description", "quantity", "unit_price", "unit_cost", "position", "created_at", "updated_at")
SELECT i."org_id", i."id", li."description", li."quantity", li."unit_price", li."unit_cost",
       row_number() OVER (PARTITION BY i."id" ORDER BY li."created_at", li."id") - 1,
       now(), now()
FROM "invoices" i
JOIN "line_items" li ON li."job_id" = i."job_id" AND li."org_id" = i."org_id"
WHERE NOT EXISTS (SELECT 1 FROM "invoice_line_items" ili WHERE ili."invoice_id" = i."id");
--> statement-breakpoint
UPDATE "invoices" i
SET "total" = s."snapshot_total", "updated_at" = now()
FROM (
  SELECT "invoice_id", SUM("quantity" * "unit_price") AS "snapshot_total"
  FROM "invoice_line_items"
  GROUP BY "invoice_id"
) s
WHERE i."id" = s."invoice_id"
  AND s."snapshot_total" > 0;
