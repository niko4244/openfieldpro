# OpenFieldPro Track A: Release Safety Foundation

Date: 2026-07-16  
Status: Approved; implementation plan ready
Sequence: Track A precedes Track B financial integrity and customer documents

## Purpose

OpenFieldPro must protect customer records, invoices, payments, and uploads before broader public use. The current backup and deployment scripts contain useful pieces, but they do not provide a coordinated recovery boundary, proven restores, migration-gated upgrades, dependency-aware health reporting, retention, off-site replication, or reliable failure alerts.

Track A adds a private operations controller that remains usable when the main application or database is unhealthy. It owns install, upgrade, backup, migration, restore, validation, retention, replication, and operational alerts. OpenFieldPro displays status and requests operations through an owner-only proxy, but it never receives raw host access.

## Goals

- Produce coordinated encrypted recovery points for PostgreSQL and uploads.
- Require a verified pre-upgrade backup and explicit reviewed migrations.
- Validate restores in isolation before changing live data.
- Roll back failed upgrades and failed post-restore validation.
- Report PostgreSQL, writable storage, Redis, schema, capacity, backup, and restore-proof health.
- Schedule backups, apply retention, replicate off site, and notify owners of failures.
- Keep local self-hosting simple while supporting S3-compatible off-site storage.
- Correct documentation so it matches the encrypted archive format and filesystem-backed production uploads.

## Non-goals

- Moving application uploads from the filesystem to S3 object storage. Filesystem uploads remain the supported default; S3-compatible storage is used for off-site backup replication in Track A.
- Implementing customer messaging, marketing communication, or the general email/SMS platform.
- Implementing taxes, discounts, terms, immutable financial ledgers, or other Track B features.
- Supporting cross-region active-active deployment.

## System architecture

The new `ofp-ops` component is a small private service and host CLI. It runs on the internal deployment network and is not published through the public reverse proxy.

### Responsibilities

`ofp-ops` owns:

- operation scheduling and idempotency;
- maintenance mode and worker draining;
- capacity and dependency preflight checks;
- PostgreSQL dump and staged restore;
- uploads snapshot and staged restore;
- streaming age encryption and archive checksums;
- local retention and S3-compatible replication;
- migration execution and schema parity checks;
- isolated restore proofs;
- controlled live restore, rollback, and upgrade recovery;
- operational email, webhook, and ntfy alerts;
- a durable operations journal stored outside the application database.

The OpenFieldPro API provides an owner-only proxy for status and operation requests. The proxy never accepts arbitrary commands, paths, credentials, container names, or shell arguments. The host CLI talks directly to `ofp-ops` and remains available when OpenFieldPro or PostgreSQL is unavailable.

### Private API contract

The controller exposes a versioned internal API:

- `GET /v1/status`
- `GET /v1/operations`
- `GET /v1/operations/:id`
- `POST /v1/backups`
- `POST /v1/restore-proofs`
- `POST /v1/upgrades`
- `POST /v1/restores/validate`
- `POST /v1/restores/commit`
- `POST /v1/maintenance/enter`
- `POST /v1/maintenance/exit`

Mutating requests require an idempotency key. Restore commit additionally requires a short-lived confirmation grant created after owner reauthentication. The internal API uses a dedicated secret mounted into the controller and API containers. Requests are accepted only on the internal network.

### Operations journal

The controller keeps an append-only SQLite journal on its durable operations volume. Each operation records its identifier, kind, state, timestamps, initiating actor, idempotency key, non-sensitive progress, artifact identifier, validation results, and sanitized failure reason. Secrets, customer data, invoice data, archive keys, and raw paths are never written to the journal.

Operation states are `queued`, `preflight`, `maintenance`, `capturing`, `encrypting`, `verifying`, `replicating`, `validating`, `committing`, `rolling_back`, `succeeded`, and `failed`. Only valid state transitions are accepted.

## Backup design

### Default policy

- Create a coordinated encrypted backup every six hours.
- Create and verify a backup before every install, upgrade, or migration.
- Retain 28 six-hour recovery points, 12 weekly recovery points, and 12 monthly recovery points.
- Replicate every successful backup to configured S3-compatible storage.
- Run one isolated restore proof each week.
- Warn when free capacity is below the larger of 20 percent or twice the estimated next backup size.

The policy is configurable, but the defaults are installed automatically during first-run setup.

### Coordinated snapshot procedure

