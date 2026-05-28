import { getAllProbeNames, getProbeScheduleMs, getProbeState } from "@/src/lib/state";
import { Dashboard } from "./Dashboard";
import { RunningPill } from "./RunningPill";
import type { ProbeStateData } from "./types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const names = getAllProbeNames();
  const now = Date.now();

  const sha = process.env.GIT_SHA ?? "unknown";
  const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 7);

  const env = (process.env.ENVIRONMENT ?? "").toLowerCase();
  const envLabel =
    env === "prod" || env === "production"
      ? "PROD"
      : env === "dev" || env === "development"
      ? "DEV"
      : env
      ? env.toUpperCase()
      : null;

  const probes = names.map((name) => {
    const serverState = getProbeState(name);
    const latest = serverState.history[0] ?? null;

    const initialState: ProbeStateData = {
      paused: serverState.paused,
      running: serverState.activeRuns.length > 0,
      activeRuns: serverState.activeRuns.map((r) => ({ startedAt: r.startedAt })),
      now,
      history: serverState.history.map((run) => ({
        timestamp: run.timestamp,
        ok: run.result.ok,
        message: run.result.message ?? null,
        errorDetails: run.result.errorDetails ?? null,
        probeId: run.result.probeId ?? null,
        ingressDetails: run.result.ingressDetails ?? null,
        bqDetails: run.result.bqDetails ?? null,
        durationMs: run.result.durationMs,
        ingressStatusCode: run.result.ingressStatusCode,
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
            durationMs: latest.result.durationMs,
            ingressStatusCode: latest.result.ingressStatusCode,
          }
        : null,
    };

    return {
      name,
      scheduleMs: getProbeScheduleMs(name) ?? null,
      initialState,
    };
  });

  const initialRunningCount = names.filter(
    (n) => getProbeState(n).activeRuns.length > 0,
  ).length;

  return (
    <>
      <h1>reops-health-probe</h1>
      <div className="header-row">
        <p className="subtitle">Pipeline health monitor</p>
        {envLabel && (
          <span className="env-chip" title={`Environment: ${envLabel}`}>
            {envLabel}
          </span>
        )}
        <RunningPill initialCount={initialRunningCount} />
      </div>
      <nav>
        <a href="/">Dashboard</a>
        <a href="/metrics">Metrics</a>
        <a href="/docs">Grafana docs</a>
      </nav>

      {names.length === 0 ? (
        <p className="meta">No probes registered yet.</p>
      ) : (
        <Dashboard probes={probes} />
      )}

      <p className="refresh-note">
        build{" "}
        {sha === "unknown" ? (
          "unknown"
        ) : (
          <a
            href={`https://github.com/navikt/reops-health-probe/commit/${sha}`}
            target="_blank"
            rel="noopener"
          >
            {shortSha}
          </a>
        )}{" "}
        ·{" "}
        <a
          href="https://api.slack.com/apps/A0B69D3JSQN"
          target="_blank"
          rel="noopener"
        >
          Manage Slack webhook
        </a>
      </p>
    </>
  );
}
