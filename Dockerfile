# syntax=docker/dockerfile:1

# Base stage - Chainguard Node.js image with pnpm
FROM cgr.dev/chainguard/node:latest-dev AS base
USER root
RUN apk update && apk add --no-cache pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN mkdir -p "$PNPM_HOME" && chown -R node:node "$PNPM_HOME"
USER node

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /usr/src/app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,uid=65532 \
    pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /usr/src/app

COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=true

RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
FROM cgr.dev/chainguard/wolfi-base:latest AS runner
RUN apk update && apk add --no-cache nodejs-26
WORKDIR /usr/src/app

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /usr/src/app/public ./public
COPY --from=builder --chown=65532:65532 /usr/src/app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /usr/src/app/.next/static ./.next/static

EXPOSE 9091
ENV PORT=9091
ENV HOSTNAME="0.0.0.0"

USER 65532

CMD ["node", "server.js"]
