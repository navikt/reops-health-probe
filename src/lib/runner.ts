import { recordProbe } from "./metrics.ts";
import { isPaused, recordRun, setRunning } from "./state.ts";
import { slackAlert } from "./slack.ts";
import { log, logError } from "./log.ts";

export interface ProbeResult {
  ok: boolean;
  message?: string;
  /** Raw error detail — response body, stack trace, etc. Shown verbatim on the dashboard. */
  errorDetails?: string;
  /** The UUID injected into the pipeline for this run — useful for cross-referencing logs. */
  probeId?: string;
  durationMs: number;
  ingressStatusCode: number;
}

export interface ProbeContext {
  /** Numeric run ID — unique per in-flight run, useful for correlating log lines. */
  runId: number;
}

export interface Probe {
  name: string;
  /**
   * Cron schedule used in production. Example: `{ minute: { every: 12 } }`
   *
   * Note: Deno.cron skips ticks that overlap with a still-running invocation,
   * so concurrent in-flight runs are not possible via cron alone.
   */
  schedule: Deno.CronSchedule;
  /**
   * When set, the probe is driven by `setInterval` instead of `Deno.cron`.
   * Unlike cron, setInterval fires unconditionally, allowing multiple
   * concurrent in-flight runs to accumulate (useful for testing / short intervals).
   */
  intervalMs?: number;
  run(ctx: ProbeContext): Promise<ProbeResult>;
}

const failingProbes = new Set<string>();

export async function runProbe(probe: Probe): Promise<void> {
  if (isPaused(probe.name)) {
    log({ event: "probe.skipped", probe: probe.name, reason: "paused" });
    return;
  }

  const runId = setRunning(probe.name);
  log({ event: "probe.start", probe: probe.name, run_id: runId });

  const start = Date.now();
  let result: ProbeResult;
  try {
    result = await probe.run({ runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorDetails = err instanceof Error && err.stack ? err.stack : undefined;
    result = {
      ok: false,
      message,
      errorDetails,
      durationMs: Date.now() - start,
      ingressStatusCode: 0,
    };
  }

  recordRun(probe.name, runId, result);

  recordProbe(probe.name, {
    success: result.ok,
    durationMs: result.durationMs,
    ingressStatusCode: result.ingressStatusCode,
  });

  const wasFailing = failingProbes.has(probe.name);

  if (!result.ok) {
    failingProbes.add(probe.name);
    const msg = result.message ?? "unknown error";
    logError({ event: "probe.failed", probe: probe.name, run_id: runId, duration_ms: result.durationMs, message: msg });
    await slackAlert(`🔴 *${probe.name}* probe failed: ${msg}`);
  } else if (wasFailing) {
    failingProbes.delete(probe.name);
    log({ event: "probe.recovered", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
    await slackAlert(`✅ *${probe.name}* probe recovered`);
  } else {
    log({ event: "probe.ok", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
  }
}
