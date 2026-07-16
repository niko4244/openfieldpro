# Implementation Plan: Track A Release Safety Foundation

## Context

- **Approved design:** `docs/superpowers/specs/2026-07-16-track-a-release-safety-design.md`.
- **Repository boundary:** `niko4244/openfieldpro` remains public. Create a separate private repository, `niko4244/openfieldpro-ops`, for the host controller, scheduler, durable journal, backup destinations, sponsor controls, and operational credentials. The public repository exposes only fixed, owner-authorized contracts and contains no controller secret, age identity, S3 credential, SMTP credential, or unrestricted host command.
- **Current public entry points:** `scripts/install.sh:1-35`, `scripts/update.sh:1-20`, `scripts/backup.sh:1-85`, `scripts/restore.sh:1-107`, `infra/compose.prod.yml:1-146`, `apps/api/src/routes/health.ts:1-5`, `apps/api/src/server.ts:39-85`, and `apps/web/lib/nav.ts`.
- **Patterns to follow:** Node's built-in test runner (`apps/api/test/*.test.ts`), Fastify route modules, Zod validation, fixed argument arrays for child processes, existing `migrate` Compose profile, and filesystem uploads at `data/uploads`.
- **Testing strategy:** TDD for every state transition and trust boundary; dependency injection for filesystem/process/network probes; integration tests with disposable PostgreSQL, Redis, uploads, and S3-compatible containers; Playwright for owner authorization and restore confirmation; one destructive drill only against an isolated fixture deployment.
- **Delivery rule:** each task is an atomic vertical slice and leaves both repositories buildable. Track B cannot start until Task 12 passes.

## Tasks (ordered)

### Task 1: Correct public health and storage truth

- **Files:** modify `apps/api/src/routes/health.ts`, `apps/api/src/server.ts`, `infra/compose.prod.yml:78-83`, `README.md:36-41`, `docs/self-hosting/operations.md`, `.env.example`; create `apps/api/src/health.ts` and `apps/api/test/health.test.ts`.
- **What:** add bounded probes for PostgreSQL (`select 1`), writable uploads (create/fsync/remove a random zero-byte probe), migration parity, and Redis only when configured. Add `/api/health/live`, `/api/health/ready`, and owner-only `/api/health/details`; keep `/api/health` but derive `ok` from readiness. Public failures return sanitized component names and HTTP 503, never connection strings, paths, or raw exceptions. Change the container health check to `/api/health/ready`. Correct docs to say production uploads use the filesystem and S3 is off-site backup replication.
- **Test first:** inject passing, failing, skipped, and timed-out probes; assert liveness remains 200, readiness becomes 503 for critical failures, optional Redis can be `skipped`, details require an owner, and serialized bodies exclude sentinel secrets/paths.
- **Verify:** `pnpm --filter @ofp/api test && pnpm --filter @ofp/api build && pnpm release:safety`; then stop PostgreSQL and Redis separately in a disposable Compose project and confirm readiness changes within the configured timeout.
- **Dependencies:** none.

### Task 2: Establish the public/private controller contract

- **Public files:** create `packages/shared/src/operations.ts`, `apps/api/src/routes/operations.ts`, `apps/api/src/operations-client.ts`, `apps/api/test/operations-client.test.ts`; modify `packages/shared/src/index.ts` and `apps/api/src/server.ts`.
- **Private files:** create `openfieldpro-ops/package.json`, `src/contracts.ts`, `src/server.ts`, `src/auth.ts`, `src/idempotency.ts`, and `test/contracts.test.ts`.
- **What:** define the approved `/v1` request/response schemas and operation states once in the public shared package; copy the versioned contract into the private package through a pinned public package version, not a filesystem link. The API proxy exposes only status, history, backup, restore-proof, upgrade, restore-validation/commit, and maintenance actions. Reject extra keys, raw paths, container names, shell arguments, and unknown operation kinds. Authenticate API-to-controller requests with a mounted 32-byte-or-longer secret and constant-time comparison. Require an idempotency key on mutations.
- **Test first:** prove non-owners receive 403; malformed/extra fields receive 400; duplicate idempotency keys return the same operation; different payloads with the same key receive 409; unavailable controller returns sanitized 503; no public route accepts an arbitrary command.
- **Verify:** run public API tests/build and private `pnpm test && pnpm build`; inspect `infra/Caddyfile.prod` to prove no `/v1` controller route is published.
- **Dependencies:** Task 1.

### Task 3: Add the private durable operation journal and state machine

