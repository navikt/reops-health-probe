import { getAllProbeNames, getProbeState } from "./state";

export interface ProbeMetrics {
  success: boolean;
  durationMs: number;
}

interface GaugeEntry {
  value: number;
  labels: Record<string, string>;
}

const gauges = new Map<string, GaugeEntry[]>();

export function recordProbe(name: string, m: ProbeMetrics): void {
  gauges.set(`probe_success`, [
    ...(gauges.get("probe_success") ?? []).filter(
      (e) => e.labels.probe !== name,
    ),
    { value: m.success ? 1 : 0, labels: { probe: name } },
  ]);
  gauges.set(`probe_duration_seconds`, [
    ...(gauges.get("probe_duration_seconds") ?? []).filter(
      (e) => e.labels.probe !== name,
    ),
    { value: m.durationMs / 1000, labels: { probe: name } },
  ]);
  gauges.set(`probe_last_run_timestamp_seconds`, [
    ...(gauges.get("probe_last_run_timestamp_seconds") ?? []).filter(
      (e) => e.labels.probe !== name,
    ),
    { value: Math.floor(Date.now() / 1000), labels: { probe: name } },
  ]);
}

function labelsStr(labels: Record<string, string>): string {
  const pairs = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return pairs ? `{${pairs}}` : "";
}

function successRateEntries(): GaugeEntry[] {
  return getAllProbeNames().map((name) => {
    const { history } = getProbeState(name);
    if (history.length === 0) return { value: NaN, labels: { probe: name } };
    const successes = history.filter((r) => r.result.ok).length;
    return { value: successes / history.length, labels: { probe: name } };
  });
}

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [name, entries] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    for (const e of entries) {
      lines.push(`${name}${labelsStr(e.labels)} ${e.value}`);
    }
  }
  // Computed live from full history so it's always consistent with stored runs.
  lines.push(
    `# HELP probe_success_rate Running average of successful runs (0.0 to 1.0)`,
  );
  lines.push(`# TYPE probe_success_rate gauge`);
  for (const e of successRateEntries()) {
    if (!isNaN(e.value)) {
      lines.push(`probe_success_rate${labelsStr(e.labels)} ${e.value}`);
    }
  }
  return lines.join("\n") + "\n";
}
