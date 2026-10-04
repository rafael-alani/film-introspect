FROM oven/bun:1.3.14 AS dependencies
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=3001 \
    DATABASE_PATH=/data/introspect.db

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY package.json tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN mkdir -p /data
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["bun", "src/index.ts"]
