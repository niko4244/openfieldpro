#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ "$#" -ne 0 ]; then
  echo "Usage: scripts/backup.sh" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_FILE="$ROOT_DIR/.secrets/openfieldpro_operations_controller"
ENDPOINT="http://127.0.0.1:3010/v1/backups"

if [ ! -f "$SECRET_FILE" ] || [ ! -r "$SECRET_FILE" ]; then
  echo "Missing readable operations-controller secret file." >&2
  exit 1
fi
SECRET="$(< "$SECRET_FILE")"
case "$SECRET" in
  *'
'*) echo "Invalid operations-controller secret file." >&2; exit 1 ;;
  *$'\r') SECRET="${SECRET%$'\r'}" ;;
esac
if ! printf '%s' "$SECRET" | LC_ALL=C grep -qE '^[!-~]{32,512}$'; then
  echo "Invalid operations-controller secret file." >&2
  exit 1
fi
IDEMPOTENCY_KEY="host-cli-backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"

printf 'Authorization: Bearer %s\nContent-Type: application/json\nIdempotency-Key: %s\n' \
  "$SECRET" "$IDEMPOTENCY_KEY" |
  curl --silent --show-error --fail-with-body \
    --request POST \
    --header @- \
    --data '{}' \
    "$ENDPOINT"
printf '\n'
