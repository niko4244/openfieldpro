-- Store the redeemed offline-signed license key so the server can re-verify
-- it locally on every entitlement read: annual keys fall back to 'free' after
-- their signed `exp` date — no license server, no phone-home, no data loss.
-- Idempotent.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS license_key text;
