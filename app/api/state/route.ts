import { getAllProbeNames, getProbeScheduleMs, getProbeState } from "@/src/lib/state";

export const dynamic = "force-dynamic";

export function GET() {
  const names = getAllProbeNames();
  const now = Date.now();
  const out: Record<string, unknown> = {};

  for (const name of names) {
    const state = getProbeState(name);
    const latest = state.history[0] ?? null;
    out[name] = {
      paused: state.paused,
      running: state.activeRuns.length > 0,
      activeRuns: state.activeRuns.map((r) => ({ startedAt: r.startedAt, probeId: r.probeId })),
      now,
      history: state.history.map((run) => ({
        timestamp: run.timestamp,
        ok: run.result.ok,
        message: run.result.message ?? null,
        errorDetails: run.result.errorDetails ?? null,
        probeId: run.result.probeId ?? null,
        ingressDetails: run.result.ingressDetails ?? null,
        bqDetails: run.result.bqDetails ?? null,
        bqQuery: run.result.bqQuery ?? null,
        durationMs: run.result.durationMs,
      })),
      latest: latest
        ? {
            timestamp: latest.timestamp,
            ok: latest.result.ok,
            message: latest.result.message ?? null,
            errorDetails: latest.result.errorDetails ?? null,
            probeId: latest.result.probeId ?? null,
            ingressDetails: latest.result.ingressDetails ?? null,
            bqDetails: latest.result.bqDetails ?? null,
            bqQuery: latest.result.bqQuery ?? null,
            durationMs: latest.result.durationMs,
          }
        : null,
    };
  }

  return Response.json(out);
}
