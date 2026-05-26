# syntax=docker/dockerfile:1

# digestabot:cgr.dev/chainguard/wolfi-base
FROM cgr.dev/chainguard/wolfi-base@sha256:5743937d521cbeb9e8c73bf1bd7ba2589c178940eb03d7b148efecc962be8587

RUN apk add --no-cache deno

WORKDIR /app

COPY deno.json deno.lock* ./
COPY src/ ./src/

RUN deno cache src/main.ts

USER nonroot

CMD ["deno", "run", "--allow-net", "--allow-env", "--unstable-cron", "src/main.ts"]
