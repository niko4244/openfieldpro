# Changelog

All notable changes to Odysseus are documented in this file.

## [odysseus-hermes-port-complete] - 2026-06-18

Consolidation milestone: every Hermes-side / Brainz-side runtime contract now
lands here, with a local pre-commit gate mirroring the CI workflow.

> **Tag note** — the working tree contains milestone artifacts (the files
> listed in *Pending commit* below) that are not yet committed. The lightweight
> tag `odysseus-hermes-port-complete` is therefore anchored at the current
> `HEAD` commit, which pre-dates this milestone's work. To make the tag
> meaningful:
>
> 1. Stage the milestone files: `git add .pre-commit-config.yaml scripts/migrate_hermes/ tests/test_mcp_url_liveness.py README.md docs/HERMES-SIDE-REFERENCES-AUDIT.md CHANGELOG.md .github/workflows/migrate-hermes-tests.yml`
> 2. Commit: `git commit -m "odysseus: hermes-port complete — milestone wrap-up"`
> 3. Re-tag as annotated: `git tag -fa odysseus-hermes-port-complete -m "Wrap-up release"`
>
> After that, `git checkout odysseus-hermes-port-complete` retrieves the
> milestone features.

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

### Pending commit

Files in the working tree that ARE part of this milestone and should land
together. Until they're committed, `git checkout odysseus-hermes-port-complete`
doesn't retrieve the milestone features:

- `.pre-commit-config.yaml` *(new — pre-commit gate)*
- `.github/workflows/migrate-hermes-tests.yml` *(paths-filter added)*
- `scripts/migrate_hermes/dry_run_ci.sh` *(new — local CI mirror)*
- `scripts/migrate_hermes/migrate_skills.sh` *(ensure_dir_writable extracted
  + dst-guard `[ -d ] || rm -rf` predicate scaled to stub/broken-symlink/missing)*
- `scripts/migrate_hermes/README.md` *(Local pre-commit gate section added)*
- `tests/test_mcp_url_liveness.py` *(TCP+HTTP probe, CEILING note tightened)*
- `README.md` *(supersedes banner at top)*
- `docs/HERMES-SIDE-REFERENCES-AUDIT.md` *(new — one-page lineage diff)*
- `CHANGELOG.md` *(this file)*

### Reference

- Reach the tag: `git checkout odysseus-hermes-port-complete`
- Audit lineage: [`docs/HERMES-SIDE-REFERENCES-AUDIT.md`](docs/HERMES-SIDE-REFERENCES-AUDIT.md)
- Migration scripts: [`scripts/migrate_hermes/`](scripts/migrate_hermes/)
