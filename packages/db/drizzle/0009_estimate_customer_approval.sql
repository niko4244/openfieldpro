ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "number" text DEFAULT 'EST-1000' NOT NULL;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "accepted_by_name" text;
