ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "business_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
