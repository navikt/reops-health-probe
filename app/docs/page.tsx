export default function DocsPage() {
  return (
    <div className="docs-body">
      <h1>Grafana dashboard setup</h1>
      <p className="subtitle">
        How to add reops-health-probe metrics to your Grafana dashboard
      </p>
      <nav>
        <a href="/">Dashboard</a>
        <a href="/metrics">Metrics</a>
        <a href="/docs">Grafana docs</a>
      </nav>

      <h2>Available metrics</h2>
      <p>
        All metrics are exposed at <code>/metrics</code> in Prometheus text
        format. Each metric has a <code>probe</code> label.
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>probe_success</code>
            </td>
            <td>gauge</td>
            <td>
              <code>1</code> = last run OK, <code>0</code> = failed
            </td>
          </tr>
          <tr>
            <td>
              <code>probe_duration_seconds</code>
            </td>
            <td>gauge</td>
            <td>Duration of last probe run</td>
          </tr>
          <tr>
            <td>
              <code>probe_success_rate</code>
            </td>
            <td>gauge</td>
            <td>
              Running average of successful runs over full history (0.0–1.0)
            </td>
          </tr>
          <tr>
            <td>
              <code>probe_last_run_timestamp_seconds</code>
            </td>
            <td>gauge</td>
            <td>Unix timestamp of last run</td>
          </tr>
        </tbody>
      </table>

      <h2>1. Add Prometheus data source</h2>
      <p>
        In Grafana →{" "}
        <strong>
          Connections → Data sources → Add data source → Prometheus
        </strong>
        .
      </p>
      <p>
        Set the URL to where this service is reachable, e.g.{" "}
        <code>http://reops-health-probe:9091</code> (in-cluster) or your ingress
        URL.
      </p>

      <h2>2. Useful PromQL queries</h2>

      <h3>Probe up/down status</h3>
      <pre>
        <code>{`probe_success{probe="innblikk-pipeline"}`}</code>
      </pre>
      <p>
        Use a <strong>Stat</strong> panel with thresholds: <code>0</code> = red,{" "}
        <code>1</code> = green.
      </p>

      <h3>All probes status table</h3>
      <pre>
        <code>probe_success</code>
      </pre>
      <p>
        Use a <strong>Table</strong> or <strong>Status history</strong> panel.
      </p>

      <h3>Probe duration over time</h3>
      <pre>
        <code>{`probe_duration_seconds{probe="innblikk-pipeline"}`}</code>
      </pre>
      <p>
        Use a <strong>Time series</strong> panel. Duration includes the wait
        time for the pipeline to process the event.
      </p>

      <h3>Time since last successful run</h3>
      <pre>
        <code>(time() - probe_last_run_timestamp_seconds) / 60</code>
      </pre>
      <p>
        Returns minutes since last run. Useful for detecting a stalled probe.
      </p>

      <h3>Alert rule: probe failing</h3>
      <pre>
        <code>{`probe_success{probe="innblikk-pipeline"} == 0`}</code>
      </pre>
      <p>
        Set <strong>pending period</strong> to <code>0</code> (fire immediately)
        or <code>5m</code> to avoid flapping alerts.
      </p>

      <h2>3. Example dashboard JSON (minimal)</h2>
      <p>
        Import this into Grafana (
        <strong>Dashboards → Import → Paste JSON</strong>):
      </p>
      <pre>
        <code>{`{
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
}`}</code>
      </pre>

      <h2>4. Adding a new probe</h2>
      <p>
        See{" "}
        <a
          href="https://github.com/navikt/reops-health-probe"
          target="_blank"
          rel="noopener"
        >
          README
        </a>{" "}
        for the full guide. Summary:
      </p>
      <ul>
        <li>
          Create <code>src/probes/&lt;name&gt;.ts</code> exporting a{" "}
          <code>Probe</code> object
        </li>
        <li>
          Register it in <code>server.ts</code> with <code>startProbe</code> +{" "}
          <code>registerProbe</code>
        </li>
        <li>It will appear automatically on the dashboard and in metrics</li>
      </ul>
    </div>
  );
}
