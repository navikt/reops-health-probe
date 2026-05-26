FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/denoland/deno:2.3.3

WORKDIR /app

COPY deno.json deno.lock* ./
COPY src/ ./src/
COPY config.json ./

RUN deno cache src/main.ts

CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
