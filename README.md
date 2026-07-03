# OpenFieldPro

Open-source, self-hostable **field service management** — a HouseCall Pro alternative.
CRM, scheduling/dispatch, work orders, estimates, invoicing, and payments for home-service
businesses (HVAC, plumbing, electrical, cleaning, etc.).

> **Status: core parity shipped.** The full job-to-cash workflow runs end-to-end:
> CRM (customers, properties, equipment, service history), scheduling, live-GPS
> dispatch board, estimates, invoicing workbench with customer preview, payments,
> price book, inventory, reviews, reports with margins, notification templates
> (email/SMS with A/B subjects), event-driven automations, and an open plugin
> portal. Free and self-hosted under AGPL-3.0; optional Pro/Business licenses
> fund development — see [License & pricing](#license--pricing).

## Stack

| Layer | Tech |
|---|---|
| Backend | Fastify 5 + TypeScript + Drizzle ORM + Zod |
| Frontend | Next.js 15 (App Router, RSC) |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 + PostGIS |
| Queue | Redis + BullMQ *(wired in Phase 2 for reminders)* |
| Storage | MinIO (S3-compatible) |
| Infra | Podman/Docker Compose + Caddy |

Monorepo via pnpm workspaces: `apps/{api,web,mobile}`, `packages/{db,shared}`.

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # postgres + redis + minio + caddy (podman or docker)
pnpm db:push         # create tables from the Drizzle schema
pnpm db:seed         # demo org + customers + a job + invoice
pnpm dev             # api on :3001, web on :3000
# open http://localhost:3000  (or http://localhost:8080 via Caddy)
```

Run the unit check (no database needed):

```bash
pnpm --filter @ofp/api test
```

## What works today

- **Multi-tenant schema** for every core HouseCall concept: orgs, users/technicians,
  customers, properties, jobs (work orders), line items, estimates, invoices, payments,
  appointments. Money is integer cents throughout.
- **Auth (Phase 2)**: `POST /api/auth/register` (creates org + owner), `POST /api/auth/login`,
  `GET /api/auth/me`. JWT via `@fastify/jwt`; passwords hashed with stdlib scrypt + constant-time
  verify. Org is resolved from the verified token (header/first-org fallback in dev only).
  Demo login: `owner@demo.test` / `demo12345` after seeding.
- **Scheduling/dispatch (Phase 2)**: `GET/POST /api/appointments` (with `?from&to` range),
  `PATCH /api/appointments/:id` (reschedule/reassign — the backend for calendar drag-drop).
  Booking a job auto-moves it to `scheduled`.
- **Invoicing + payments (Phase 3)**: line items (`/api/jobs/:id/line-items`) recompute the job
  total; `POST /api/invoices` generates a numbered invoice from a job; `POST /api/invoices/:id/pay`
  records offline payments (cash/check/card) and flips status to `paid` when covered (partials and
  overpayment handled). Online card via `POST /api/invoices/:id/checkout` (Stripe-optional, returns
  501 with guidance when unconfigured) + a **signature-verified** `/api/stripe/webhook`. Web invoices view.
- **API (Phase 1)**: `customers` + `jobs` CRUD, `GET /api/health`. Zod-validated, org-scoped.
- **Web**: dashboard, customers table, **schedule view**, **sign-in form**.
- **Mobile**: technician job list (Expo).
- **Tests**: money math (3/3) + password hashing (4/4), both runnable with zero install via
  `node --experimental-strip-types --test`.

## Roadmap to HouseCall Pro parity

Each row is one vertical slice on the existing spine (schema → API route → web page).

| Phase | Module | Notes |
|---|---|---|
| 1 ✅ | Customers, Jobs, Dashboard | done — the reference slice |
| 2 ✅ | Auth & orgs (JWT) | done — scrypt + `@fastify/jwt`; token-scoped tenancy |
| 2 ✅ | Scheduling / dispatch | done — appointments API + schedule view; drag-assign UI is the next polish on the existing PATCH |
| 2 ✅ | Estimates → accept → convert to job | done — create from job, accept advances job to scheduled |
| 3 ✅ | Invoicing + line-item editor | done — line items recompute job totals; invoice generated from job; PDF/email is the next polish |
| 3 ✅ | Online payments | done — offline `/pay` (cash/check/card) + Stripe-optional `/checkout` + signature-verified webhook |
| 3 ✅ | Reminders & notifications | done — `@ofp/worker` sends appointment reminders via pluggable `notify` (ntfy/console; SMS/email plug in) |
| 4 ✅ | Online booking page | done — public `POST /api/public/:orgId/book` → `lead` job (no auth) |
| 4 ✅ | Recurring jobs, reviews, reporting | done — recurring templates materialized by the worker; reviews API; `/api/reports/summary` |
| 5 ✅ | Templates & automation | done — email/SMS templates with merge fields + A/B subjects, branded HTML shell, event-driven automation rules with audit trail |
| 6 ✅ | Plugin portal | done — manifest catalog, per-org installs, HMAC-signed webhooks, scoped API tokens, delivery journal |
| 7 ✅ | Dispatch board + inventory + CRM depth | done — live-GPS dispatch map, tech mode, inventory/parts, property profiles with per-property service history |

All roadmap modules have a working, verified slice. Daily quality is watched by an
automated evaluation loop that scores the app against Housecall Pro feature-by-feature.

## License & pricing

OpenFieldPro is **AGPL-3.0** ([LICENSE](LICENSE)). Self-host forever. No user limits.
No job limits. No customer limits. No telemetry. No vendor lock-in. Hosting a
*modified* version for others means publishing your changes under AGPL
([docs/LICENSES.md](docs/LICENSES.md)). Optional licenses fund development —
activation is a single offline-verified key: no account, no license server, no phone-home:

| | Free | Pro | Founder | Business |
|---|---|---|---|---|
| Everything in the app | ✔ | ✔ | ✔ | ✔ |
| Sponsor line on dashboard | shown | removed | removed | removed |
| Your branding on invoices & emails | — | ✔ | ✔ | ✔ |
| Themes, advanced exports/analytics, industry & AI packs | — | ✔ | ✔ | ✔ |
| Premium integrations (QuickBooks, Zapier) | — | — | — | ✔ |
| Term | forever | annual | **lifetime** | annual |

Upgrade only if you want premium plugins, polish, branding, integrations, AI packs,
and official support. Details: [docs/MONETIZATION.md](docs/MONETIZATION.md) ·
[docs/PRO_FEATURES.md](docs/PRO_FEATURES.md) · [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Deploy

One command builds the images, runs migrations + seed, and brings the whole stack up behind
Caddy on `:8080` (works with podman or docker compose):

```bash
./deploy.sh           # Linux/macOS
.\deploy.ps1          # Windows
```

Then:
- **App** → http://localhost:8080  ·  **Landing** → http://localhost:8080/welcome
- **API** → http://localhost:8080/api/health  ·  **Login** → `owner@demo.test` / `demo12345`

For a public host, point the `:8080` block in `infra/Caddyfile.prod` at your domain (Caddy
auto-provisions HTTPS) and set real secrets in `.env` (`JWT_SECRET`, `POSTGRES_PASSWORD`,
and `STRIPE_*` if you want online card payments). Services: `api`, `web`, `worker`, `postgres`,
`redis`, `minio`, `caddy` (see `infra/compose.prod.yml`).

## License

AGPL-3.0 — see [LICENSE](LICENSE). Self-host freely; see
[docs/LICENSES.md](docs/LICENSES.md) for how the software license and the
optional license keys relate.
