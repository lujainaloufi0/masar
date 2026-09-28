# Build from the repository root:  docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @masar/api... --filter @masar/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @masar/shared build && pnpm --filter @masar/api build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, seed an empty demo database, then start.
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/demo/seed-if-empty.js && node dist/main.js"]
