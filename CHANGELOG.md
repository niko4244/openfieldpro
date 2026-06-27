# Changelog

All notable changes to Odysseus are documented in this file.

## [Unreleased] - 2026-06-27

### Added

- **[`docs/push-recipe.md`](docs/push-recipe.md)** — three git-ops lessons
  from the 2026-06-26/27 force-push chain that landed the OFP project at
  `niko4244/openfieldpro` (the path that works without the `delete_repo`
  OAuth scope): rescuing an over-broad initial push with
  `git rm --cached -r <dir>` and `git push --force-with-lease`; detecting
  cwd-leak failures before destructive git ops via an early
  `git remote get-url origin` sanity check after `cd` (or, belt-and-
  suspenders, using absolute `git -C /path` everywhere); and leak
  detection in the staged set with `git diff --cached --name-only
  --diff-filter=A` instead of `--name-only` alone, so intentional
  `git rm --cached` deletions do not trip the leak-check on themselves.
  Includes the OFP 10-item holdback regex (`.env`, `.ofp-store.json`,
  `coverage.json`, `TODO.md`, `Agents/`, `dev-docs/`, `docs/windows-port`,
  `.github/`, `.husky/`, `.pre-commit-config.yaml`) for re-use on future
  cleanups.

### Reference

- Reach the doc: [`docs/push-recipe.md`](docs/push-recipe.md)

## [odysseus-hermes-port-complete] - 2026-06-18

Consolidation milestone: every Hermes-side / Brainz-side runtime contract now
lands here, with a local pre-commit gate mirroring the CI workflow.

