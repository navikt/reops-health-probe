import { recordProbe } from "./metrics.ts";
import { isPaused, recordRun, setRunning } from "./state.ts";
import { slackAlertFailing, slackAlertRecovered } from "./slack.ts";
import { log, logError } from "./log.ts";

export interface ProbeResult {
  ok: boolean;
  message?: string;
  /** Raw error detail — response body, stack trace, etc. Shown verbatim on the dashboard. */
  errorDetails?: string;
  /** The UUID injected into the pipeline for this run — useful for cross-referencing logs. */
  probeId?: string;
  /** Full ingress request + response — URL, headers, payload, and raw response body. */
  ingressDetails?: string;
  /** Raw response from the BigQuery check — shown in the tooltip for transparency. */
  bqDetails?: string;
  durationMs: number;
  ingressStatusCode: number;
}

export interface ProbeContext {
  /** Numeric run ID — unique per in-flight run, useful for correlating log lines. */
  runId: number;
  /**
   * Aborted when the probe is paused mid-run. Probes should forward this to
   * fetch calls and sleeps so they bail out immediately on pause.
   */
  signal: AbortSignal;
}

export type ProbeSchedule =
  | { type: "cron"; value: Deno.CronSchedule }
  | { type: "interval"; ms: number };

export interface Probe {
  name: string;
  schedule: ProbeSchedule;
  run(ctx: ProbeContext): Promise<ProbeResult>;
}

const failingProbes = new Set<string>();

export function startProbe(probe: Probe): void {
  const trigger = () => runProbe(probe);
  if (probe.schedule.type === "cron") {
    Deno.cron(`probe-${probe.name}`, probe.schedule.value, trigger);
  } else {
    setInterval(trigger, probe.schedule.ms);
  }
}

export async function runProbe(probe: Probe): Promise<void> {
  if (isPaused(probe.name)) {
    log({ event: "probe.skipped", probe: probe.name, reason: "paused" });
    return;
  }

  const { runId, signal } = setRunning(probe.name);
  log({ event: "probe.start", probe: probe.name, run_id: runId });

  const start = Date.now();
  let result: ProbeResult;
  try {
    result = await probe.run({ runId, signal });
  } catch (err) {
    if (signal.aborted) {
      // Probe was paused mid-run — discard result, don't record or alert.
      log({ event: "probe.aborted", probe: probe.name, run_id: runId, reason: "paused" });
      recordRun(probe.name, runId, {
        ok: false,
        message: "Aborted (probe paused mid-run)",
        durationMs: Date.now() - start,
        ingressStatusCode: 0,
      });
      return;
    }
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
    await slackAlertFailing(probe.name, msg);
  } else if (wasFailing) {
    failingProbes.delete(probe.name);
    log({ event: "probe.recovered", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
    await slackAlertRecovered(probe.name);
  } else {
    log({ event: "probe.ok", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
  }
}
