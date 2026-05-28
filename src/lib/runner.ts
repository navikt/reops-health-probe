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

export type ProbeSchedule = { type: "interval"; ms: number };

export interface Probe {
  name: string;
  schedule: ProbeSchedule;
  run(ctx: ProbeContext): Promise<ProbeResult>;
}

/** Number of consecutive failures required before a Slack alert fires. */
const CONSECUTIVE_FAILURES_THRESHOLD = 3;

/**
 * Tracks per-probe alert state:
 * - consecutiveFailures: how many failures in a row (resets on success)
 * - alertSent: whether we've already fired a failing alert for this streak
 */
const probeAlertState = new Map<string, { consecutiveFailures: number; alertSent: boolean }>();

function getAlertState(name: string) {
  if (!probeAlertState.has(name)) {
    probeAlertState.set(name, { consecutiveFailures: 0, alertSent: false });
  }
  return probeAlertState.get(name)!;
}

export function startProbe(probe: Probe): void {
  setInterval(() => runProbe(probe), probe.schedule.ms);
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

  const alertState = getAlertState(probe.name);

  if (!result.ok) {
    alertState.consecutiveFailures++;
    const msg = result.message ?? "unknown error";
    logError({
      event: "probe.failed",
      probe: probe.name,
      run_id: runId,
      duration_ms: result.durationMs,
      message: msg,
      consecutive_failures: alertState.consecutiveFailures,
    });
    if (alertState.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD && !alertState.alertSent) {
      alertState.alertSent = true;
      await slackAlertFailing(probe.name, msg);
    }
  } else if (alertState.alertSent) {
    // Was alerting — now recovered
    alertState.consecutiveFailures = 0;
    alertState.alertSent = false;
    log({ event: "probe.recovered", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
    await slackAlertRecovered(probe.name);
  } else {
    alertState.consecutiveFailures = 0;
    log({ event: "probe.ok", probe: probe.name, run_id: runId, duration_ms: result.durationMs });
  }
}
