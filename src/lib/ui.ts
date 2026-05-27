import { getAllProbeNames, getProbeState } from "./state.ts";

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function probeCard(name: string): string {
  const state = getProbeState(name);
  const latest = state.history[0];
  const statusLabel = state.paused
    ? `<span class="badge badge-paused">PAUSED</span>`
    : state.running
    ? `<span class="badge badge-running">RUNNING</span>`
    : latest == null
    ? `<span class="badge badge-unknown">NO DATA</span>`
    : latest.result.ok
    ? `<span class="badge badge-ok">OK</span>`
    : `<span class="badge badge-fail">FAILING</span>`;

  const historyDots = state.history
    .slice(0, 20)
    .map((run) => {
      const cls = run.result.ok ? "dot-ok" : "dot-fail";
      const tip = `${formatTimestamp(run.timestamp)} — ${run.result.ok ? "OK" : run.result.message ?? "failed"} (${formatDuration(run.result.durationMs)})`;
      return `<span class="dot ${cls}" title="${tip}"></span>`;
    })
    .join("");

  const runningInfo = state.running && state.runStartedAt
    ? `<div class="running-msg">⏳ Probe in progress — started ${relativeTime(state.runStartedAt)} (${formatDuration(Date.now() - state.runStartedAt)} elapsed)</div>`
    : "";

  const lastRunInfo = latest
    ? `<div class="meta">Last run: <strong>${relativeTime(latest.timestamp)}</strong> · ${formatTimestamp(latest.timestamp)} · Duration: <strong>${formatDuration(latest.result.durationMs)}</strong> · Ingress: <strong>${latest.result.ingressStatusCode}</strong></div>`
    : `<div class="meta">No runs recorded yet.</div>`;

  const runBtn = `<form method="POST" action="/admin/run/${encodeURIComponent(name)}"><button class="btn btn-run">⚡ Run now</button></form>`;

  const pauseBtn = state.paused
    ? `<form method="POST" action="/admin/resume/${encodeURIComponent(name)}"><button class="btn btn-resume">▶ Resume</button></form>`
    : `<form method="POST" action="/admin/pause/${encodeURIComponent(name)}"><button class="btn btn-pause">⏸ Pause</button></form>`;

  const failMsg =
    latest && !latest.result.ok && !state.paused
      ? `<div class="fail-msg">⚠ ${latest.result.message ?? "unknown error"}</div>`
      : "";

  return `
  <div class="card ${state.paused ? "card-paused" : state.running ? "card-running" : latest?.result.ok === false ? "card-fail" : ""}">
    <div class="card-header">
      <div class="card-title">
        <code>${name}</code>
        ${statusLabel}
      </div>
      <div class="card-actions">${runBtn}${pauseBtn}</div>
    </div>
    ${failMsg}
    ${runningInfo}
    ${lastRunInfo}
    <div class="history-label">Last ${state.history.length} runs:</div>
    <div class="history-dots">${historyDots || '<span class="meta">—</span>'}</div>
  </div>`;
}

