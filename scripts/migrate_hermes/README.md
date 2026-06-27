# Hermes Migration Scripts

One-off scripts to seed Hermes's catalog into Odysseus `app.db`. Run from this
directory (`scripts/migrate_hermes/`) — scripts assume their cwd matches the
Odysseus repo root and `~/Brainz/odysseus` is the install path.

| Script | Purpose | Idempotent? |
|--------|---------|-------------|
| `migrate_skills.sh` | Re-create `data/skills/brainz/*` from `~/Brainz/skills` | yes (overwrite-in-place) |
| `migrate_mcps.py` | Seed `mcp_servers` table from `~/.claude/mcp*.json` + `~/.config/opencode/opencode.json`; also retires known misconfigs | yes |
| `flip_mutating.py` | Toggle `mutating: false → true` on a curated skill allowlist | yes |

## Retired MCP server naming convention

When an MCP server is soft-deleted (kept for audit, set `is_enabled=0`), the
`name` column is renamed so future re-insertions can't collide and so a
single SQL pattern can find the retired set.

**Format:** `<original-id>-retired-<reason>`

### Allowed reasons

| Reason     | When to use                                              |
|------------|----------------------------------------------------------|
| `misconfig`| Config was wrong (transport, port, args) — would 404      |
| `stale`    | Endpoint is no longer reachable / maintained              |
| `replaced` | Newer identity supersedes this one                        |
| `dup`      | Duplicate entry surviving a multi-source merge           |

Date markers go in `updated_at`, never in the `name`.

### One-line audit query

```sql
SELECT id, name, transport, updated_at
FROM mcp_servers
WHERE name LIKE '%-retired-%'
ORDER BY updated_at DESC;
```

That single `LIKE` pattern is the contract — any future retire path must
follow it so the audit query stays correct.

### Example

The SSE-gbrain misconfig added in the 2026-06-18 bulk wave:

```
id      = 'gbrain'
name    = 'gbrain-retired-misconfig'
url     = 'http://127.0.0.1:3131/sse'   (preserved for audit; ignored at runtime)
is_enabled = 0
```

## Local pre-commit gate

The repo root's `.pre-commit-config.yaml` mirrors the CI hook: every time a
file under `scripts/migrate_hermes/` or `tests/test_mcp_url_liveness.py`
is staged, the commit re-runs `migrate_mcps.py` followed by the liveness
probe before letting the commit land.

Setup (one-time per clone):

```bash
pip install pre-commit
pre-commit install
```

Without `pre-commit install` the gate is silent — git's pre-commit hook is
only populated by the framework. Use `git commit --no-verify` only as an
escape hatch; the GH Action still catches regressions at PR time.
