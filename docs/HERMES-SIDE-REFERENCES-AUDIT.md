# Hermes-side → Odysseus Reference Audit

> **Audit headline: zero hard-stale references remain in `.hermes/`.**
>
> One-page diff between `/c/Users/nikma/.hermes/` + `/c/Users/nikma/Brainz/skills/`
> (still on disk for inheritance) and the live artifact in `/c/Users/nikma/Brainz/odysseus/`.
> Captured on 2026-06-18 from a fresh sweep of 62,916 files under the two hermes-side roots.

## Headline Counts

| Bucket | Count | Status |
|---|---:|---|
| Hard-stale shell paths under `.hermes` (`Brainz/skills/migrate-*`, `flip-mutating.py`) | 0 | ✓ nothing to fix in config/scripts |
| Hard-stale paths inside Odysseus tree | 0 | ✓ consolidation is clean |
| Pre-commit config / hooks still under `.hermes` | 0 | ✓ moved to `odysseus/.pre-commit-config.yaml` |
| `evolution_scheduler.py` / `evolution_queue_api.py` references to migrated skills | 0 | ✓ scheduler doesn't talk to the migrated catalog |
| Cron jobs in `.hermes/cron/jobs.json` with explicit `skills:` arrays | 8 (of 14) | ✓ all 8 names are already in Odysseus's `SKIP` list (lineage) |
| Source-side skills in `~/Brainz/skills/` missing `source: hermes` frontmatter | 65 of 65 | ✓ **by design** — migration markers live on the *destination* (`odysseus/data/skills/brainz/<name>/SKILL.md`), not the source |

## Stale — must or should update

### 1 hit — soft refresh

| File | Line | Hit |
|---|---:|---|
| `scripts/migrate_hermes/migrate_skills.sh` | 59 | `description: "Hermes-migrated skill for $name (auto-bridged by ~/Brainz/skills/migrate-skills.sh)"` (inside the heredoc that generates each skill's `SKILL.md`) |

**What it is:** a self-referential text snippet baked into every auto-generated
`data/skills/brainz/<name>/SKILL.md`. The path it cites (`~/Brainz/skills/migrate-skills.sh`)
references where the migration script *used* to live on the developer's box.

**Verdict:** lineage truth at the moment of mass-migration. The script itself is now
`odysseus/scripts/migrate_hermes/migrate_skills.sh`; updating the string would rewrite
every regenerated `SKILL.md` description. **Update only if** you want the auto-generated
docs to describe the canonical path; leave as-is if you want to preserve "this skill was
bridged from Hermes on day X" provenance.

Suggested fix (one line change inside the heredoc):

```diff
- description: "Hermes-migrated skill for $name (auto-bridged by ~/Brainz/skills/migrate-skills.sh)"
+ description: "Hermes-migrated skill for $name (auto-bridged by odysseus/scripts/migrate_hermes/migrate_skills.sh)"
```

Apply this only when running migration against a target tree you intend to be the long-term
artifact. Existing `data/skills/brainz/<name>/SKILL.md` files keep the old wording until
re-migrated.

## Lineage — keep, do not touch

### Cron jobs referencing migrated skill names

Eight cron entries in `~/.hermes/cron/jobs.json` (updated 2026-06-18 07:00) reference
skill names that now live in Odysseus's `SKIP` list — meaning their canonical source is
`odysseus/data/skills/brainz/<name>/`, and the cron invocation should resolve via the
migrated artifact, not the original `~/Brainz/skills/<name>/` source dir. Job ID equals
skill name in every row.

| Job ID (literal from `jobs.json`) | Skills list | Schedule | Last status |
|---|---|---|---|
| `auto-resolve` | `[auto-resolve]` | every 5m | ok |
| `coder` | `[coder]` | every 12h | degraded |
| `github-scout` | `[github-scout]` | every 1d | ok |
| `mining-ops-bot` | `[mining-ops-bot]` | every 15m | ok |
| `researcher` | `[researcher]` | every 3h | degraded |
| `securitybot` | `[securitybot]` | every 12h | ok |
| `sysbot` | `[sysbot]` | every 1h | degraded |
| `tradingdesk` | `[tradingdesk]` | every 20m | ok |

These jobs continue to work because the migrated SKILL.md files at
`~/Brainz/odysseus/data/skills/brainz/<name>/SKILL.md` are what the cron agent resolves
against. They are not "stale references" — they are working references to the live
artifact. Nothing to change.

## What this audit cannot prove

- The 47 / 16 / 2 counts from the migration script (*Copied / Skipped / Failed*) live
  in the script's stdout; this audit reads only files, not stdout. Re-run
  `bash odysseus/scripts/migrate_hermes/migrate_skills.sh` to re-verify in-CI parity.
- Cron job *resolution* (does the agent actually find the migrated SKILL.md when
  invoked?) is a runtime check. The `dry_run_ci.sh` mirrors the CI gate and runs the
  three pytests including `test_mcp_url_liveness.py`; run it on a host with Python 3.11
  for full parity.

## Suggested follow-on actions (priority-ordered)

1. **Tag the milestone.** A single `git tag odysseus-hermes-port-complete` captures this state.
2. **Decide on the 1 soft-stale hit.** Either rewrite the heredoc string in
   `migrate_skills.sh` for canonical-path provenance, or leave it as "migrated from" lineage.
3. **Run `dry_run_ci.sh` on a Python-3.11 host** to re-verify the gate end-to-end with
   the consolidated skill catalog loaded.

> See [`README.md` supersedes banner](../README.md) for the canonical artifact
> catalog. This audit is the lineage diff, not the catalog.
