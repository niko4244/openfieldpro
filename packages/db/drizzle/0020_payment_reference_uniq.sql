-- Idempotency for online card payments: Stripe redelivers webhooks, and each
-- delivery previously inserted a fresh payment row (double-counted revenue).
-- A partial unique index on card references makes redelivery a no-op via
-- ON CONFLICT DO NOTHING. Scoped to card + non-null so legitimate duplicate
-- manual references (two checks numbered the same) are unaffected. Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS payments_card_reference_idx
  ON payments (reference)
  WHERE method = 'card' AND reference IS NOT NULL;
