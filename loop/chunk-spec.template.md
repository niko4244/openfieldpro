# Chunk: {{ phaseLabel }} — {{ stepTitle }}

## Context (read first)

OFP today: Phase 5c shipped (triggers + automation rules + A/B variants). Wave 1a providers ship-ready. Current phase lands you here.

Files you MUST read before writing anything:

- `Brainz/decisions/2026-06-30-ofp-phase5b-templates-architecture.md` (Ponytail rule, ADR-protocol reminder)
- `loop/audit-matrix.md` (the row(s) this chunk closes)
- `loop/roadmap.md` (where this chunk sits in the larger sequence)

## Goal

{{ goal }}

## HCP parity reference

This chunk target: rows under `## {{ surfaceSection }}` in `audit-matrix.md` whose Status flips from {{ fromStatus }} → {{ toStatus }}.

## Scope (≤ 10 files)

{{ scopeList }}

## Out of scope (do NOT touch)

- Anything outside the scope list above
- Comment-only / purely cosmetic changes (Ponytail: deletion over addition)
- New package dependencies (ask the user explicitly if one seems unavoidable)

## Implementation constraints (Ponytail + ADR-protocol)

- ponytail: every conscious shortcut gets a one-line `ponytail:` comment naming the ceiling + upgrade path
- Type derivations go through `(typeof foo.enumValues)[number]` style — no hand-coded unions (Phase 5c+ established this convention)
- Zod-validate every HTTP request body (consistent with `/api/templates` + `/api/automation/rules`)
- No abstractions the spec didn't ask for
- cheap is better than clever
- sprint on small: if you cross 10 files, you've probably over-scoped; flag it and split

## Verification (must pass before you commit)

Run these commands and confirm exit 0 on each:

```bash
cd openfieldpro
pnpm --filter @ofp/api test
pnpm --filter @ofp/{api,web,worker,shared,db} exec tsc --noEmit
```

Write at least {{ minNewTests }} new test cases proving the new behavior. Pure-Node where possible (DB-free for hash/picker/glue logic). Route integration tests where mocks are OK.

## Commit message

```
phase{{ phaseNumber }}{{ subLetter }}: {{ shortVerb }} {{ nounPhrase }}
```

## When done

- Update `loop/state.json` via `node scripts/advance-state.js --success` (or just commit and the runner does it)
- Append one-sentence note to `Brainz/decisions/2026-06-30-ofp-phase5b-templates-architecture.md` permanently tagging this chunk shipped
- Move on to next chunk
