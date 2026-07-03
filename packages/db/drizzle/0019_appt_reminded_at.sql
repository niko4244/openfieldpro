-- Track when the upcoming-appointment reminder was sent, so the worker's 60s
-- poll loop doesn't re-notify the same appointment every tick. Idempotent.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
