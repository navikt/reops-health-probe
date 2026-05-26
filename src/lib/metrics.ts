export interface ProbeMetrics {
  success: boolean;
  durationMs: number;
  ingressStatusCode: number;
}

interface GaugeEntry {
  value: number;
  labels: Record<string, string>;
}

const gauges = new Map<string, GaugeEntry[]>();

export function recordProbe(name: string, m: ProbeMetrics): void {
  gauges.set(`probe_success`, [
    ...(gauges.get("probe_success") ?? []).filter((e) => e.labels.probe !== name),
    { value: m.success ? 1 : 0, labels: { probe: name } },
  ]);
  gauges.set(`probe_duration_seconds`, [
    ...(gauges.get("probe_duration_seconds") ?? []).filter((e) => e.labels.probe !== name),
    { value: m.durationMs / 1000, labels: { probe: name } },
  ]);
  gauges.set(`probe_ingress_status_code`, [
    ...(gauges.get("probe_ingress_status_code") ?? []).filter((e) => e.labels.probe !== name),
    { value: m.ingressStatusCode, labels: { probe: name } },
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

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [name, entries] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    for (const e of entries) {
      lines.push(`${name}${labelsStr(e.labels)} ${e.value}`);
    }
  }
  return lines.join("\n") + "\n";
}
