import { recordProbe } from "./metrics.ts";
import { isPaused, recordRun, setRunning } from "./state.ts";
import { slackAlert } from "./slack.ts";

export interface ProbeResult {
  ok: boolean;
  message?: string;
  /** Raw error detail — response body, stack trace, etc. Shown verbatim on the dashboard. */
  errorDetails?: string;
  durationMs: number;
  ingressStatusCode: number;
}

export interface Probe {
  name: string;
  /** Cron schedule. Example: `{ minute: { every: 12 } }` */
  schedule: Deno.CronSchedule;
  run(): Promise<ProbeResult>;
}

const failingProbes = new Set<string>();

export async function runProbe(probe: Probe): Promise<void> {
  if (isPaused(probe.name)) {
    console.log(`[runner] probe PAUSED, skipping: ${probe.name}`);
    return;
  }

  console.log(`[runner] running probe: ${probe.name}`);

  setRunning(probe.name, true);
  let result: ProbeResult;
  try {
    result = await probe.run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorDetails = err instanceof Error && err.stack ? err.stack : undefined;
    result = {
      ok: false,
      message,
      errorDetails,
      durationMs: 0,
      ingressStatusCode: 0,
    };
  }

  recordRun(probe.name, result);

  recordProbe(probe.name, {
    success: result.ok,
    durationMs: result.durationMs,
    ingressStatusCode: result.ingressStatusCode,
  });

  const wasFailing = failingProbes.has(probe.name);

  if (!result.ok) {
    failingProbes.add(probe.name);
    const msg = result.message ?? "unknown error";
    console.error(`[runner] probe FAILED: ${probe.name} — ${msg}`);
    await slackAlert(`🔴 *${probe.name}* probe failed: ${msg}`);
  } else if (wasFailing) {
    failingProbes.delete(probe.name);
    console.log(`[runner] probe RECOVERED: ${probe.name}`);
    await slackAlert(`✅ *${probe.name}* probe recovered`);
  } else {
    console.log(`[runner] probe OK: ${probe.name} (${result.durationMs}ms)`);
  }
}
