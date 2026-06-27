#!/bin/bash
# ponytail: local mirror of the `validate` job in
# .github/workflows/migrate-hermes-tests.yml — reproduces the same 3-test
# gate on this machine so devs can spot regressions before reaching CI.
# Ceiling: not byte-identical to CI — OS != ubuntu-latest, no Docker. Catches
# every migration-level regression plus the liveness probe; misses
# CI-image-specific deltas (e.g. e2e's Ollama-via-Docker path).
# Upgrade: once this dev box has a working Docker daemon, replace this
# script's invocation with `act push` for true GHA-runner parity.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Best-effort canonical path. `realpath` is preferred; absent it, fall back to
# the input so the symlink-compare degrades to a string-compare rather than
# erroring. Used to make symlink/REPO_ROOT comparison robust under MSYS bash
# where `$REPO_ROOT` and `readlink` may resolve to different path forms.
canon() { realpath "$1" 2>/dev/null || readlink -f "$1" 2>/dev/null || echo "$1"; }

# PEP 394: prefer python3 on Linux/macOS, fall back to python on Windows.
# Override via $PYTHON (e.g. `PYTHON=python3.11 ./dry_run_ci.sh`).
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  if   command -v python3 >/dev/null 2>&1; then PY=python3
  elif command -v python  >/dev/null 2>&1; then PY=python
  else
    echo "[dry-run-ci] FATAL: no python on PATH; install Python 3.11 or set \$PYTHON" >&2
    exit 1
  fi
fi
PY_VERSION="$("$PY" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null || echo unknown)"
# Strict-match CI's `actions/setup-python@v5` pins. Reason: syntactic
# divergences between 3.10 and 3.11 (match patterns, exception groups) would
# pass locally then explode in CI — exactly the regression this gate exists
# to catch, so enforce it loud instead of just warning.
case "$PY_VERSION" in
  3.11) ;;
  unknown) echo "[dry-run-ci] WARNING: $PY not resolvable — tests will likely fail";;
  *)
    echo "[dry-run-ci] FATAL: Python 3.11 required (matches CI), found $PY_VERSION ($PY)" >&2
    echo "[dry-run-ci] HINT: pin locally with PYTHON=python3.11 or 'pyenv install 3.11'" >&2
    exit 1
    ;;
esac
echo "[dry-run-ci] Python $PY_VERSION ($PY) @ $REPO_ROOT"

# Idempotent install — pip skips already-installed packages on repeat runs.
[ -f requirements.txt ] && pip install -r requirements.txt
pip install -q pytest SQLAlchemy

# CI spoofs: ~/{.claude,.config/opencode,Brainz/skills} plus a
# ~/Brainz/odysseus symlink to the workspace. Locally these usually
# already exist — only scaffold the symlink, and only if it's wrong.
# CI's `rm -rf ~/Brainz/odysseus && ln -s …` is destructive, so locally
# we never destroy a real directory containing source.
mkdir -p ~/Brainz/skills ~/.claude ~/.config/opencode

if   [ ! -e "$HOME/Brainz/odysseus" ]; then
  ln -s "$REPO_ROOT" "$HOME/Brainz/odysseus"
  echo "[dry-run-ci] symlinked $HOME/Brainz/odysseus -> $REPO_ROOT"
elif [ -L "$HOME/Brainz/odysseus" ]; then
  [ "$(canon "$(readlink "$HOME/Brainz/odysseus")")" = "$(canon "$REPO_ROOT")" ] || {
    rm "$HOME/Brainz/odysseus"
    ln -s "$REPO_ROOT" "$HOME/Brainz/odysseus"
    echo "[dry-run-ci] re-linked $HOME/Brainz/odysseus -> $REPO_ROOT"
  }
elif [ -d "$HOME/Brainz/odysseus" ] && [ "$(canon "$HOME/Brainz/odysseus")" != "$(canon "$REPO_ROOT")" ]; then
  echo "[dry-run-ci] WARNING: $HOME/Brainz/odysseus is a real directory;"
  echo "[dry-run-ci]   REPO_ROOT=$REPO_ROOT is elsewhere. Migrations will write to the"
  echo "[dry-run-ci]   existing real dir. To mirror CI exactly, run this script from"
  echo "[dry-run-ci]   the repo at ~/Brainz/odysseus, OR delete the real dir first."
fi

# Migrations must run in YAML-declared order — skills before MCP gates before flip.
bash scripts/migrate_hermes/migrate_skills.sh
python scripts/migrate_hermes/migrate_mcps.py
python scripts/migrate_hermes/flip_mutating.py

# Use python -m pytest for portability over bare pytest (PATH issues on Windows).
python -m pytest tests/test_e2e_agent_toolcall.py \
                  tests/test_hermes_integration.py \
                  tests/test_mcp_url_liveness.py \
                  -v --tb=short -x

echo "[dry-run-ci] PASS — same gate as the GH Action"
