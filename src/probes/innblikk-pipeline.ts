import { bqQuery } from "../lib/bigquery.ts";
import { log, logError } from "../lib/log.ts";
import type { Probe, ProbeContext, ProbeResult } from "../lib/runner.ts";

const schedule = { minute: { every: 1 } };

const WAIT_MS = 5 * 60 * 1000; // 48 minutes

const INGRESS_URL = "https://reops-event-proxy.ekstern.dev.nav.no";
const WEBSITE_ID = "96a8b610-7391-45f5-9253-84bee2333669";
const BQ_PROJECT = "team-researchops-dev-4396";
const BQ_DATASET = "custom_umami_views";
const BQ_VIEW = "custom_umami_view_event_data";

const INGRESS_PAYLOAD = (probeId: string) => ({
  type: "event",
  payload: {
    website: WEBSITE_ID,
    url: "/health-probe",
    hostname: "reops-health-probe",
    language: "en-US",
    referrer: "",
    screen: "1920x1080",
    title: "Health Probe",
    name: "health_probe",
    data: { probe_id: probeId },
  },
});

interface IngressResult {
  statusCode: number;
  /** Response body — useful for debugging failures */
  body: string;
}

async function sendProbeEvent(probeId: string): Promise<IngressResult> {
  const payload = INGRESS_PAYLOAD(probeId);
  const res = await fetch(`${INGRESS_URL}/api/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Opt-Out-Filters": "uuid",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { statusCode: res.status, body };
}

async function checkBigQuery(
  probeId: string,
  sentAt: number,
): Promise<boolean> {
  // Query the end-user-facing view (custom_umami_view_event_data) which reads from
  // event_data_transformed — populated by the scheduled query every 5 minutes.
  // event_parameters is a REPEATED RECORD; UNNEST to search within it.
  const query = `
    SELECT COUNT(*) AS cnt
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.${BQ_VIEW}\`,
    UNNEST(event_parameters) AS param
    WHERE website_id = @website_id
      AND created_at >= @sent_at
      AND param.data_key = 'probe_id'
      AND param.string_value = @probe_id
  `;
  const result = await bqQuery(BQ_PROJECT, query, [
    { name: "website_id", type: "STRING", value: WEBSITE_ID },
    {
      name: "sent_at",
      type: "TIMESTAMP",
      value: new Date(sentAt).toISOString(),
    },
    { name: "probe_id", type: "STRING", value: probeId },
  ]);
  const cnt = parseInt(result.rows?.[0]?.f?.[0]?.v ?? "0", 10);
  return cnt > 0;
}

export const innblikkPipelineProbe: Probe = {
  name: "innblikk-pipeline",
  schedule,
  intervalMs: 12_000,

  async run({ runId }: ProbeContext): Promise<ProbeResult> {
    const probeId = crypto.randomUUID();
    const start = Date.now();

    const ingress = await sendProbeEvent(probeId);

    if (ingress.statusCode < 200 || ingress.statusCode >= 300) {
      logError({
        event: "probe.ingress_failed",
        probe: "innblikk-pipeline",
        run_id: runId,
        probe_id: probeId,
        status_code: ingress.statusCode,
      });
      return {
        ok: false,
        probeId,
        message: `Ingress returned HTTP ${ingress.statusCode}`,
        errorDetails: `POST ${INGRESS_URL}/api/send\nPayload: ${JSON.stringify(INGRESS_PAYLOAD(probeId), null, 2)}\n\nResponse (${ingress.statusCode}):\n${ingress.body}`,
        durationMs: Date.now() - start,
        ingressStatusCode: ingress.statusCode,
      };
    }

    log({
      event: "probe.sent",
      probe: "innblikk-pipeline",
      run_id: runId,
      probe_id: probeId,
      wait_ms: WAIT_MS,
    });
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

    const found = await checkBigQuery(probeId, start);
    const durationMs = Date.now() - start;

    if (!found) {
      logError({
        event: "probe.not_found",
        probe: "innblikk-pipeline",
        run_id: runId,
        probe_id: probeId,
        duration_ms: durationMs,
      });
      return {
        ok: false,
        probeId,
        message: `Probe event not found in BigQuery after ${WAIT_MS / 60000} minutes`,
        errorDetails: `probe_id: ${probeId}\nSent at: ${new Date(start).toISOString()}\nIngress status: ${ingress.statusCode}\nIngress response: ${ingress.body}`,
        durationMs,
        ingressStatusCode: ingress.statusCode,
      };
    }

    log({
      event: "probe.found",
      probe: "innblikk-pipeline",
      run_id: runId,
      probe_id: probeId,
      duration_ms: durationMs,
    });
    return {
      ok: true,
      probeId,
      durationMs,
      ingressStatusCode: ingress.statusCode,
    };
  },
};
