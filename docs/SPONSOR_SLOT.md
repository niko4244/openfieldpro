# The sponsor slot

The Free plan shows **one** small, clearly-labeled sponsor card at the bottom
of the dashboard (`apps/web/components/sponsor-slot.tsx`; a one-line twin in
the mobile app, `apps/mobile/components/SponsorBanner.tsx`). Pro, Founder,
and Business hide it.

## Hard rules (enforced by design, please keep them)

- **No ad network.** Ever.
- **No tracking**: no pixels, no analytics, no behavioral targeting, no
  third-party scripts, no remote ad loading.
- **Static, local content only** — the self-hosting admin controls it.
- **Clearly labeled**: it reads "Sponsored by X," not native advertising.
- One tasteful card. It should feel like a stadium banner, not a pop-up.

## Configuring it (self-hosting admin)

Set build-time env vars on the web app (all optional):

```bash
NEXT_PUBLIC_SPONSOR_NAME="Smith Supply Co."
NEXT_PUBLIC_SPONSOR_TEXT="Parts delivered same-day in the tri-county area."
NEXT_PUBLIC_SPONSOR_URL="https://smithsupply.example"
```

- With `NEXT_PUBLIC_SPONSOR_NAME` set, the card renders
  "**Sponsored by Smith Supply Co.** — Parts delivered same-day…", linking to
  the URL if provided (`rel="noreferrer sponsored"`, no scripts).
- With nothing set, it falls back to a house line supporting the project:
  *"OpenFieldPro is free & open source — this space supports development."*

## Removing it

Activate any paid license (Pro, Founder, or Business) in
*Settings → General → Plan & License*. The slot disappears everywhere —
that's the deal.
