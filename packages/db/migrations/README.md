# OpenFieldPro database migrations

This directory contains production-reviewed SQL migrations for the OpenFieldPro Postgres schema.

## Commands

From the repo root:

```bash
pnpm --filter @ofp/db generate
pnpm --filter @ofp/db migrate
```

`DATABASE_URL` must point at the target Postgres database. If unset, local development defaults to:

```text
postgres://ofp:ofp@localhost:5432/ofp
```

## Policy

- Use `drizzle-kit generate` to create migration files from schema changes.
- Review generated SQL before applying it to production.
- Use `drizzle-kit migrate` for production/staging deploys.
- Keep `drizzle-kit push` for local prototyping only; do not use it as the production deploy path.
- The `0000_openfieldpro_baseline.sql` migration is an idempotent baseline intended for fresh deployments.

## Current baseline coverage

The baseline includes the current core field-service schema:

- organizations, users, customers, properties
- jobs, appointments, activities
- line items and taxable flags
- estimates and Good / Better / Best proposal options
- invoices, invoice templates, reminders, progress milestones
- payments with provider/idempotency identities
- Stripe webhook event ledger
- reviews and recurring jobs
- production indexes, including per-org invoice-number uniqueness
