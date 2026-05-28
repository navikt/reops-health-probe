import { runProbe, startProbe } from "./src/lib/runner";
import { registerProbe } from "./src/lib/state";
import { innblikkPipelineProbe } from "./src/probes/innblikk-pipeline";
import { log } from "./src/lib/log";

const probes = [innblikkPipelineProbe];

/**
 * Called once at server startup via instrumentation.ts.
 * Registers all probes, starts their intervals, and runs each once immediately
 * so metrics are populated before the first scrape.
 */
export function startServer(): void {
  for (const probe of probes) {
    registerProbe(probe.name, probe.schedule.ms);
    startProbe(probe);
  }

  // Run all probes once on startup so metrics are populated immediately
  for (const probe of probes) {
    runProbe(probe);
  }

  log({ event: "server.started", probes: probes.map((p) => p.name).join(", ") });
}

export { probes };
