-- Phase 5b: notification templates.
-- A per-org content module for each channel/key combo that the WYSIWYG editor
-- manages, the worker renders, and the trigger engine (future PR) wires up.
--
-- ponytail: meta/0009_snapshot.json is intentionally NOT generated. The
-- apply-pending.ts runner walks *.sql files in numerical order and never reads
-- snapshots — so applied state stays correct. Upgrade: regenerate meta/
-- snapshots with `pnpm --filter @ofp/db generate` so drizzle-kit push will
-- diff cleanly without a re-generate on the next schema change.

CREATE TYPE template_channel AS ENUM ('email', 'sms');

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key text NOT NULL,
  channel template_channel NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- A given (org, key, channel) is unique; one template per channel per key.
CREATE UNIQUE INDEX templates_org_key_channel_idx ON templates(org_id, key, channel);

-- List all templates for an org (settings page list view).
CREATE INDEX templates_org_idx ON templates(org_id);
