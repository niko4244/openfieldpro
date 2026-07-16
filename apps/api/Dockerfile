FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
COPY apps ./apps
COPY packages ./packages

RUN pnpm install:verified \
  && pnpm --filter @ofp/api build \
  && mkdir -p /uploads \
  && chown -R node:node /uploads /app/apps/api/dist

ENV NODE_ENV=production
ENV API_PORT=3001
ENV OFP_UPLOAD_DIR=/uploads
EXPOSE 3001

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

# The API source is executed through the pinned tsx runtime because workspace
# packages currently export TypeScript source. The build above remains a
# mandatory type/emit gate until all workspace packages publish compiled output.
CMD ["pnpm", "--filter", "@ofp/api", "exec", "tsx", "src/server.ts"]
