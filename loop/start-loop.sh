#!/usr/bin/env bash
# OFP-vs-HCP audit loop runner.
#
# Modes:
#   --next     one chunk; generate prompt, run Claude Code in tmux, monitor, exit.
#   --forever  re-run --next until sequence is done OR a --failure breaks it.
#   --status   print current state + next-up chunk.
#   --dry      generate current-chunk.md, do not run Claude.

set -e

cd "$(dirname "$0")"
ROOT="$(pwd)"
OFP_DIR="$(cd "$ROOT/../.." && pwd)"
LOG_DIR="$ROOT/log"
mkdir -p "$LOG_DIR"

# Cinch the API key. If neither is set, refuse to run.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "[start-loop] missing ANTHROPIC_API_KEY (Claude) or OPENAI_API_KEY (Codex); set one and retry." >&2
  exit 1
fi

mode="${1:-}"
if [[ -z "$mode" ]]; then
  echo "usage: start-loop.sh --next|--forever|--status|--dry" >&2
  exit 2
fi

if [[ "$mode" == "--status" ]]; then
  echo "─── state.json ───"
  cat "$ROOT/state.json"
  echo
  echo "─── next chunk ───"
  node "$ROOT/scripts/decide-next.js"
  exit 0
fi

if [[ "$mode" == "--dry" ]]; then
  node "$ROOT/scripts/generate-chunk-spec.js"
  echo "[start-loop] dry-run; current-chunk.md written. Inspect it and run --next when ready."
  exit 0
fi

if [[ "$mode" != "--next" && "$mode" != "--forever" ]]; then
  echo "unknown mode: $mode" >&2
  exit 2
fi

# ── One step ──

# 1. Generate the chunk prompt.
node "$ROOT/scripts/generate-chunk-spec.js"

NEXT_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/state.json','utf8')).currentPhase)")"
if [[ -z "$NEXT_ID" || "$NEXT_ID" == "done" ]]; then
  echo "[start-loop] sequence complete; nothing to do."
  exit 0
fi

LOG_FILE="$LOG_DIR/${NEXT_ID}-$(date +%Y%m%d-%H%M%S).log"
PROMPT_FILE="$ROOT/current-chunk.md"
SESSION="ofp-loop-$(date +%s)"

AGENT_BIN="${AGENT_BIN:-claude}"
PROMPT_HEAD=$(head -c 200 "$PROMPT_FILE" | tr '\n' ' ')
echo "[start-loop] running ${NEXT_ID} via tmux session ${SESSION}; log: ${LOG_FILE}"
echo "[start-loop] prompt head: ${PROMPT_HEAD}…"

# 2. Run Claude Code in tmux. Skip-permissions is required because the agent
#    needs file + bash + git access without per-call confirmation.
tmux new-session -d -s "$SESSION" -c "$OFP_DIR" \
  "${AGENT_BIN} --dangerously-skip-permissions --output-format stream-json --verbose --prompt-file \"$PROMPT_FILE\" 2>&1 | tee \"$LOG_FILE\"; echo \$? > \"$LOG_DIR/${NEXT_ID}-exit\""

# 3. Poll tmux until session exits.
ATTEMPT=0
LAST_TAIL=""
while tmux has-session -t "$SESSION" 2>/dev/null; do
  sleep 60
  ATTEMPT=$((ATTEMPT+1))
  CURRENT_TAIL=$(tail -n 1 "$LOG_FILE" 2>/dev/null || echo "")
  if [[ "$CURRENT_TAIL" != "$LAST_TAIL" ]]; then
    echo "[start-loop] [${ATTEMPT}m] tail: $CURRENT_TAIL"
    LAST_TAIL="$CURRENT_TAIL"
  fi
  if (( ATTEMPT >= 240 )); then  # 4 hour cap per chunk
    echo "[start-loop] hard cap reached; killing tmux session. Marking as failure."
    tmux kill-session -t "$SESSION" || true
    break
  fi
done

# 4. Read exit code.
EXIT_FILE="$LOG_DIR/${NEXT_ID}-exit"
EXIT_CODE=124  # default = timeout/kill
if [[ -f "$EXIT_FILE" ]]; then
  EXIT_CODE=$(cat "$EXIT_FILE" | tr -d '[:space:]')
fi

# 5. Verify.
if [[ "$EXIT_CODE" == "0" ]]; then
  echo "[start-loop] Claude Code reported success on ${NEXT_ID}; running pnpm verification."
  (cd "$OFP_DIR" && pnpm --filter @ofp/api test 2>&1 | tail -10 > "$LOG_DIR/${NEXT_ID}-verify.txt") || true
  if grep -qE "^# (pass|tests) [0-9]+" "$LOG_DIR/${NEXT_ID}-verify.txt"; then
    PASS_LINE=$(grep -E "^# pass" "$LOG_DIR/${NEXT_ID}-verify.txt" | awk '{print $3}')
    FAIL_LINE=$(grep -E "^# fail" "$LOG_DIR/${NEXT_ID}-verify.txt" | awk '{print $3}')
    if [[ "${FAIL_LINE:-1}" == "0" && "${PASS_LINE:-0}" -ge 0 ]]; then
    LAST_COMMIT="$(cd "$OFP_DIR" && git log -1 --pretty=%H 2>/dev/null || echo "")"
    LAST_COMMIT="$LAST_COMMIT" node "$ROOT/scripts/advance-state.js" --success
      echo "[start-loop] ${NEXT_ID} marked success; verify.txt last line: $(tail -n 3 "$LOG_DIR/${NEXT_ID}-verify.txt")"
    else
      echo "[start-loop] tests failed (pass=${PASS_LINE:-?} fail=${FAIL_LINE:-?}); marking failure."
      node "$ROOT/scripts/advance-state.js" --fail
      [[ "$mode" == "--forever" ]] && exit 1 || exit 1
    fi
  else
    echo "[start-loop] no test output detected; treating as failure."
    node "$ROOT/scripts/advance-state.js" --fail
    [[ "$mode" == "--forever" ]] && exit 1 || exit 1
  fi
else
  echo "[start-loop] Claude Code non-zero exit (${EXIT_CODE}); see $LOG_FILE."
  node "$ROOT/scripts/advance-state.js" --fail
  [[ "$mode" == "--forever" ]] && exit 1 || exit 1
fi

# 6. Loop or exit.
if [[ "$mode" == "--forever" ]]; then
  echo "[start-loop] forever mode: re-invoking for next chunk."
  exec "$0" --forever
fi
