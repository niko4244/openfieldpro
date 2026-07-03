# Pro, Founder & Business — what a license actually buys

The rule that governs everything here: **Housecall Pro parity and the core
service workflow are free forever.** No user limits, no technician limits,
no job limits, no customer limits, no telemetry, no lock-in. Paid tiers are
polish, branding, premium workflows, integrations, and support — never
hostage-taking.

## Tier comparison

| | **Free** | **Pro** | **Founder** | **Business** | Proprietary SaaS |
|---|---|---|---|---|---|
| Complete FSM core (scheduling, dispatch, invoicing, estimates, customers, jobs, service history, core reports, mobile, offline sync) | ✔ | ✔ | ✔ | ✔ | per-seat $$ |
| Unlimited users / techs / jobs / customers | ✔ | ✔ | ✔ | ✔ | usually metered |
| Self-hosted, your data, no telemetry | ✔ | ✔ | ✔ | ✔ | — |
| Sponsor card on dashboard | shown | removed | removed | removed | (ads: your data) |
| Branded reports & emails (your logo, no "Powered by OpenFieldPro") | — | ✔ | ✔ | ✔ | ✔ |
| Premium themes | — | ✔ | ✔ | ✔ | varies |
| Advanced exports & analytics | — | ✔ | ✔ | ✔ | upper tiers |
| Premium plugins, industry packs, AI workflow packs | — | ✔ | ✔ | ✔ | upper tiers |
| Business connectors (QuickBooks, Zapier, ERP/API) | — | — | — | ✔ | upper tiers |
| Official support badge | — | ✔ | ✔ | ✔ | ✔ |
| Term | forever | annual | **lifetime** | annual/lifetime | monthly forever |

**Founder** is the first-customer offer: *"Founder's License — lifetime Pro
access for early supporters."* It unlocks everything Pro has, never expires,
and shows as **Founder** in the UI.

**Business** is currently mostly scaffolding: the tier, feature flag
(`businessIntegrations`), and plugin gates (QuickBooks, Zapier) exist;
deeper ERP/API/payroll-style connectors and multi-location polish land
behind it later. Nothing core will ever move into it.

## The feature flags (source of truth)

`packages/shared/src/features.ts` — `featuresForPlan(plan)`:

| Flag | free | pro | founder | business |
|---|---|---|---|---|
| `removeSponsorSlot` | — | ✔ | ✔ | ✔ |
| `brandedReports` | — | ✔ | ✔ | ✔ |
| `customThemes` | — | ✔ | ✔ | ✔ |
| `advancedExports` | — | ✔ | ✔ | ✔ |
| `advancedAnalytics` | — | ✔ | ✔ | ✔ |
| `premiumPlugins` | — | ✔ | ✔ | ✔ |
| `industryPacks` | — | ✔ | ✔ | ✔ |
| `aiWorkflowPacks` | — | ✔ | ✔ | ✔ |
| `businessIntegrations` | — | — | — | ✔ |
| `officialSupportBadge` | — | ✔ | ✔ | ✔ |

Missing/invalid/expired license ⇒ all flags off (Free). Flags only ever hide
premium *polish* — no user data is deleted or destructively hidden by any
license state. Checked by `apps/api/test/features.test.ts`.

Plugin install/enable gates additionally use `planAtLeast()` ranking
(`free < pro < founder < business`) via the `REQUIRED_PLAN` map in
`apps/api/src/routes/plugins.ts`.

## Scaffolding that ships now, content later

- **Themes** (`packages/shared/src/themes.ts`): default & dark are free;
  blue-collar, industrial, minimal, and seasonal packs are Pro. Metadata
  only today — the theming engine lands with the first premium theme.
- **Industry packs** (`packages/shared/src/packs.ts`): Appliance, HVAC,
  Plumbing, Electrical, Garage Doors, Pest Control, Cleaning, Locksmith —
  each will bundle job templates, checklists, line-item presets, and comms
  templates.
- **AI workflow pack**: prompts, automations, inspection templates, forms,
  checklists, diagnostic scripts, customer-communication templates.
- **Future premium plugins** (candidates): AI CSR, HVAC Load Calculator,
  Warranty Claims, Fleet GPS, Flat Rate Builder, AI Dispatcher, QuickBooks,
  Parts Inventory+, Purchase Orders, Financing, SMS Bundle, Call Recording,
  AI Call Summary. The plugin manifest already carries `category`,
  `tierRequired`, `localOnly`, and `featureFlags`
  (`packages/plugin-sdk/src/manifest.ts`).

## Buying / activating

See [MONETIZATION.md](MONETIZATION.md) for selling and
[LICENSES.md](LICENSES.md) for the key mechanics. Short version: buy via any
payment link, receive a key, paste it in *Settings → General → Plan &
License*, verified locally forever.
