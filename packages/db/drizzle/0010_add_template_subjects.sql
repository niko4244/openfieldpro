-- Phase 5b+ A/B: template_subjects sidecar for A/B subject variant testing.
-- Each row is one alternative subject for the parent templates row, with a
-- weight. notifyTemplate() picks one deterministically per recipient via
-- pickVariant() in @ofp/shared, weighted by `weight`. When at least one row
-- exists for a template, the picked subject overrides `templates.subject`.
--
-- ponytail: meta/0010_snapshot.json is intentionally NOT generated. The
-- apply-pending.ts runner walks *.sql files in numerical order and never
-- reads snapshots — so applied state stays correct. Upgrade: regenerate
-- meta/ snapshots with `pnpm --filter @ofp/db generate` so drizzle-kit push
-- will diff cleanly without a re-generate on the next schema change.

CREATE TABLE template_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  weight integer DEFAULT 1 NOT NULL,
  subject text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- One label per template; "control", "with_emoji" etc. are unique
-- within a single template instance.
CREATE UNIQUE INDEX template_subjects_template_label_idx
  ON template_subjects(template_id, label);

-- List variants by org (settings page org-scoped view).
CREATE INDEX template_subjects_org_idx ON template_subjects(org_id);
