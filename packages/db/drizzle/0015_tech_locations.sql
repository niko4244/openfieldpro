-- Phase 7 — last-known tech location (UPSERT-on-conflict).
CREATE TABLE IF NOT EXISTS "tech_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lat" real NOT NULL,
  "lng" real NOT NULL,
  "accuracy_m" real,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  "online" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tech_locations_org_user_idx"
  ON "tech_locations"("org_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tech_locations_captured_idx"
  ON "tech_locations"("org_id","captured_at");
