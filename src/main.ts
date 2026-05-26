import "@std/dotenv/load";
import { renderMetrics } from "./lib/metrics.ts";
import { runProbe } from "./lib/runner.ts";
import { innblikkPipelineProbe } from "./probes/innblikk-pipeline.ts";

const probes = [innblikkPipelineProbe];

for (const probe of probes) {
  Deno.cron(`probe:${probe.name}`, { minute: { every: 12 } }, () => runProbe(probe));
}

const server = Deno.serve({ port: 9091 }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/metrics") {
    return new Response(renderMetrics(), {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  }
  return new Response("Not Found", { status: 404 });
});

console.log("reops-health-probe started — metrics on :9091/metrics");

await server.finished;
