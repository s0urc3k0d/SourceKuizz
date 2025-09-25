# Multi-stage build (dev-focused baseline)
FROM node:20-alpine AS base
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/web/package.json packages/web/
RUN corepack enable && pnpm install --frozen-lockfile || true

FROM base AS build
COPY . .
RUN pnpm -r run build || true

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "packages/backend/dist/main.js"]
