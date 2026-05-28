import "@std/dotenv/load";
import { log } from "./lib/log.ts";
import { renderMetrics } from "./lib/metrics.ts";
import { runProbe, startProbe } from "./lib/runner.ts";
import { registerProbe, setPaused } from "./lib/state.ts";
import { renderDashboard, renderDocs, renderStateJson } from "./lib/ui.ts";
import { slackAlertFailing, slackAlertRecovered, slackAlertThrottleTest } from "./lib/slack.ts";
import { innblikkPipelineProbe } from "./probes/innblikk-pipeline.ts";

const probes = [innblikkPipelineProbe];

for (const probe of probes) {
  registerProbe(probe.name, probe.schedule.ms);
  startProbe(probe);
}

// Run all probes once on startup so metrics are populated immediately
for (const probe of probes) {
  runProbe(probe);
}

const server = Deno.serve({ port: 9091 }, async (req) => {
  const url = new URL(req.url);
  const { pathname } = url;

  // GET /api/state
  if (req.method === "GET" && pathname === "/api/state") {
    return new Response(renderStateJson(), {
      headers: { "Content-Type": "application/json" },
    });
  }

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
  if (req.method === "GET" && (pathname === "/metrics" || pathname === "/metrics/")) {
    return new Response(renderMetrics(), {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  }

  // POST /admin/run/:name
  const runMatch = pathname.match(/^\/admin\/run\/(.+)$/);
  if (req.method === "POST" && runMatch) {
    const name = decodeURIComponent(runMatch[1]);
    const probe = probes.find((p) => p.name === name);
    if (!probe) return new Response("Not Found", { status: 404 });
    log({ event: "admin.trigger", probe: name });
    runProbe(probe); // fire-and-forget
    return Response.redirect(new URL("/", req.url), 303);
  }

  // POST /admin/pause/:name
  const pauseMatch = pathname.match(/^\/admin\/pause\/(.+)$/);
  if (req.method === "POST" && pauseMatch) {
    const name = decodeURIComponent(pauseMatch[1]);
    setPaused(name, true);
    log({ event: "admin.paused", probe: name });
    return Response.redirect(new URL("/", req.url), 303);
  }

  // POST /admin/resume/:name
  const resumeMatch = pathname.match(/^\/admin\/resume\/(.+)$/);
  if (req.method === "POST" && resumeMatch) {
    const name = decodeURIComponent(resumeMatch[1]);
    setPaused(name, false);
    log({ event: "admin.resumed", probe: name });
    return Response.redirect(new URL("/", req.url), 303);
  }

  // POST /admin/test-alert/:name/:type  (failure | recovery | throttle)
  const testAlertMatch = pathname.match(/^\/admin\/test-alert\/(.+)\/(failure|recovery|throttle)$/);
  if (req.method === "POST" && testAlertMatch) {
    const name = decodeURIComponent(testAlertMatch[1]);
    const type = testAlertMatch[2] as "failure" | "recovery" | "throttle";
    if (!probes.find((p) => p.name === name)) {
      return new Response(JSON.stringify({ ok: false, error: "probe not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    log({ event: "admin.test-alert", probe: name, type });
    if (type === "failure") {
      await slackAlertFailing(name, "This is a simulated failure alert sent from the dashboard.", { bypassThrottle: true });
    } else if (type === "recovery") {
      await slackAlertRecovered(name);
    } else {
      await slackAlertThrottleTest(name);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
});

log({ event: "server.started", port: 9091 });

await server.finished;
