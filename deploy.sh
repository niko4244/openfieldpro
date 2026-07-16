#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v podman >/dev/null 2>&1; then
  COMPOSE=(podman compose)
elif command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "Install Podman or Docker with Compose support before deploying." >&2
  exit 1
fi

case "${1:-}" in
  down)
    "${COMPOSE[@]}" -f infra/compose.prod.yml down
    exit 0
    ;;
  --apply-schema)
    ;;
  *)
    cat >&2 <<'USAGE'
Usage:
  ./deploy.sh --apply-schema   Validate, build, apply the reviewed schema, and start
  ./deploy.sh down             Stop the stack without deleting persistent data

Production deployment is intentionally blocked without --apply-schema. Review the generated schema
diff and complete the release checklist before authorizing a production schema push.
USAGE
    exit 2
    ;;
esac

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example, replace every production placeholder, and keep it outside version control." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

required=(POSTGRES_PASSWORD JWT_SECRET CORS_ORIGIN PUBLIC_WEB_URL PUBLIC_API_URL OFP_SITE_ADDRESS)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required production setting: $name" >&2
    exit 1
  fi
done

if [ "${POSTGRES_PASSWORD}" = "replace-with-a-unique-database-password" ] || [ "${#POSTGRES_PASSWORD}" -lt 16 ]; then
  echo "POSTGRES_PASSWORD must be replaced with a unique value of at least 16 characters." >&2
  exit 1
fi
if [ "${JWT_SECRET}" = "change-me-in-production" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "JWT_SECRET must be unique and at least 32 characters." >&2
  exit 1
fi
if [[ "${CORS_ORIGIN}" == *"*"* ]]; then
  echo "CORS_ORIGIN cannot contain a wildcard." >&2
  exit 1
fi

node - "$PUBLIC_WEB_URL" "$PUBLIC_API_URL" <<'NODE'
for (const [name, value] of [["PUBLIC_WEB_URL", process.argv[2]], ["PUBLIC_API_URL", process.argv[3]]]) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  if (url.origin !== value.replace(/\/$/, "")) throw new Error(`${name} must be an origin without a path`);
}
NODE

export ALLOW_SCHEMA_PUSH=true
"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

echo "Running repository release-safety checks..."
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9.0.0 --activate >/dev/null
pnpm install:verified
pnpm release:safety
pnpm audit:dependencies

echo "Building production images..."
"${COMPOSE[@]}" -f infra/compose.prod.yml build api web worker

echo "Starting data services..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres redis

echo "Applying the reviewed schema once..."
"${COMPOSE[@]}" -f infra/compose.prod.yml --profile tools run --rm -e ALLOW_SCHEMA_PUSH=true migrate

echo "Starting application services..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d api web worker caddy --remove-orphans

echo "Waiting for service health..."
healthy=false
for _attempt in $(seq 1 45); do
  status="$(${COMPOSE[@]} -f infra/compose.prod.yml ps 2>/dev/null || true)"
  if printf '%s\n' "$status" | grep -qi "unhealthy"; then
    echo "A service became unhealthy." >&2
    printf '%s\n' "$status" >&2
    exit 1
  fi
  if printf '%s\n' "$status" | grep -q "api" && printf '%s\n' "$status" | grep -q "web"; then
    healthy=true
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then
  echo "Services did not reach the expected running state." >&2
  "${COMPOSE[@]}" -f infra/compose.prod.yml ps >&2
  exit 1
fi

cat <<EOF
OpenFieldPro deployment started.
App:     https://${OFP_SITE_ADDRESS}
Landing: https://${OFP_SITE_ADDRESS}/welcome
API:     https://${OFP_SITE_ADDRESS}/api/health

Complete the post-deploy smoke tests in docs/release/RELEASE_CHECKLIST.md before directing users here.
EOF
