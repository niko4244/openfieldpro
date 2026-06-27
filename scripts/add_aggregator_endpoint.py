# scripts/add_aggregator_endpoint.py
"""
Add or update an aggregator endpoint in ODYSSEUS (kilo, opencodezen, ...).
Registry-driven: each provider registers as a 5-line entry in REGISTRY below.

Usage:
    python scripts/add_aggregator_endpoint.py kilo [--model M] [--endpoint-id ID]
    python scripts/add_aggregator_endpoint.py opencodezen [--model M] [--endpoint-id ID]

Cross-replaces: scripts/add_kilo_endpoint.py and scripts/add_opencodezen_endpoint.py
are now 5-line shims that delegate here.

Idempotent: re-running is a no-op when nothing changed; --model and --endpoint-id
propagate to settings.json in-place via _ensure_settings_has_fallback reconcile.

The api_key column is Fernet-encrypted at rest by _migrate_encrypt_endpoint_keys
on next ODYSSEUS startup, so it is safe to leave a plaintext key in the env var.
"""
import argparse
import datetime
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "app.db"
SETTINGS_PATH = ROOT / "data" / "settings.json"

# ponytail: each aggregator is a 5-line entry. To add a 3rd: append a new key below.
REGISTRY = {
    "kilo": {
        "name":                "Kilo (free)",
        "env_key":             "KILO_API_KEY",
        "endpoint_id_default": "kiloaggregatorv1",
        "base_url":            "https://api.kilo.ai/api/gateway",
        "default_model":       "stepfun/step-3.7-flash:free",
    },
    "opencodezen": {
        "name":                "OpenCode Zen (free)",
        "env_key":             "OPENCODE_API_KEY",
        "endpoint_id_default": "opencodezenv1",
        "base_url":            "https://opencode.ai/zen/v1",
        "default_model":       "opencode/deepseek-v4-flash-free",
    },
}


def _ensure_settings_has_fallback(settings: dict, entry: dict) -> bool:
    """If an entry for this endpoint already exists, refresh its model to the
    current default_model so re-running after a default-name change propagates
    without a manual settings.json edit. Otherwise append a new entry.

    ponytail: in-place reconcile keeps other fields (priority / weight / etc.)
    on an existing entry intact. Name / base_url changes still require a
    separate re-registration script.
    Ceiling: single-pass O(n) over the chain; in practice n stays <10.
    """
    chain = settings.setdefault("default_model_fallbacks", [])
    for e in chain:
        if isinstance(e, dict) and e.get("endpoint_id") == entry["endpoint_id"]:
            if e.get("model") != entry["model"]:
                e["model"] = entry["model"]  # in-place: preserves other fields
                return True  # refreshed model
            return False  # already matches; no-op
    chain.append(entry)
    return True


def _parse_args(argv=None) -> argparse.Namespace:
    """Positional = aggregator short name; --model / --endpoint-id override the
    registry defaults for A/B-variant or override flows."""
    p = argparse.ArgumentParser(
        description="Add or update an aggregator endpoint (kilo / opencodezen / ...) for ODYSSEUS.",
    )
    p.add_argument(
        "name",
        help="Aggregator short name from REGISTRY.",
    )
    p.add_argument(
        "--model",
        default=None,
        help="Override registry default_model for this endpoint_id's fallback entry.",
    )
    p.add_argument(
        "--endpoint-id",
        default=None,
        help="Override registry endpoint_id_default (use distinct id per A/B variant).",
    )
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    if args.name not in REGISTRY:
        print(
            f"ERROR: unknown aggregator '{args.name}'. Available: {sorted(REGISTRY.keys())}",
            file=sys.stderr,
        )
        return 2

    spec = REGISTRY[args.name]
    endpoint_id   = args.endpoint_id or spec["endpoint_id_default"]
    base_url      = spec["base_url"]
    name_in_ui    = spec["name"]
    default_model = args.model or spec["default_model"]
    api_key       = (os.environ.get(spec["env_key"]) or "").strip()

    if not DB_PATH.exists():
        print(f"ERROR: ODYSSEUS DB not found at {DB_PATH}", file=sys.stderr)
        print("       Run setup.py first, then re-run this script.", file=sys.stderr)
        return 1

    _now = datetime.datetime.utcnow()

    # 1. Upsert into model_endpoints (idempotent by primary key).
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.row_factory = sqlite3.Row
        existing = conn.execute(
            "SELECT id, api_key, name FROM model_endpoints WHERE id = ?",
            (endpoint_id,),
        ).fetchone()

        if existing is None:
            conn.execute(
                """
                INSERT INTO model_endpoints
                    (id, name, base_url, api_key, is_enabled, model_type,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, 'llm', ?, ?)
                """,
                (endpoint_id, name_in_ui, base_url, api_key or None, _now, _now),
            )
            action = "added"
        elif api_key:
            conn.execute(
                "UPDATE model_endpoints SET api_key = ?, is_enabled = 1, updated_at = ? WHERE id = ?",
                (api_key, _now, endpoint_id),
            )
            action = "updated api_key"
        else:
            action = f"kept (api_key already set; {spec['env_key']} env empty)"

        conn.commit()
    finally:
        conn.close()

    # 2. Patch settings.json to add the fallback entry.
    if SETTINGS_PATH.exists():
        try:
            settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"WARN: settings.json is malformed ({e}); leaving it alone.", file=sys.stderr)
            settings = None

        if settings is not None:
            entry = {"endpoint_id": endpoint_id, "model": default_model}
            patched = _ensure_settings_has_fallback(settings, entry)
            if patched:
                tmp = SETTINGS_PATH.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")
                tmp.replace(SETTINGS_PATH)

    # 3. Operator summary + ASCII-safe warnings (cp1252 carve-out: '--' for em-dash).
    if not api_key:
        print(
            f"NOTE: {spec['env_key']} env var not set -- endpoint was created with an empty key.",
            file=sys.stderr,
        )
        print(
            "      Re-run with the key set, or paste it into the ODYSSEUS web UI",
            file=sys.stderr,
        )
        print(
            f"      (Admin -> Endpoints -> edit {name_in_ui}). The chain will skip",
            file=sys.stderr,
        )
        print(
            f"      {args.name} (401) until a real key is present.",
            file=sys.stderr,
        )

    entry_display = {"endpoint_id": endpoint_id, "model": default_model}
    print(f"{name_in_ui} endpoint {action}: id={endpoint_id}  base_url={base_url}  model={default_model}")
    print(f"  - DB row:      {DB_PATH}")
    print(f"  - Fallback:    default_model_fallbacks -> {entry_display}  (in {SETTINGS_PATH})")
    print("Restart Odysseus to pick up the new endpoint and fallback.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