1. Confirm the age recipient, PostgreSQL access, writable uploads volume, operations volume, free capacity, and optional S3 connectivity.
2. Enter maintenance mode. New writes receive a clear retryable maintenance response; reads remain available.
3. Drain workers and wait for active uploads and financial writes to finish within a bounded timeout.
4. Run a consistent PostgreSQL dump.
5. Capture the uploads directory while writes remain blocked.
6. Create a manifest containing application versions, schema version, migration identifiers, file counts, byte counts, and per-file checksums.
7. Stream the dump, uploads, and manifest into an age-encrypted archive. No unencrypted combined archive is written to disk.
8. Compute and verify the encrypted archive checksum.
9. Exit maintenance mode after the local verified artifact exists.
10. Replicate the artifact and non-sensitive sidecar metadata to S3-compatible storage.
11. Apply retention only after the new local artifact is verified. Off-site retention runs only after replication succeeds.
12. Record the result and send required notifications.

If capture, encryption, or local verification fails, the controller exits maintenance mode, preserves diagnostic metadata, deletes incomplete temporary artifacts, and does not run retention.

### Backup artifact

Each artifact consists of:

- an age-encrypted archive;
- a non-sensitive sidecar containing the artifact identifier, creation time, application version, encrypted size, checksum, and verification state;
- no plaintext database dump, uploads archive, credentials, customer identifiers, or encryption private key.

The age identity is never stored in the backup destination. First-run setup requires the owner to confirm that the recovery identity is stored separately.

## Safe install and upgrade pipeline

Installation and update commands call `ofp-ops`; they do not directly start new application images.

1. Run dependency, capacity, configuration, image, and migration preflight checks.
2. Create and verify a pre-upgrade backup.
3. Pull the reviewed application and migration images.
4. Start the explicit migration service against the current database.
5. Validate the expected migration set and schema parity.
6. Start the new application version.
7. Run dependency readiness, authentication, document rendering, and core workflow smoke tests.
8. Commit the upgrade only after all gates pass.
9. Restore the prior images and data if a migration, readiness check, or smoke test fails.

Every migration declares whether it is additive, reversible, or expand-and-contract. Destructive migrations are blocked unless they are the contract phase of an already-deployed compatibility sequence with a verified recovery path. Application images must remain compatible with the expand phase until the later contract release completes.

## Restore design

Restore never overwrites live data before proof.

### Validation phase

1. Verify the encrypted archive checksum.
2. Decrypt into a restricted staging area.
3. Restore PostgreSQL into a temporary database.
4. Restore uploads into a temporary generation directory.
5. Start the application version recorded in the manifest on an isolated internal network.
6. Validate required tables, migrations, constraints, and indexes.
7. Validate organization and user counts, invoice/payment relationships, document totals, upload inventory, and file checksums.
8. Run owner authentication, core API, invoice rendering, estimate rendering, and storage smoke tests.
9. Record the proof result and remove temporary resources after the configured evidence window.

Weekly restore proofs stop here and never switch production data.

### Commit phase

1. Require recent owner reauthentication and typed confirmation.
2. Create a fresh emergency backup of the current live system.
3. Enter maintenance mode and drain workers.
4. Stop application writers.
5. Preserve the current database and uploads as rollback generations.
6. Rename the validated staged database and uploads generation into the canonical live names on the same storage systems.
7. Start the matching application version and run post-switch validation.
8. Exit maintenance mode only after validation succeeds.
9. Automatically restore the preserved generations if post-switch validation fails.

The prior live generations remain available until the restore operation and its recovery window complete successfully.

## Health model

Health endpoints separate process liveness from dependency readiness:

- `GET /api/health/live` reports only whether the API process can respond.
- `GET /api/health/ready` checks PostgreSQL, writable uploads storage, migration parity, and Redis when asynchronous services are enabled.
- `GET /api/health/details` is owner-only and reports sanitized component status, backup age, replication age, restore-proof age, capacity, and schema parity.
- The existing `GET /api/health` keeps its `{ ok: boolean }` contract but derives `ok` from critical readiness instead of always returning success.

Critical dependency failure returns HTTP 503. Optional unconfigured services report `skipped`, not failure. Component checks have strict timeouts so health requests cannot hang. Public responses never expose database names, host paths, container identifiers, credentials, or internal exception text.

## Alerts and history

