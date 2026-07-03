-- Human invoice numbers must be unique per org. The create path computes the
-- next number as max(suffix)+1 and retries on this constraint, so a concurrent
-- race (or a re-seed) can't reissue a number. Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_idx
  ON invoices (org_id, number);
