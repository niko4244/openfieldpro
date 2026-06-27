# ponytail: one-off migration script to seed Hermes's 19 MCP servers into Odysseus app.db.
# Skips entries already present (idempotent). Treats first-seen definition as canonical
# and skips duplicates from sibling sources (the two Claude mcp-* configs overlap).
# Ceiling: this script is destructive — doesn't currently support uninstall. Run it once
# or wrap in a config-driven replay.
# Upgrade: codegen from a single canonical mcp.yaml source-of-truth.

import json, os, re, sys
from pathlib import Path

ODYSSEUS_ROOT = Path.home() / 'Brainz' / 'odysseus'
sys.path.insert(0, str(ODYSSEUS_ROOT))
os.chdir(ODYSSEUS_ROOT)

from core.database import SessionLocal, McpServer, Base, engine  # noqa: E402

# Ensure tables exist (idempotent).
Base.metadata.create_all(bind=engine)

# Canonical source files (later overrides earlier).
sources = [
    Path.home() / '.claude' / 'mcp.json',
    Path.home() / '.claude' / '.mcp.json',
    Path.home() / '.config' / 'opencode' / 'opencode.json',
]

# Merge dict: mcp_name -> config.
merged = {}
for s in sources:
    if not s.exists(): continue
    raw = s.read_text(encoding='utf-8')
    raw = re.sub(r',(\s*[}\]])', r'\1', raw)  # tolerate trailing commas
    try: d = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f'  skip {s.name}: {e}'); continue
    servers = d.get('mcpServers') or d.get('mcp') or {}
    if isinstance(d.get('mcp'), dict) and 'type' in d['mcp']:
        servers['_opencode_top'] = d['mcp']
    for name, cfg in servers.items():
        if name == '_opencode_top':
            cfg = {'type': 'remote', 'url': cfg.get('url')}
        merged.setdefault(name, {'source': str(s), 'cfg': cfg})

print(f'Collected {len(merged)} unique MCP definitions to migrate.')

def classify(cfg):
    # ponytail: returns a consistent 5-tuple (transport, command, url, args, env) so
    # callers can unpack unconditionally. Previous version returned 4 vs 5 depending
    # on branch, causing 'too many values to unpack' on the SSE branch.
    # Ceiling: heuristic; ws:// or grpc transports aren't covered yet.
    # Upgrade: discover transport from cfg.type if present, else fall back to URL test.
    if isinstance(cfg.get('url'), str) and cfg['url'].startswith(('http://', 'https://')):
        return ('sse', None, cfg.get('url'), [], {})
    cmd = cfg.get('command') or cfg.get('cmd')
    args = cfg.get('args') or []
    env = cfg.get('env') or {}
    return ('stdio', cmd, None, args, env)

session = SessionLocal()
try:
    inserted = 0; skipped = 0; failed = 0; retired = 0

    # Retire the historic SSE-gbrain misconfig. Seeded in a 2026-06-18 bulk-add
    # wave from the stitch SSE shape — but gbrain's real integration is stdio
    # (row id='b0dbd2d0'), so this SSE URL would bind to a non-existent port 3131
    # and 404 every call. Renaming + disabling here makes the failure mode visible
    # to test fixtures and prevents the next migrate run from overwriting the
    # retire back to the misconfig state.
    #
    # Naming follows the `*-retired-*` convention documented in
    # scripts/migrate_hermes/README.md: `<original-id>-retired-<reason>` where
    # `<reason>` is one of {misconfig, stale, replaced, dup}. Grep `%-retired-%`
    # against the `name` column to enumerate the retired set.
    #
    # ponytail: conditional mutation on (id, transport); only mutates when the
    # row is out of the retired state. Re-runs on a healthy retired row are
    # no-ops (avoids bumping updated_at), and a subsequent "delete + re-add"
    # from source configs re-enters the same retire branch.
    # Ceiling: matches only the exact misconfig signature. If someone later adds
    # a legitimately-different SSE gbrain entry, it will be retired too — but
    # gbrain has no SSE integration by design, so this is acceptable.
    # Upgrade: codify misconfig signatures in a config-driven retire list so
    # future misconfig patterns don't require a code change to this file.
    gbrain_row = session.query(McpServer).filter_by(
        id='gbrain', transport='sse'
    ).one_or_none()
    if gbrain_row is not None and (
        gbrain_row.name != 'gbrain-retired-misconfig' or gbrain_row.is_enabled
    ):
        gbrain_row.name = 'gbrain-retired-misconfig'
        gbrain_row.is_enabled = False
        retired += 1
        print(f'  retired: {gbrain_row.id} (SSE misconfig -> disabled)')

    for name, payload in merged.items():
        cfg = payload['cfg']
        existing = session.query(McpServer).filter_by(id=name).one_or_none()
        if existing:
            skipped += 1
            continue
        try:
            result = classify(cfg)
            if result[0] == 'sse':
                _, _, url = result
                row = McpServer(id=name, name=name, transport='sse', url=url,
                              is_enabled=True, command=None, args=None, env=None)
            else:
                _, cmd, _, args, env = result
                row = McpServer(id=name, name=name, transport='stdio',
                              command=cmd, args=json.dumps(args or []),
                              env=json.dumps(env or {}), is_enabled=True, url=None)
            session.add(row); inserted += 1
        except Exception as e:
            failed += 1
            print(f'  failed {name}: {e}')
    session.commit()
    print(f'Inserted: {inserted}    Skipped (already present): {skipped}    Failed: {failed}    Retired: {retired}')
    print('--- DB mcp_servers ---')
    for r in session.query(McpServer).all():
        print(f'  {r.id:30s} | {r.transport:5s} | {"url="+str(r.url) if r.url else "cmd="+str(r.command)}')
finally:
    session.close()
