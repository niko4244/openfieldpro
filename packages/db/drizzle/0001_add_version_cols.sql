-- Phase 5a PR 1 — schema bump for offline mobile sync.
--   1. Add `version` + `updated_at` columns on 7 sync-tracked tables.
--   2. Drop `defaultRandom()` on the 4 hot-path tables so mobile supplies the
--      UUID (mobile writes queued offline, no server round-trip needed).
--   3. Single shared BEFORE UPDATE trigger bumps version + updated_at
--      automatically. The executor's predicated update (`where version = ?`)
--      races safely against this trigger.
--
-- Idempotent: safe to re-run during dev. The trigger DROP+CREATE pair replaces
-- any prior definition.

-- ── 1. New columns ─────────────────────────────────────────────────────────────
ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE line_items    ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE line_items    ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE invoices      ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE invoices      ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE customers     ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE customers     ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE estimates     ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE estimates     ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

ALTER TABLE payments      ADD COLUMN IF NOT EXISTS version    integer        NOT NULL DEFAULT 1;
ALTER TABLE payments      ADD COLUMN IF NOT EXISTS updated_at timestamptz    NOT NULL DEFAULT now();

-- ── 2. (skipped) hot-path id columns keep `defaultRandom()` ────────────────────
-- ponytail: leaving the default in place means mobile offline writes
-- (which supply their own UUID) and server web routes (which omit `id`)
-- both work without code changes. The default is bypassed when an id is
-- supplied in the INSERT.

-- ── 3. Shared BEFORE UPDATE trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_bump_version() RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.version    := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_jobs_version         ON jobs;
DROP TRIGGER IF EXISTS tg_line_items_version   ON line_items;
DROP TRIGGER IF EXISTS tg_invoices_version     ON invoices;
DROP TRIGGER IF EXISTS tg_appointments_version ON appointments;
DROP TRIGGER IF EXISTS tg_customers_version    ON customers;
DROP TRIGGER IF EXISTS tg_estimates_version    ON estimates;
DROP TRIGGER IF EXISTS tg_payments_version     ON payments;

CREATE TRIGGER tg_jobs_version         BEFORE UPDATE ON jobs          FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_line_items_version   BEFORE UPDATE ON line_items    FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_invoices_version     BEFORE UPDATE ON invoices      FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_appointments_version BEFORE UPDATE ON appointments  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_customers_version    BEFORE UPDATE ON customers     FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_estimates_version    BEFORE UPDATE ON estimates     FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
CREATE TRIGGER tg_payments_version     BEFORE UPDATE ON payments      FOR EACH ROW EXECUTE FUNCTION fn_bump_version();
