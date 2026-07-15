# OpenFieldPro Brand Kit

Business model, positioning, and public voice are governed by `docs/product/BUSINESS_PLAN_AND_VOICE.md`. This brand kit should be read as the visual and copy companion to that canon.

## Brand position

OpenFieldPro is an open-source field service command center for service businesses that want to own their software, data, workflows, and customer experience.

**Primary idea:** Own your field operations.

**Product category:** Open-source, self-hostable field service management.

**Audience:** HVAC, appliance repair, plumbing, electrical, cleaning, handyman, and small-to-mid-sized home-service teams.

## Voice

OpenFieldPro should sound practical, direct, and field-ready.

Use:

- Own your field operations.
- Built for service businesses that want control.
- Self-hostable by design.
- No telemetry. No phone-home licensing. No artificial core limits.
- Dispatch, schedule, invoice, and track work from your own stack.

Avoid:

- Generic startup claims.
- Hype phrases like “revolutionary,” “ultimate,” “synergy,” or “unlock your potential.”
- Direct naming of competitor products in repository copy, docs, metadata, or UI. Refer generically to “commercial field-service suites,” “subscription-first field-service platforms,” or “legacy field-service software.”

## Visual direction: Field Command

The product should look like a serious field-service operations board, not a generic blue SaaS dashboard.

Use:

- Dark command-center surfaces.
- Route-map/grid textures.
- Job cards and technician status cards.
- Status pills.
- Practical dashboard panels.
- Cream/light surfaces for marketing contrast.
- Clear sponsor placement that is useful and labeled.

Avoid:

- Clip-art houses, roofs, gears, or wrenches as the main brand identity.
- Cartoon contractor imagery.
- Overly playful gamification.
- Confusing loyalty “points” metaphors for service plans.

## Color system

| Role | Name | Hex |
|---|---|---|
| Primary dark | Command Navy | `#101820` |
| Primary accent | Field Green | `#22C55E` |
| Secondary accent | Signal Amber | `#F59E0B` |
| Technical accent | Route Cyan | `#06B6D4` |
| Warm base | Ledger Cream | `#F7F3EA` |
| Surface | Paper White | `#FFFFFF` |
| Text | Ink Black | `#111827` |
| Muted text | Worksite Gray | `#6B7280` |
| Border | Steel Line | `#D1D5DB` |
| Danger | Fault Red | `#EF4444` |

## CSS tokens

```css
:root {
  --ofp-command-navy: #101820;
  --ofp-field-green: #22C55E;
  --ofp-signal-amber: #F59E0B;
  --ofp-route-cyan: #06B6D4;
  --ofp-ledger-cream: #F7F3EA;
  --ofp-paper-white: #FFFFFF;
  --ofp-ink-black: #111827;
  --ofp-worksite-gray: #6B7280;
  --ofp-steel-line: #D1D5DB;
  --ofp-fault-red: #EF4444;
}
```

## Typography

Recommended stack:

- Headings: Space Grotesk when available; otherwise Inter/system.
- Body/UI: Inter/system.
- Data/code labels: IBM Plex Mono or system monospace.

Current repo implementation uses system-safe Inter-first stacks through `apps/web/app/globals.css`.

## Logo direction

Use a compact OpenFieldPro mark that reads as an operational field tile: an open square, field grid, route point, or `OF` lockup. The mark should work inside the app sidebar, favicon, docs, and landing page.

Current implemented mark: `OF` inside a rounded Field Green command tile.

## Service plan language

Use service-plan mechanics that service businesses immediately understand:

- Included visits.
- Renewal date.
- Priority scheduling.
- Maintenance reminders.
- Customer-facing plan status.
- Included benefits.

Do not use unexplained loyalty points unless the feature is explicitly built and explained.

## Demo technician naming

Use neutral demo technician names that are not tied to real collaborators or users.

Approved examples:

- Tech Rowan
- Tech Mira
- Tech Lane
- Tech Sora
- Tech Arden
- Tech Ellis

Avoid collaborator names, customer names, or names from real user data.

## Sponsor model language

Sponsor placement should be described as clear, useful, and local.

Use:

- Clearly labeled sponsor space.
- Local vendor sponsor slot.
- No ad networks.
- No telemetry-based targeting.
- Pro removes sponsor placement.

Avoid:

- “Ads” as the primary framing.
- Tracking, pixels, behavioral targeting, or ad-network language.

## Landing-page sections

The branded landing page should follow this order:

1. Hero: Own your field operations.
2. Field command dashboard visual.
3. Command map for product areas.
4. Product showreel moments.
5. Service plan system.
6. Sponsor model.
7. Trade configurator.
8. Final ownership CTA.