> **Holdback note** — `.pre-commit-config.yaml` and
> `.github/workflows/migrate-hermes-tests.yml` were authored for this milestone
> but are deliberately **kept out of version control** under the OFP push
> recipe's `minimum: code + tests + docs only` rule. The four rules
> (`.pre-commit-config.yaml`, `.github/`, `.husky/`, plus the new
> `coverage.json` / `TODO.md` / `Agents/` block at the bottom of `.gitignore`)
> are the source of truth for what gets caught at push time; the rationale
> and recovery procedure live in [`docs/push-recipe.md`](docs/push-recipe.md). The lightweight tag
> `odysseus-hermes-port-complete` is therefore **symbolic** — it anchors at
> the milestone's `HEAD` even though the held-back files are intentionally
> absent from new clones. The migration scripts that *do* ship (and that
> capture the milestone's runtime work) live under
> [`scripts/migrate_hermes/`](scripts/migrate_hermes/), see the index table
> in `scripts/migrate_hermes/README.md`.

### Added

#### Migration scripts (`scripts/migrate_hermes/`)

- `migrate_skills.sh` — bulk-imports 49 Hermes skills into
  `data/skills/brainz/` with autogen Odysseus-format `SKILL.md` frontmatter.
  Idempotent; safe on repeat runs. Calls the shared `ensure_dir_writable()`
  helper at both mkdir call sites.
- `migrate_mcps.py` — migrates registered MCP servers from
  `~/.claude/mcp.json` into `mcp_servers/mcp.json`. Idempotent via
  insert-vs-skip semantics.
- `flip_mutating.py` — toggles `mutating:` frontmatter for sanctioned skills.

#### Pre-commit gate (`\.pre-commit-config.yaml`)

- Two `local` hooks under `language: system`: `migrate-hermes-mcps` runs
  `python scripts/migrate_hermes/migrate_mcps.py`, `mcp-url-liveness` runs
  `python -m unittest tests.test_mcp_url_liveness`. Gated by
  `pass_filenames: false` and the regex
  `^scripts/migrate_hermes/|^tests/test_mcp_url_liveness\.py`. One-time setup:
  `pip install pre-commit && pre-commit install`.

#### CI paths filter (`\.github/workflows/migrate-hermes-tests.yml`)

- `paths:` filter on both `push:` and `pull_request:` events scoped to
  `scripts/migrate_hermes/**` and `tests/test_mcp_url_liveness.py`. Saves CI
  minutes on documentation-only PRs. GH Actions still fires on workflow
  self-updates by built-in behavior.

#### Liveness test (`tests/test_mcp_url_liveness.py`)

- Routed from TCP-only to TCP+HTTP/1.1 GET probe via `_probe` (TCP connect →
  SSL wrap if HTTPS → `GET <path> HTTP/1.1` → read status line → asserts
  `status != 404 AND status < 500`).
- CEILING note: _"Fails in CI (no port-3131 listener); locally with stray
  listeners, run `netstat -tlnp | grep` first to confirm it's a definitive
  gate."_

#### Dry-run helper (`scripts/migrate_hermes/dry_run_ci.sh`)

- Local mirror of the GH Action validate job — pre-flights the migration +
  pytest gate on this machine before pushing.
- Strict Python 3.11 enforcement via `case "$PY_VERSION"` (FATALS with usage
  hint on mismatch so 3.13-on-dev-box fails loud instead of silently matching)
- `python3`-first PYTHON default with `python` fallback (PEP 394); the
  `$PYTHON` env var overrides.
- `canon()` path-normalisation helper (`realpath → readlink -f → echo`)
  prevents MSYS cygpath drift in the symlink/REPO_ROOT comparison.
- Single invocation: `bash scripts/migrate_hermes/dry_run_ci.sh`.

#### Helper extraction (`ensure_dir_writable()` in `migrate_skills.sh`)

- One-line bash function centralising the dst-guard predicate
  `[ -d "$p" ] || rm -rf "$p" 2>/dev/null || true` followed by `mkdir -p`.
  Used at both call sites (top-level `$DST`, per-skill `$DST/$name`).
  Defensive `local p="${1:?usage: ensure_dir_writable <path>}"` arg-guard
  catches programmer call-site errors before they reach `mkdir -p ""` under
  `set -e`. Docstring flags the rule-of-three trigger for hoisting into
  `_lib.sh` if a third call site appears.

### Verified

- **3-shape narrowness test** on a non-skipped skill (`api-and-interface-design`):
  real directory baseline → md5 stable / regular file stub → predicate
  strips, recreates dir, md5 matches / dangling symlink stub → predicate
  strips, recreates dir, md5 matches.
- **Repeat-idempotency**: `Copied: 47` consistent across back-to-back runs.
- **End-to-end workflow dry-run**: 8 pytest cases collected, all passed in
  ~78 s.
- **Hermes-side reference audit** (62,916 files swept): 0 hard-stale shell
  paths, 0 pre-commit configs, 0 evolution-scheduler refs in `~/.hermes/`.
  Full lineage listed in `docs/HERMES-SIDE-REFERENCES-AUDIT.md`.

### Local-only holdbacks (deliberate — see [`docs/push-recipe.md`](docs/push-recipe.md))

Authored-for-this-milestone artifacts that are kept out of version control by
design. Stated here so a future operator doesn't read the recipe's `HOLD`
regex and treat their absence as a bug:

- `.pre-commit-config.yaml` *(mirrors the GH Action `validate` job — kept
  local; the recipe's `--no-verify` is the supported escape hatch when a
  commit genuinely must bypass it.)*
- `.github/workflows/migrate-hermes-tests.yml` *(the paths-filtered CI gate
  is reproduced locally by `scripts/migrate_hermes/dry_run_ci.sh`, which IS
  committed and is the supported way to re-verify before pushing.)*

The remaining items listed in earlier drafts of this section have since
landed in commits `c21a8d4`, `b97d7bb`, and `049a8f8` (see `git log
--oneline`); they are part of the codebase now and not "pending".

The 10-item `HOLD` regex in [`docs/push-recipe.md`](docs/push-recipe.md) is
the source of truth for what gets caught at push time; `.gitignore` mirrors
it so accidental `git add -A` is also filtered. If you add a new
authored-here policy (e.g. `.wiki/`, `Agents/<name>/`), update both files
together.

### Reference

- Reach the tag: `git checkout odysseus-hermes-port-complete`
- Audit lineage: [`docs/HERMES-SIDE-REFERENCES-AUDIT.md`](docs/HERMES-SIDE-REFERENCES-AUDIT.md)
- Migration scripts: [`scripts/migrate_hermes/`](scripts/migrate_hermes/)
