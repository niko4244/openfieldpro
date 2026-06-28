# OpenFieldPro API. Runs TypeScript sources through tsx for clean workspace
# resolution. A later production optimization can switch this to precompiled JS.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @ofp/api... --frozen-lockfile=false

EXPOSE 3001
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ofp/api", "exec", "tsx", "src/server.ts"]
