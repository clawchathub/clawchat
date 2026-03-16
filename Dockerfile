# Stage 1: Builder
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/p2p/package.json ./packages/p2p/
COPY packages/storage/package.json ./packages/storage/
COPY packages/task/package.json ./packages/task/
COPY packages/dht/package.json ./packages/dht/
COPY packages/cli/package.json ./packages/cli/
COPY apps/claw-node/package.json ./apps/claw-node/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY . .
RUN pnpm -r build

# Stage 2: Runtime
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/dist/ ./packages/core/dist/
COPY packages/p2p/package.json ./packages/p2p/
COPY packages/p2p/dist/ ./packages/p2p/dist/
COPY packages/storage/package.json ./packages/storage/
COPY packages/storage/dist/ ./packages/storage/dist/
COPY packages/task/package.json ./packages/task/
COPY packages/task/dist/ ./packages/task/dist/
COPY packages/dht/package.json ./packages/dht/
COPY packages/dht/dist/ ./packages/dht/dist/
COPY apps/claw-node/package.json ./apps/claw-node/
COPY apps/claw-node/dist/ ./apps/claw-node/dist/
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod
EXPOSE 18789 18790 18792
VOLUME /app/data
CMD ["node", "apps/claw-node/dist/bin.js"]
