# ponytail: read-only startup lint that catches the `odyssey`-vs-`odysseus`
# path-typo class that slipped into the drawio-preview mcp_servers row earlier.
#
# Reads `mcp_servers` (no writes), scans the JSON-decoded args + scalar fields
# (id, name, command, url). Non-zero exit if any KNOWN_TYPO substring is present;
# the warning names the row id AND the offending value, so the operator can
# decide if it's a real bug vs a legitimate use of the word.
#
# Ceiling: KNOWN_TYPOS is hardcoded. Substring match -- could false-positive on
# legitimate rows named e.g. 'odyssey-mirror'. Operator must read the warning.
#
# Upgrade: load KNOWN_TYPOS from a per-project config file so future typo
# classes are added without touching this script.



import json
import os
import sys
from pathlib import Path

ODYSSEUS_ROOT = Path.home() / "Brainz" / "odysseus"
sys.path.insert(0, str(ODYSSEUS_ROOT))
os.chdir(ODYSSEUS_ROOT)

from core.database import SessionLocal, McpServer  # noqa: E402

# Extend by appending entries as new typo classes are observed.
KNOWN_TYPOS = ("odyssey",)


def _hits(value):
    if not isinstance(value, str):
        return
    lc_value = value.lower()
    for typo in KNOWN_TYPOS:
        if typo.lower() in lc_value:
            yield typo


def main() -> int:
    n_warnings = 0
    session = SessionLocal()
    try:
        for row in session.query(McpServer).all():
            for field in ("id", "name", "command", "url"):
                value = getattr(row, field, None)
                for typo in _hits(value):
                    print(
                        f"WARN  mcp_servers id={row.id!r} field={field!r} "
                        f"contains {typo!r}: {value!r}"
                    )
                    n_warnings += 1
            if row.args:
                try:
                    args = json.loads(row.args)
                except ValueError:
                    print(
                        f"WARN  mcp_servers id={row.id!r} args column has "
                        f"invalid JSON: {row.args!r}"
                    )
                    n_warnings += 1
                    continue
            else:
                args = []
            for arg in args:
                for typo in _hits(arg):
                    print(
                        f"WARN  mcp_servers id={row.id!r} arg contains "
                        f"{typo!r}: {arg!r}"
                    )
                    n_warnings += 1
    finally:
        session.close()
    if n_warnings == 0:
        print("OK    no known-typo patterns found in mcp_servers")
    return 1 if n_warnings else 0


if __name__ == "__main__":
    sys.exit(main())