Operational alerts are independent from customer messaging. The controller sends:

- owner email through configured SMTP;
- an optional generic webhook or ntfy notification;
- an entry in the operations journal surfaced in the owner UI.

Alerts cover backup failure, replication failure, low capacity, overdue backup, failed restore proof, migration failure, rollback, and recovery. Identical failures are deduplicated. Persistent failures escalate, and recovery generates a single resolution notification. No alert body contains customer information, invoice content, credentials, encryption keys, or archive locations.

## Owner experience

The owner-only Operations page shows:

- protection status: `Protected`, `Warning`, or `Action required`;
- latest local backup and off-site replica;
- latest successful restore proof;
- next scheduled backup;
- capacity and estimated remaining backup headroom;
- migration and schema parity;
- operation history, duration, encrypted size, and verification results;
- `Back up now` and `Run restore proof` actions;
- maintenance-mode state and recovery instructions.

The restore wizard requires backup selection, completed isolated validation, visible validation evidence, recent owner reauthentication, typed confirmation, and a second explicit commit action.

## Documentation corrections

- The self-hosting guide must describe the age-encrypted archive produced by the scripts and controller.
- Install and upgrade documentation must call the reviewed migration service through `ofp-ops`.
- The README and production guide must state that filesystem uploads are the current production storage layer.
- S3-compatible storage must be described as off-site backup replication in Track A, not as the current application upload layer.
- Recovery documentation must include key custody, restore proof, capacity, retention, and alert configuration.

## Security requirements

- The controller is not publicly exposed.
- Only owners may request operations through OpenFieldPro.
- Restore commit requires recent reauthentication and a short-lived confirmation grant.
- All controller mutations are idempotent and audited.
- Archive encryption is mandatory; plaintext combined archives are forbidden.
- Encryption identities and S3 credentials are supplied through mounted secrets.
- Archive extraction rejects absolute paths, parent traversal, links escaping staging, and unexpected file types.
- Restore and migration commands use fixed argument structures rather than shell-composed strings.
- Logs and alerts are sanitized.
- Maintenance mode fails closed for writes and remains readable for status and recovery instructions.

## Testing and acceptance criteria

Automated tests must cover:

- controller state transitions and idempotency;
- backup preflight and capacity rejection;
- write gating and worker drain timeout;
- coordinated database and upload capture;
- mandatory age encryption and absence of plaintext artifacts;
- checksum failure and corrupt archive rejection;
- local and S3 retention behavior;
- S3 retry, deduplication, and partial-upload cleanup;
- staged restore without live mutation;
- validation failure before commit;
- post-switch failure with automatic rollback;
- additive, reversible, and expand-and-contract migration gates;
- PostgreSQL, storage, Redis, schema, backup-age, and capacity health states;
- email/webhook deduplication, escalation, and recovery notices;
- owner authorization, reauthentication, and confirmation grants;
- Linux and Windows self-hosted paths and process control.

Release acceptance requires:

1. A fresh installation completes a test backup and restore proof.
2. An upgrade cannot start without a verified pre-upgrade backup.
3. New application code cannot start against an unreviewed schema.
4. A simulated migration failure restores the prior working version and data.
5. A corrupt backup cannot reach restore commit.
6. A valid staged restore proves database, invoices, payments, uploads, authentication, and documents before live replacement.
7. PostgreSQL, uploads, and Redis failures are reflected accurately in readiness and owner health details.
8. A failed scheduled backup sends a deduplicated alert and a later recovery notice.
9. Local and off-site retention preserve the required recovery points.
10. Documentation matches the deployed archive, migration, upload, and recovery behavior.

## Rollout

1. Correct documentation and add dependency-aware health checks.
2. Package the controller, journal, fixed operation contracts, and host CLI.
3. Add coordinated encrypted backup, scheduling, retention, and capacity checks.
4. Add S3-compatible replication and operational alerts.
5. Add staged restore proofs and owner status UI.
6. Route install and upgrade through pre-backup, migration, parity, readiness, and rollback gates.
7. Enable controlled live restore only after automated rollback tests pass.
8. Require a successful backup and restore proof before declaring Track A complete.

Track B begins only after Track A acceptance criteria pass. Track B will then add multiple tax and discount profiles, per-document selection, terms and conditions, immutable invoice snapshots, payment ledger behavior, refunds, credits, voids, write-offs, receipts, and estimate revision/change-order workflows.
