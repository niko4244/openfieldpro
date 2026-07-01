# OFP-vs-HCP Audit Loop

A tmux-managed nightly loop that picks the next chunk from the roadmap and ships
it via Claude Code / Codex. Each chunk is bounded, verifiable, and produces a
green test + typecheck before the loop advances.

## Files

| Path | Purpose |
|---|---|
| `audit-matrix.md` | One row per HCP capability: status, parity depth, surface, blocker. Source of truth. |
| `roadmap.md` | Phased sequence that resolves the matrix into ~5-10 sub-chunks per phase. |
| `state.json` | Loop runtime state (current phase, step index, history). Mutated by advance-state.js. |
| `chunk-spec.template.md` | Markdown template; substituted with the picked item's plan to produce `current-chunk.md`. |
| `current-chunk.md` | The single-paragraph Claude Code prompt for the currently running chunk. Generated, not committed. |
| `log/` | Per-run tmux tee's log + per-step prompt + claude JSON event log. |
| `scripts/generate-chunk-spec.js` | Reads state + roadmap + template, emits current-chunk.md. |
| `scripts/advance-state.js` | Updates state.json after a successful step (commit hash, decision-log). |
| `scripts/decide-next.js` | Reads state + roadmap, picks next step. |
| `start-loop.sh` | The runner. `start-loop.sh --next` = one chunk; `--forever` = loop until done or fail. |

## Status legend

Status emoji in the matrix:

- 🟢 = parity (HCP feature shipped at a usable level in OFP)
- 🟡 = partial (some surface exists but feature depth is materially behind)
- 🔴 = missing (no corresponding surface in OFP today)
- ⏸️ = dep (blocked by a 🔴 or 🟡 upstream of this row)

Surface area tags: DB / API / W (web) / Wkr (worker) / M (mobile).

## Running

Prereqs:
- `node` (for the generator scripts)
- `claude` (the Claude Code CLI) on PATH OR `codex` for the Code path
- `tmux`
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` if using Codex) exported
- The `pnpm` workspace healthy: `cd openfieldpro && pnpm install`

```bash
cd openfieldpro/loop
./start-loop.sh --next            # one chunk, exits
./start-loop.sh --forever         # loop, persists until banner pause or fail
./start-loop.sh --status          # print current state.json + next-up chunk
./start-loop.sh --dry             # generate current-chunk.md but don't run Claude
```

## Per-step verification contract

Per the Ponytail rule + the chunk spec, every chunk:
- Touches ≤10 files (throw a `ponytail:` comment if you cross it intentionally)
- Adds at least 1 test (DB-free pure-Node where possible; route integration where DB-mock is OK)
- Does NOT add new dependencies without explicit comment
- Does NOT introduce abstractions the spec didn't call for
- Ends with `pnpm --filter @ofp/api test` (and `@ofp/web` + `@ofp/worker` + `@ofp/shared` + `@ofp/db` for slices touching them) showing green
- Ends with the workspace typecheck clean

If the chunk fails any of those, the loop writes `log/<step>.fail.txt` and
exits non-zero. Re-run with `--next` after fixing the failure — the loop will
resume at the SAME step (state.json is preserved on failure).

## Audit caveats

The matrix is a snapshot of marketing-site + help-center claims for HCP. It's
deliberately pessimistic: a 🟢 only when OFP's depth matches HCP's described
depth. A 🟡 means "exists, but a real customer would notice the gap." Each row
points to the OFP-side surface that needs to land.

The roadmap sequences the matrix into phases where each phase shell-shocks one
of those surface areas. Phases get smaller over time (peck-off pattern) so the
later chunks are leaner.
