// Environment posture, in one place so auth fallbacks can't drift.
//
// Security note: the unauthenticated dev fallbacks (resolveOrgId/resolveIdentity
// treating a tokenless request as owner of the first org, the `x-org-id`
// header shortcut, etc.) are enabled ONLY when NODE_ENV is EXPLICITLY
// "development". An unset or unexpected NODE_ENV is treated as non-dev, so a
// stray `pnpm start` without env vars stays locked down (401) instead of
// silently opening every org to anyone. Local dev opts in via
// apps/api/src/dev.ts, which sets NODE_ENV=development.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * True only in explicit development. Read at CALL time (not module load) so
 * tests and tooling can set NODE_ENV before a request and get the expected
 * posture without import-order surprises.
 */
export function devAuthFallback(): boolean {
  return process.env.NODE_ENV === "development";
}