export function renderDashboard(): string {
  const names = getAllProbeNames();
  const cards = names.length > 0 ? names.map(probeCard).join("\n") : `<p class="meta">No probes registered yet.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>reops-health-probe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #718096; font-size: 0.875rem; margin-bottom: 2rem; }
    nav { margin-bottom: 2rem; display: flex; gap: 1.5rem; font-size: 0.875rem; }
    .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 0.75rem; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
    .card-paused { border-color: #744210; background: #1a1a0e; }
    .card-fail { border-color: #742a2a; background: #1a0e0e; }
    .card-running { border-color: #2b6cb0; background: #0d1a2e; }
    .card-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
    .card-actions { display: flex; gap: 0.5rem; align-items: center; }
    .card-title { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .card-title code { font-size: 1rem; font-weight: 600; background: #2d3748; padding: 0.2rem 0.5rem; border-radius: 0.25rem; }
    .badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 0.25rem; letter-spacing: 0.05em; }
    .badge-ok { background: #1c4532; color: #68d391; }
    .badge-fail { background: #742a2a; color: #fc8181; }
    .badge-running { background: #1a365d; color: #90cdf4; animation: pulse 1.5s ease-in-out infinite; }
    .badge-paused { background: #744210; color: #f6ad55; }
    .badge-unknown { background: #2d3748; color: #a0aec0; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
    .meta { font-size: 0.8rem; color: #718096; margin-bottom: 0.5rem; }
    .fail-msg { font-size: 0.8rem; color: #fc8181; background: #2d1515; border-radius: 0.25rem; padding: 0.4rem 0.75rem; margin-bottom: 0.75rem; }
    .running-msg { font-size: 0.8rem; color: #90cdf4; background: #0d1e35; border-radius: 0.25rem; padding: 0.4rem 0.75rem; margin-bottom: 0.75rem; }
    .history-label { font-size: 0.7rem; color: #4a5568; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    .history-dots { display: flex; gap: 3px; flex-wrap: wrap; }
    .dot { width: 10px; height: 10px; border-radius: 2px; cursor: default; }
    .dot-ok { background: #38a169; }
    .dot-fail { background: #e53e3e; }
    .btn { border: none; border-radius: 0.375rem; padding: 0.35rem 0.85rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .btn-run { background: #1a3a5c; color: #63b3ed; }
    .btn-run:hover { background: #2a5a8c; }
    .btn-pause { background: #744210; color: #f6ad55; }
    .btn-pause:hover { background: #975a16; }
    .btn-resume { background: #1c4532; color: #68d391; }
    .btn-resume:hover { background: #276749; }
    .refresh-note { font-size: 0.75rem; color: #4a5568; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>reops-health-probe</h1>
  <p class="subtitle">Pipeline health monitor · auto-refreshes every 30s</p>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/metrics">Metrics</a>
    <a href="/docs">Grafana docs</a>
  </nav>
  ${cards}
  <p class="refresh-note">Page auto-refreshes every 30 seconds.</p>
</body>
</html>`;
}