- **Private files:** create `src/journal.ts`, `src/state-machine.ts`, `src/sanitize.ts`, `test/journal.test.ts`, and `test/state-machine.test.ts`; modify `src/server.ts`.
- **What:** persist the approved operation fields in an append-only SQLite journal on the controller volume. Use prepared statements and unique constraints for operation ID and idempotency key. Permit only the approved directed transitions; terminal states cannot restart. Store safe artifact IDs and summaries, never customer data, credentials, keys, archive locations, or raw errors. Resume queued/in-progress operations after restart only through operation-specific recovery handlers; otherwise fail closed with a sanitized reason.
- **Test first:** cover every valid transition, representative invalid transitions, concurrent duplicate requests, restart persistence, redaction, and journal corruption startup failure.
- **Verify:** `pnpm test`; restart the controller against a temporary journal and confirm history and idempotency survive.
- **Dependencies:** Task 2.

### Task 4: Implement maintenance mode and bounded worker drain

- **Public files:** create `apps/api/src/maintenance.ts`, `apps/api/test/maintenance.test.ts`; modify `apps/api/src/server.ts`, `apps/worker/src/index.ts`, and `infra/compose.prod.yml`.
- **Private files:** create `src/maintenance.ts`, `test/maintenance.test.ts`; modify `src/server.ts`.
- **What:** store maintenance state outside PostgreSQL on the private operations volume and mount it read-only into API/worker containers. API mutation requests return 503 with `Retry-After` and a safe maintenance message while reads, liveness, owner status, and recovery endpoints remain available. The worker stops claiming new work, completes active work within a bounded timeout, and reports drained state. Controller backup/upgrade/restore operations cannot enter capture until writers are gated and workers are drained.
- **Test first:** classify all mutating methods, exempt only fixed recovery/status endpoints, prove reads remain available, prove timeout fails the operation before capture, and prove maintenance exits after pre-commit failures.
- **Verify:** run API/worker/private tests; in disposable Compose, begin a slow fixture job and verify drain waits, times out safely, then succeeds after the job ends.
- **Dependencies:** Tasks 2-3.

### Task 5: Create coordinated encrypted backups with capacity gates

- **Public files:** replace `scripts/backup.sh` with a thin authenticated controller CLI wrapper; add `scripts/backup.ps1`; update `.env.example`.
- **Private files:** create `src/backup.ts`, `src/archive.ts`, `src/capacity.ts`, `src/process.ts`, `src/cli.ts`, `test/backup.test.ts`, `test/archive.test.ts`, and `test/capacity.test.ts`.
- **What:** preflight age recipient, database, writable uploads/operations volumes, and free space. Estimate the next artifact and reject when free space is below the larger of 20% or 2x the estimate. Enter maintenance, drain, run `pg_dump --format=custom --no-owner --no-privileges`, snapshot uploads, generate the v3 manifest (versions, migrations, counts, bytes, checksums), and stream tar output directly into `age`; never create a plaintext combined archive. Write via `.partial`, fsync, atomically rename, compute/verify the encrypted SHA-256, then exit maintenance. On failure, remove partial/plaintext artifacts and skip retention.
- **Test first:** use fake fixed-argument process runners and temporary directories to prove ordering, capacity rejection, mandatory encryption, no plaintext combined artifact, cleanup, checksum verification, and paths with spaces on Linux/Windows. Add a test that rejects unsafe archive entries, links, absolute paths, and `..` traversal.
- **Verify:** private tests/build; run a disposable real backup and assert the destination contains only `.age` plus non-sensitive sidecar metadata and no database/upload plaintext.
- **Dependencies:** Tasks 3-4.

### Task 6: Add scheduling, retention, and S3-compatible replication

- **Private files:** create `src/scheduler.ts`, `src/retention.ts`, `src/replication.ts`, `test/scheduler.test.ts`, `test/retention.test.ts`, and `test/replication.test.ts`; modify `src/server.ts` and private deployment files.
- **What:** schedule backups every six hours and restore proofs weekly using persisted next-run timestamps and a single-run lease. Preserve 28 six-hour, 12 weekly, and 12 monthly local/off-site points using deterministic bucket selection. Upload to a temporary object key, verify size/checksum metadata, atomically promote/copy to the final key, then remove the temporary object. Retry with capped jitter and deduplicate by artifact ID. Apply local retention only after local verification; apply remote retention only after successful replication.
- **Test first:** use a fake clock and fake object client for missed runs, restarts, DST immunity, lease contention, bucket boundaries, partial upload cleanup, retries, idempotent replication, and retention ordering.
- **Verify:** private tests; integration test against an S3-compatible disposable service with forced connection loss and duplicate delivery.
- **Dependencies:** Task 5.

