# Self-hosting OpenFieldPro

Self-hosting is the product. There is no cloud version to upsell you to, no
telemetry, no phone-home, no license server, and no feature that requires
OpenFieldPro infrastructure to run. The stack is yours.

## Quick start

```bash
git clone https://github.com/niko4244/openfieldpro
cd openfieldpro
cp .env.example .env      # set JWT_SECRET + POSTGRES_PASSWORD for real hosts
./deploy.sh               # Linux/macOS  (Windows: .\deploy.ps1)
```

One command builds the images, runs migrations + seed, and brings up the
whole stack behind Caddy on `:8080` (podman or docker compose):

- **App** → http://localhost:8080 · **Landing** → http://localhost:8080/welcome
- **API** → http://localhost:8080/api/health · **Login** → `owner@demo.test` / `demo12345`

Services: `api`, `web`, `worker`, `postgres`, `redis`, `minio`, `caddy`
(`infra/compose.prod.yml`). For a public host, point the `:8080` block in
`infra/Caddyfile.prod` at your domain — Caddy auto-provisions HTTPS.

For development instead: `pnpm install`, `pnpm infra:up`, `pnpm db:push`,
`pnpm db:seed`, `pnpm dev`.

## Security: set a real JWT_SECRET

`JWT_SECRET` signs login tokens. **The API refuses to start in production
(`NODE_ENV=production`) if `JWT_SECRET` is unset or still the placeholder
`change-me-in-production`** — booting with the shipped default would let anyone
forge a token for any org. Generate one and put it in `.env`:

```bash
openssl rand -base64 48   # or: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

The unauthenticated dev convenience (browsing without logging in via the
`x-org-id` header / first-org fallback) is enabled **only** when
`NODE_ENV=development`. The Docker image and `pnpm dev` set the right value
automatically; an unset/unknown `NODE_ENV` is treated as locked-down (all
requests need a valid token), so a stray `pnpm start` never runs wide open.

## What Free includes (everything that matters)

The complete field-service workflow: scheduling, dispatch (live-GPS board),
estimates, invoices, payments, customers & properties, job records, service
history, technician mobile app with offline sync, templates & automations,
core reports, plugin portal. **Unlimited users, technicians, jobs, and
customers.** See [PRO_FEATURES.md](PRO_FEATURES.md) for what paid tiers add
(polish and premium extras — never core functionality).

## Optional bits

- **Sponsor slot** — Free shows one static, non-tracking sponsor card; you
  control its content via env vars. [SPONSOR_SLOT.md](SPONSOR_SLOT.md).
- **License keys** — paid tiers activate with an offline-verified key pasted
  once in *Settings → General → Plan & License*. Works air-gapped.
  [LICENSES.md](LICENSES.md).
- **Stripe** — only if you want online card payments from *your* customers;
  leave `STRIPE_*` blank for manual invoicing.

## Your data, your exit

Everything lives in your Postgres/MinIO volumes (`data/`). Back those up and
you can restore or migrate anywhere. Expired or absent licenses never touch
your data.
