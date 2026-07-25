# OpenFieldPro

Open-source, self-hostable **field service management** for service businesses.

OpenFieldPro provides CRM, customers and properties, equipment history, scheduling and dispatch, work orders, estimates, invoicing, payments, documents, service plans, reviews, reporting, integrations, and technician mobile workflows without mandatory per-user subscriptions.

Appliance-service organizations can attach equipment-specific technical records to work orders, but those tools remain optional workflow depth—not the product definition.

> **Status: release-candidate hardening.** The lead-to-payment operations spine runs across Postgres, Fastify, Next.js, and the Expo technician app. Production release still requires every gate in `docs/release/RELEASE_CHECKLIST.md`, including device testing, backup/restore evidence, deployment-specific secrets, and human review of browser screenshots.

## Product architecture

### Operations core

- Customers, properties, equipment, and service history
- Job intake, scheduling, dispatch, work execution, and return visits
- Closeout queues for start, completion, missing pricing, invoicing, and accounts-receivable handoff
- Price book, estimates, approvals, invoices, and payments
- Photos, documents, organization branding, reviews, and service plans
- Reporting, integrations, self-hosting, backup, and restore
- Technician mobile workflows with offline foundations

### Optional vertical workflows

- Equipment-linked technical notes and evidence
- Appliance model and serial records
- Complaint, observation, measurements, and completion summaries
- Return-visit continuity without replacing commercial job status

## Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 5 + TypeScript + Drizzle ORM + Zod |
| Frontend | Next.js 15 (App Router, RSC) |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 + PostGIS |
| Queue | Redis + BullMQ |
| Storage | Local filesystem uploads; optional S3-compatible off-site backup replication |
| Infra | Podman/Docker Compose + Caddy |

Monorepo via pnpm workspaces: `apps/{api,web,mobile}`, `packages/{db,shared}`.

## Quick start

```bash
cp .env.example .env
pnpm install:verified
pnpm infra:up
pnpm db:push
pnpm db:seed
pnpm dev
# Web: http://localhost:3000
# API: http://localhost:3001
```

`pnpm install:verified` regenerates the lockfile from committed manifests, verifies its pinned SHA-256, and then performs a frozen install. Dependency changes must update both the generated lockfile and `pnpm-lock.expected.sha256`.

Run the primary validation gates:

```bash
pnpm release:safety
pnpm audit --prod --audit-level=high
pnpm --filter @ofp/api test
pnpm --filter @ofp/web test:unit
pnpm --filter @ofp/web test:e2e
pnpm --filter @ofp/mobile typecheck
```

## What works today

### Operations

- Multi-tenant organizations, users, roles, customers, properties, equipment, and jobs
- JWT authentication and organization-scoped APIs
- New-customer and existing-customer job intake
- Day, week, and month appointment scheduling
- Dispatcher board with unassigned work, technician lanes, workload counts, search, date navigation, drag-and-drop, accessible reassignment, and conflict prevention
- Job closeout board for start, completion, missing pricing, invoice creation, and recent accounts-receivable handoff
- Estimates, line items, invoices, offline payments, and optional Stripe checkout
- Server-side rejection of zero-dollar and duplicate active invoices
- Concurrency-safe invoice numbering, manual payment application, and Stripe webhook processing
- Branded invoice and estimate previews/exports
- Reviews, recurring work, service-plan foundation, reporting, notifications, and search
- Technician mobile application foundation
- Plugin registry, scoped API tokens, outbound events, and integration surface
- Self-hosting install, update, backup, and restore helpers

### Optional appliance-service records

- Equipment linked to customers and work orders
- Technical sessions and measurement records
- Coverage and correction foundations
- Technician-facing technical record surfaces

## Product surfaces

- `/` — technician-first Today dashboard
- `/jobs/new` — customer and work-order intake
- `/dispatch` — dispatcher board with technician lanes and unassigned work
- `/schedule` — day, week, and month calendar
- `/closeout` — work start, completion, pricing, and invoice handoff
- `/jobs` — work orders and status
- `/customers` — CRM, properties, and equipment
- `/estimates` — estimate workflow
- `/invoices` — invoices and payments
- `/service-plans` — recurring service-plan foundation
- `/documents` — branded operational documents
- `/reports` — operational reporting
- `/settings` — organization and branding settings

## Open-source and sponsorship model

The business model and public voice are governed by `docs/product/BUSINESS_PLAN_AND_VOICE.md`: practical, field-ready, self-hostable, no telemetry, no phone-home licensing, and no artificial limits on the core workflow.

The AGPL core is free to self-host and is never limited by users, technicians, customers, jobs, invoices, locations, or core operational features. Hosted modified versions must follow the obligations in `LICENSE`.

Optional signed entitlements are verified locally without a license server, telemetry, or phone-home. They may represent sponsor recognition, bounded support benefits, or premium first-party plugins; they cannot disable or restrict the core.

A free dashboard may show one clearly labeled, locally configured sponsor placement. OpenFieldPro does not use ad networks, tracking pixels, behavioral targeting, or sponsor access to operational data. See `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

Official sponsorship campaigns, release scheduling, and token inventories are maintained in a separate private operations repository. Only approved public sponsor copy and immutable source identifiers enter official builds; the boundary is documented in `docs/operations/OFFICIAL_DISTRIBUTION_BOUNDARY.md`.

## Product direction

The release gate is the complete lead-to-payment loop:

1. Customer and property intake
2. Scheduling and dispatch
3. Technician field execution
4. Estimate approval
5. Closeout, invoice, and payment
6. Customer communication and service history
7. Reporting, integrations, offline resilience, and safe upgrades

See `docs/release/final-product-roadmap.md` and `docs/release/RELEASE_CHECKLIST.md`.

## Security

Read `SECURITY.md` before deploying. Production startup rejects default/short JWT secrets and wildcard or missing production CORS configuration. Authentication, public booking, uploads, and checkout have bounded route-level rate limits. Run `pnpm release:safety` before every release.

Optional Ed25519 support-entitlement keys are documented in `docs/security/KEY_MANAGEMENT.md`. They are not required to run the AGPL core and do not narrow the rights in `LICENSE`.

## Sponsorship

The project sponsorship application, tier design, outreach copy, non-tracking sponsor policy, governance boundaries, and reporting plan are in `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

After the GitHub Sponsors profile is approved, enable the repository Sponsor button. The repository funding configuration targets the `niko4244` GitHub Sponsors profile.

## Deploy

Use the repository deployment and self-hosting scripts under `scripts/` together with the compose configuration. Production deployments must validate migrations, backups, restore procedures, secrets, storage, TLS, CORS, payment webhooks, outbound communication adapters, and the complete release checklist before serving real customers.

Production uploads are stored on the mounted filesystem volume. S3-compatible storage is optional off-site backup replication, not the live upload path.