### Task 7: Add independent operational alerts

- **Private files:** create `src/alerts.ts`, `src/alert-delivery.ts`, `test/alerts.test.ts`; modify `src/journal.ts`, `src/server.ts`, and private environment/deployment examples.
- **What:** emit sanitized owner email plus optional webhook/ntfy for backup, replication, capacity, overdue-backup, restore-proof, migration, rollback, and recovery events. Fingerprint identical failures, suppress repeats inside the configured window, escalate persistent failures, and send one recovery notice. Delivery failure is journaled without recursively alerting.
- **Test first:** fake clock/transports to prove deduplication, escalation, recovery-once behavior, channel isolation, retry caps, and removal of customer/credential/path sentinels.
- **Verify:** private tests; local SMTP sink and webhook fixture each receive one failure and one recovery message.
- **Dependencies:** Tasks 3 and 6.

### Task 8: Prove restores in isolation before live mutation

- **Public files:** replace `scripts/restore.sh` with validation-first and commit subcommands that call the controller; add `scripts/restore.ps1`.
- **Private files:** create `src/restore.ts`, `src/restore-validation.ts`, `src/archive-extract.ts`, `test/restore-validation.test.ts`, and `test/archive-extract.test.ts`; add an isolated restore Compose file.
- **What:** verify encrypted checksum, decrypt only into a mode-0700 staging area, safely extract, restore to a temporary database/uploads generation, start the manifest-matched app on a non-public network, and validate migrations, constraints, indexes, record relationships, invoice/payment totals, upload inventory/checksums, owner auth, core API, invoice/estimate rendering, and storage. Weekly proofs stop here. Record a time-bounded proof grant tied to artifact checksum and validation result; validation never changes canonical live database/uploads names.
- **Test first:** corrupt checksum/archive, path traversal/link escape, wrong schema/app version, broken financial relation, missing upload, auth failure, and render failure all prevent a proof grant and leave live fixture hashes unchanged.
- **Verify:** private tests; run one disposable restore proof and compare live database/upload hashes before and after.
- **Dependencies:** Tasks 5-7.

### Task 9: Gate install and upgrade through backup, migration, and rollback

- **Public files:** modify `scripts/install.sh`, `scripts/update.sh`, add `scripts/install.ps1`, `scripts/update.ps1`, strengthen `packages/db/src/migrate.ts`, add `packages/db/src/migration-policy.ts` and `packages/db/test/migration-policy.test.ts`, modify `infra/compose.prod.yml`.
- **Private files:** create `src/upgrade.ts`, `src/migration-policy.ts`, `src/smoke.ts`, `test/upgrade.test.ts`, and `test/migration-policy.test.ts`.
- **What:** make install/update thin controller CLI calls. Preflight configuration/images/migration metadata, require a verified pre-upgrade backup, pull pinned images, run the explicit migration service, verify expected migration set and parity, start new images, then run readiness, owner auth, core workflow, storage, invoice, and estimate smoke tests. Every migration declares additive, reversible, or expand/contract phase. Reject destructive migrations without an earlier compatible expand phase and recovery evidence. Preserve prior image digests and data generation; automatically roll back on any gate failure.
- **Test first:** no verified backup, unreviewed migration, parity mismatch, migration failure, readiness failure, and smoke failure must keep/restore the prior version; success commits once; retry is idempotent.
- **Verify:** public DB/API builds and tests; private tests; disposable upgrade drill with an intentionally failing migration proves prior app/data return healthy.
- **Dependencies:** Tasks 5 and 8.

### Task 10: Implement controlled live restore with automatic rollback

- **Public files:** extend owner operation routes and shared schemas from Task 2; add owner reauthentication/confirmation-grant tests.
- **Private files:** extend `src/restore.ts`; create `src/confirmation-grants.ts`, `test/restore-commit.test.ts`, and `test/confirmation-grants.test.ts`.
- **What:** require a successful unexpired proof for the exact artifact checksum, recent owner reauthentication, typed confirmation, and a one-use short-lived grant. Create an emergency backup, gate writers, preserve current database/uploads generations, switch validated generations on the same storage system, start the matching app, and rerun post-switch validation. On failure, restore both preserved generations and prior images before leaving maintenance. Never accept archive paths or host identifiers from the public request.
- **Test first:** expired/reused/wrong-owner/wrong-artifact grants fail; emergency backup failure prevents switch; post-switch database, upload, or render failure restores both generations and prior version; successful commit consumes the grant.
- **Verify:** isolated destructive drill with planted old/new markers, once for successful switch and once for forced rollback.
- **Dependencies:** Tasks 8-9.

