-- Open-core entitlement flag. 'free' (default) shows the sponsor slot;
-- 'pro' is set by redeeming an offline-signed license key via
-- POST /api/org/license. Idempotent.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
