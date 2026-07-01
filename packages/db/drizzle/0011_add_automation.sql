-- Phase 5c: trigger engine (Decision 4 in templates ADR).
-- Three tables: events journal (idempotent by event_id), rules (event+channel+
-- template binding), runs (append-only per-fire audit). Together they:
--   1. record what happened (events),
--   2. decide what to send (rules),
--   3. prove it sent (runs).
--
-- ponytail: meta/0011_snapshot.json is intentionally NOT generated. The
-- apply-pending.ts runner walks *.sql files in numerical order and never
-- reads snapshots — so applied state stays correct. Upgrade: regenerate
-- meta/ snapshots with `pnpm --filter @ofp/db generate` so drizzle-kit push
-- will diff cleanly without a re-generate on the next schema change.

CREATE TYPE automation_event_status AS ENUM ('pending', 'processed', 'skipped');
CREATE TYPE automation_run_status AS ENUM ('pending', 'fired', 'failed', 'skipped');

CREATE TABLE automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- Deterministic sha256-derived key for idempotency (see lib/events.ts).
  event_id text NOT NULL,
  key text NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  payload jsonb NOT NULL,
  status automation_event_status DEFAULT 'pending' NOT NULL,
  last_attempt_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Idempotency: same (org_id, event_id) NEVER duplicates. Every retry path
-- uses this index to skip already-processed events.
CREATE UNIQUE INDEX automation_events_org_event_idx ON automation_events(org_id, event_id);

-- Catch-up tick reads status='pending' rows ordered by occurred_at.
CREATE INDEX automation_events_due_idx ON automation_events(status, occurred_at);

-- List events for an org (settings audit view).
CREATE INDEX automation_events_org_idx ON automation_events(org_id);

CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_key text NOT NULL,
  channel template_channel NOT NULL,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  -- NULL = "always". No closure evaluation in v1; reserved for future DSL.
  condition_fn text,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX automation_rules_org_name_idx ON automation_rules(org_id, name);

-- Find rules for an event kind quickly at fire time. The enabled flag is in
-- the index so a disabled rule is skipped without a row read.
CREATE INDEX automation_rules_org_event_idx ON automation_rules(org_id, event_key, enabled);

CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_key text NOT NULL,
  status automation_run_status NOT NULL,
  variant_label text,
  error text,
  fired_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Idempotency: an (rule_id, event_id) pair NEVER fires twice.
CREATE UNIQUE INDEX automation_runs_rule_event_idx ON automation_runs(rule_id, event_id);

-- "Did we send X today?" queries.
CREATE INDEX automation_runs_org_fired_idx ON automation_runs(org_id, fired_at);

-- "Show me what failed last week" queries.
CREATE INDEX automation_runs_status_idx ON automation_runs(status);
