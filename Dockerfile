# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# NEXA production image
# Build: docker build -t nexa .
# Run:   docker run --env-file .env -p 3000:3000 nexa
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Build stage: install everything, generate Prisma client, compile Next.
# ---------------------------------------------------------------------------
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Values only need to be syntactically valid at build time. Runtime values come
# from the container environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV APP_URL="http://localhost:3000"
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies only.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN mkdir -p /app/storage/uploads \
  && chown -R node:node /app/storage /app/.next
USER node

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then npx tsx prisma/seed.ts; fi && npm start"]
