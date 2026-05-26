import "@std/dotenv/load";
import { renderMetrics } from "./lib/metrics.ts";
import { runProbe } from "./lib/runner.ts";
import { registerProbe, setPaused } from "./lib/state.ts";
import { renderDashboard, renderDocs } from "./lib/ui.ts";
import { innblikkPipelineProbe } from "./probes/innblikk-pipeline.ts";

const probes = [innblikkPipelineProbe];

for (const probe of probes) {
  registerProbe(probe.name);
  Deno.cron(`probe:${probe.name}`, { minute: { every: 12 } }, () => runProbe(probe));
}

const server = Deno.serve({ port: 9091 }, (req) => {
  const url = new URL(req.url);
  const { pathname } = url;

  // GET /
  if (req.method === "GET" && pathname === "/") {
    return new Response(renderDashboard(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // GET /docs
  if (req.method === "GET" && pathname === "/docs") {
    return new Response(renderDocs(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // GET /metrics
  if (req.method === "GET" && pathname === "/metrics") {
    return new Response(renderMetrics(), {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  }

  // POST /admin/pause/:name
  const pauseMatch = pathname.match(/^\/admin\/pause\/(.+)$/);
  if (req.method === "POST" && pauseMatch) {
    const name = decodeURIComponent(pauseMatch[1]);
    setPaused(name, true);
    console.log(`[admin] probe PAUSED: ${name}`);
    return Response.redirect(new URL("/", req.url), 303);
  }

  // POST /admin/resume/:name
  const resumeMatch = pathname.match(/^\/admin\/resume\/(.+)$/);
  if (req.method === "POST" && resumeMatch) {
    const name = decodeURIComponent(resumeMatch[1]);
    setPaused(name, false);
    console.log(`[admin] probe RESUMED: ${name}`);
    return Response.redirect(new URL("/", req.url), 303);
  }

  return new Response("Not Found", { status: 404 });
});

console.log("reops-health-probe started — dashboard on :9091/");

await server.finished;
