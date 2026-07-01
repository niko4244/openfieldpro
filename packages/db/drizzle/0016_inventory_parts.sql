-- Phase 8a: Inventory & Parts.
-- Uses catalog_items as the canonical parts catalog and adds current stock plus
-- an append-only adjustment ledger.

CREATE TABLE IF NOT EXISTS "inventory_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "catalog_item_id" uuid NOT NULL REFERENCES "catalog_items"("id") ON DELETE CASCADE,
  "quantity_on_hand" integer DEFAULT 0 NOT NULL,
  "reorder_point" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_levels_org_item_idx"
  ON "inventory_levels"("org_id","catalog_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_levels_org_idx"
  ON "inventory_levels"("org_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "catalog_item_id" uuid NOT NULL REFERENCES "catalog_items"("id") ON DELETE CASCADE,
  "delta" integer NOT NULL,
  "reason" text DEFAULT 'manual' NOT NULL,
  "note" text,
  "quantity_after" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_adjustments_org_item_idx"
  ON "inventory_adjustments"("org_id","catalog_item_id","created_at");
