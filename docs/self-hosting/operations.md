# OpenFieldPro Self-Hosting Operations

This guide covers the first production-grade operator tasks for a self-hosted OpenFieldPro install.

## Install

```bash
scripts/install.sh
```

The script creates `.env` if needed, detects Podman or Docker, builds the production stack, and starts Caddy, web, API, worker, Postgres, and Redis. Production uploads are stored on the mounted filesystem volume; optional S3-compatible storage is for off-site backup replication only.

## Update

```bash
scripts/update.sh
```

The script pulls the latest code, rebuilds containers, and restarts the production stack.

## Backup

```bash
scripts/backup.sh
```

Backups are written as encrypted `backups/openfieldpro-YYYYMMDDTHHMMSSZ.tar.gz.age` archives and include:

- PostgreSQL custom-format dump
- Upload filesystem archive when present
- Integrity manifest and checksums; secrets and `.env` are excluded

## Restore

```bash
scripts/restore.sh backups/openfieldpro-YYYYMMDDTHHMMSSZ.tar.gz.age --confirm-destroy-current-data
```

Restore drops and recreates the public schema, imports the SQL dump, restores the upload filesystem archive if present, and restarts the stack.

## Health checks

- App: `http://localhost:8080`
- Landing: `http://localhost:8080/welcome`
- API liveness: `http://localhost:8080/api/health/live`
- API readiness: `http://localhost:8080/api/health/ready`
- API compatibility status: `http://localhost:8080/api/health` (readiness-derived)

## Production checklist

Before public deployment:

- Replace `JWT_SECRET` with a strong secret.
- Replace `POSTGRES_PASSWORD`.
- Point Caddy at a real domain.
- Configure Stripe secrets only if online card payments are enabled.
- Schedule recurring backups.
- Replicate encrypted backups off-site if required; do not configure S3 as the live upload store.
- Test restore on a separate machine or VM.
- Keep sponsor config local, labeled, and free of tracking scripts.
