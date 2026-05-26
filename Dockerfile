# syntax=docker/dockerfile:1

# digestabot:denoland/deno
FROM denoland/deno:2.7.11@sha256:869e31370dca82b10abefeabe92a2efae44c0d8c70e03776b05ca07ce6b2e062

WORKDIR /app

COPY deno.json deno.lock* ./
COPY src/ ./src/

RUN deno cache src/main.ts

USER deno

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--unstable-cron", "src/main.ts"]