### Task 11: Add the owner Operations experience

- **Files:** create `apps/web/app/operations/page.tsx`, `apps/web/lib/operations.ts`, `apps/web/lib/operations.test.ts`, and `apps/web/e2e/operations.spec.ts`; modify `apps/web/lib/nav.ts` and shared operation DTOs.
- **What:** show Protected/Warning/Action required, latest local/off-site backup, latest restore proof, next run, capacity/headroom, migration parity, maintenance state, and sanitized history. Add Back up now and Run restore proof with idempotent submission/loading/retry states. The restore wizard requires artifact selection, visible proof evidence, reauthentication, exact typed phrase, and a separate commit action. Hide the page from non-owners and handle controller unavailability without losing the rest of the app.
- **Test first:** status derivation and stale thresholds; Playwright owner/non-owner access, empty/loading/error states, keyboard flow, double-click deduplication, expired proof, reauthentication, typed confirmation, and rollback result.
- **Verify:** `pnpm --filter @ofp/web test:unit && pnpm --filter @ofp/web build && pnpm --filter @ofp/web test:e2e`; visually inspect light mode at mobile and desktop widths.
- **Dependencies:** Tasks 1-3, 6-8, and 10.

### Task 12: Harden deployment, documentation, and release proof

- **Public files:** modify `infra/compose.prod.yml`, `docs/self-hosting/operations.md`, `docs/release/RELEASE_CHECKLIST.md`, `README.md`, `.env.example`, CI workflows, and `scripts/release-safety-check.mjs`.
- **Private files:** add hardened private Compose/system-service examples, secret-mount examples, `docs/runbook.md`, `docs/key-custody.md`, `test/e2e/release-drill.test.ts`, and private CI workflows.
- **What:** keep the controller only on an internal network; mount its journal/secrets with least privilege; document Windows/Linux installation, key custody, six-hour/weekly/monthly policy, S3 replication, SMTP/webhook/ntfy, capacity, proof cadence, and rollback. CI must scan both repositories for secret-like fixtures, run dependency audits, build/test images, and exercise the non-destructive drill. Release evidence records artifact IDs/checksums and sanitized outcomes, not archive paths or data.
- **Test first:** deployment-config tests prove no public controller port, no inline production secrets, read-only app access to maintenance state, and required health checks. Documentation command examples are exercised in CI where practical.
- **Verify:** fresh disposable install → backup → off-site replica → restore proof → successful upgrade; then forced backup, replication, migration, and post-switch failures. Confirm alerts, retention, health status, rollback, and docs match observed behavior. Complete every Track A acceptance item before opening Track B implementation.
- **Dependencies:** Tasks 1-11.

## Verification

1. Run public checks: `pnpm install --frozen-lockfile && pnpm test && pnpm build && pnpm release:safety`.
2. Run private checks: `pnpm install --frozen-lockfile && pnpm test && pnpm build` in `openfieldpro-ops`.
3. Start a disposable production-like deployment with separate temporary volumes and no host production mounts.
4. Demonstrate accurate readiness for PostgreSQL, uploads, Redis, and schema failures without leaking internal details.
5. Demonstrate an encrypted coordinated backup, S3-compatible replica, retention selection, and weekly isolated proof with no plaintext combined archive.
6. Demonstrate failed migration and failed post-restore validation return the exact prior app/database/uploads markers.
7. Demonstrate owner-only actions, idempotency, recent reauthentication, one-use confirmation grants, alert deduplication, escalation, and recovery.
8. Save sanitized drill evidence in the release checklist. Only then mark Track A complete and begin Track B financial integrity/customer documents.

## Self-review

- **Spec coverage:** all architecture, backup, upgrade, restore, health, alerts, owner experience, documentation, security, cross-platform, and ten release-acceptance requirements map to Tasks 1-12.
- **Boundary check:** private host authority and credentials never enter the public repository; public scripts are fixed controller wrappers only.
- **Scope check:** application uploads remain filesystem-backed; S3 is backup replication only; taxes, discounts, terms, ledgers, and customer messaging remain Track B.
- **Placeholder scan:** no deferred implementation placeholders are present.
