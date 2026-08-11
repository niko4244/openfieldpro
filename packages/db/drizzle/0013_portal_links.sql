--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_links" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
 "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
 "token_hash" text NOT NULL,
 "token_prefix" text NOT NULL,
 "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "expires_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "last_used_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "portal_links_hash_idx" ON "portal_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "portal_links_org_customer_idx" ON "portal_links" ("org_id", "customer_id");