export function renderDocs(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grafana docs — reops-health-probe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 2rem; max-width: 860px; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 2rem 0 0.75rem; color: #a0aec0; border-bottom: 1px solid #2d3748; padding-bottom: 0.4rem; }
    h3 { font-size: 0.95rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
    .subtitle { color: #718096; font-size: 0.875rem; margin-bottom: 2rem; }
    nav { margin-bottom: 2rem; display: flex; gap: 1.5rem; font-size: 0.875rem; }
    p { font-size: 0.9rem; line-height: 1.6; color: #cbd5e0; margin-bottom: 0.75rem; }
    ul { padding-left: 1.25rem; margin-bottom: 0.75rem; }
    li { font-size: 0.9rem; line-height: 1.8; color: #cbd5e0; }
    pre { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 0.5rem; padding: 1rem 1.25rem; overflow-x: auto; margin-bottom: 1rem; }
    code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.82rem; color: #e2e8f0; }
    p code, li code { background: #2d3748; padding: 0.1rem 0.35rem; border-radius: 0.2rem; font-size: 0.82rem; }
    .tip { background: #1a2a1a; border-left: 3px solid #38a169; padding: 0.75rem 1rem; border-radius: 0 0.375rem 0.375rem 0; margin-bottom: 1rem; font-size: 0.875rem; color: #9ae6b4; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 1rem; }
    th { text-align: left; padding: 0.5rem 0.75rem; background: #1a1f2e; color: #a0aec0; font-weight: 600; border-bottom: 1px solid #2d3748; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1a1f2e; color: #cbd5e0; }
    td code { background: #2d3748; padding: 0.1rem 0.35rem; border-radius: 0.2rem; }
  </style>
</head>
<body>
  <h1>Grafana dashboard setup</h1>
  <p class="subtitle">How to add reops-health-probe metrics to your Grafana dashboard</p>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/metrics">Metrics</a>
    <a href="/docs">Grafana docs</a>
  </nav>

  <h2>Available metrics</h2>
  <p>All metrics are exposed at <code>/metrics</code> in Prometheus text format. Each metric has a <code>probe</code> label.</p>
  <table>
    <tr><th>Metric</th><th>Type</th><th>Description</th></tr>
    <tr><td><code>probe_success</code></td><td>gauge</td><td><code>1</code> = last run OK, <code>0</code> = failed</td></tr>
    <tr><td><code>probe_duration_seconds</code></td><td>gauge</td><td>Duration of last probe run</td></tr>
    <tr><td><code>probe_ingress_status_code</code></td><td>gauge</td><td>HTTP status from ingress on last run</td></tr>
    <tr><td><code>probe_last_run_timestamp_seconds</code></td><td>gauge</td><td>Unix timestamp of last run</td></tr>
  </table>

  <h2>1. Add Prometheus data source</h2>
  <p>In Grafana → <strong>Connections → Data sources → Add data source → Prometheus</strong>.</p>
  <p>Set the URL to where this service is reachable, e.g. <code>http://reops-health-probe:9091</code> (in-cluster) or your ingress URL.</p>

  <h2>2. Useful PromQL queries</h2>

  <h3>Probe up/down status</h3>
  <pre><code>probe_success{probe="innblikk-pipeline"}</code></pre>
  <p>Use a <strong>Stat</strong> panel with thresholds: <code>0</code> = red, <code>1</code> = green.</p>

  <h3>All probes status table</h3>
  <pre><code>probe_success</code></pre>
  <p>Use a <strong>Table</strong> or <strong>Status history</strong> panel.</p>

  <h3>Probe duration over time</h3>
  <pre><code>probe_duration_seconds{probe="innblikk-pipeline"}</code></pre>
  <p>Use a <strong>Time series</strong> panel. Duration includes the wait time for the pipeline to process the event.</p>

  <h3>Time since last successful run</h3>
  <pre><code>(time() - probe_last_run_timestamp_seconds) / 60</code></pre>
  <p>Returns minutes since last run. Useful for detecting a stalled probe.</p>

  <h3>Alert rule: probe failing</h3>
  <pre><code>probe_success{probe="innblikk-pipeline"} == 0</code></pre>
  <p>Set <strong>pending period</strong> to <code>0</code> (fire immediately) or <code>5m</code> to avoid flapping alerts.</p>

  <h2>3. Example dashboard JSON (minimal)</h2>
  <p>Import this into Grafana (<strong>Dashboards → Import → Paste JSON</strong>):</p>
  <pre><code>{
  "title": "reops-health-probe",
  "panels": [
    {
      "type": "stat",
      "title": "innblikk-pipeline",
      "targets": [{ "expr": "probe_success{probe=\\"innblikk-pipeline\\"}" }],
      "fieldConfig": {
        "defaults": {
          "mappings": [{ "type": "value", "options": { "0": { "text": "FAILING", "color": "red" }, "1": { "text": "OK", "color": "green" } } }]
        }
      }
    },
    {
      "type": "timeseries",
      "title": "Probe duration",
      "targets": [{ "expr": "probe_duration_seconds" }]
    }
  ]
}</code></pre>

  <div class="tip">
    Tip: The probe runs every 12 minutes and the pipeline has a ~10 minute processing window, so expect <code>probe_duration_seconds</code> to be around 600–700s on a healthy run.
  </div>

  <h2>4. Adding a new probe</h2>
  <p>See <a href="https://github.com/navikt/reops-health-probe" target="_blank">README</a> for the full guide. Summary:</p>
  <ul>
    <li>Create <code>src/probes/&lt;name&gt;.ts</code> exporting a <code>Probe</code> object</li>
    <li>Register it in <code>src/main.ts</code> with <code>Deno.cron</code> + <code>registerProbe</code></li>
    <li>It will appear automatically on the dashboard and in metrics</li>
  </ul>
</body>
</html>`;
}
