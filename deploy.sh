#!/usr/bin/env bash
# One-command OpenFieldPro production-style deploy. Builds images, runs schema
# setup + seed, and brings the stack up behind Caddy on :8080.
#   ./deploy.sh           # build + up
#   ./deploy.sh down      # tear down
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="podman compose"
command -v podman >/dev/null 2>&1 || COMPOSE="docker compose"

if [ "${1:-up}" = "down" ]; then
  $COMPOSE -f infra/compose.prod.yml down
  exit 0
fi

[ -f .env ] || { echo "→ creating .env from .env.example"; cp .env.example .env; }

if grep -Eq '^(JWT_SECRET=change-me-in-production|POSTGRES_PASSWORD=ofp|S3_SECRET_KEY=ofpminio-secret)$' .env; then
  echo "Refusing to deploy with default secrets. Update JWT_SECRET, POSTGRES_PASSWORD, and S3_SECRET_KEY in .env first."
  exit 1
fi

echo "→ building + starting stack with: $COMPOSE"
$COMPOSE -f infra/compose.prod.yml up -d --build

echo
echo "✓ OpenFieldPro is starting."
echo "  App:      http://localhost:8080"
echo "  Landing:  http://localhost:8080/welcome"
echo "  API:      http://localhost:8080/api/health"
echo "  Login:    owner@demo.test / demo12345"
