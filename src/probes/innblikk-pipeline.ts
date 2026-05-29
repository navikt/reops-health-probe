import { fetchWithRetry } from "../lib/fetch";
import { bqQuery } from "../lib/bigquery";
import { log, logError } from "../lib/log";
import type { Probe, ProbeContext, ProbeResult } from "../lib/runner";

const WAIT_MS = 5 * 60 * 1000;

const isProd = ["prod", "production"].includes(
  (process.env.ENVIRONMENT ?? "").toLowerCase(),
);

const INGRESS_URL = isProd
  ? "https://reops-event-proxy.nav.no"
  : "https://reops-event-proxy.ekstern.dev.nav.no";
const WEBSITE_ID = isProd
  ? "8f25f313-f86f-44fa-aef3-0b0dc1fc480a"
  : "aa53f050-7caa-4873-9d0d-d746f8fef256";
const BQ_PROJECT = isProd
  ? "team-researchops-prod-01d6"
  : "team-researchops-dev-4396";
const BQ_DATASET = isProd ? "custom_umami_views" : "umami_views";
const BQ_VIEW = isProd ? "custom_umami_view_event_data" : "event_data";

const INGRESS_PAYLOAD = (probeId: string) => ({
  type: "event",
  payload: {
    website: WEBSITE_ID,
    data: { probe_id: probeId },
  },
});

async function sendProbeEvent(probeId: string, signal: AbortSignal) {
  const payload = INGRESS_PAYLOAD(probeId);
  return await fetchWithRetry({
    url: `${INGRESS_URL}/api/send`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Opt-Out-Filters": "uuid",
    },
    body: JSON.stringify(payload),
    signal,
  });
}

async function checkBigQuery(
  probeId: string,
  sentAt: number,
): Promise<{ found: boolean; requestSummary: string; query: string }> {
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
  return {
    found: cnt > 0,
    requestSummary: result.requestSummary,
    query: result.query,
  };
}

export const innblikkPipelineProbe: Probe = {
  name: "innblikk-pipeline",
  schedule: { type: "interval", ms: 30_000 },

  async run({ runId, signal, setProbeId }: ProbeContext): Promise<ProbeResult> {
    const probeId = crypto.randomUUID();
    const start = Date.now();

    const ingress = await sendProbeEvent(probeId, signal);

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
        errorDetails: `Ingress request failed — see ingress details below.`,
        ingressDetails: ingress.requestSummary,
        durationMs: Date.now() - start,
      };
    }

    // Ingress accepted — probeId is now known, surface it on the running dot
    setProbeId(probeId);

    log({
      event: "probe.sent",
      probe: "innblikk-pipeline",
      run_id: runId,
      probe_id: probeId,
      wait_ms: WAIT_MS,
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, WAIT_MS);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(signal.reason);
        },
        { once: true },
      );
    });

    const bq = await checkBigQuery(probeId, start);
    const durationMs = Date.now() - start;

    if (!bq.found) {
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
        errorDetails: `probe_id: ${probeId}\nSent at: ${new Date(start).toISOString()}`,
        ingressDetails: ingress.requestSummary,
        bqDetails: bq.requestSummary,
        bqQuery: bq.query,
        durationMs,
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
      ingressDetails: ingress.requestSummary,
      bqDetails: bq.requestSummary,
      bqQuery: bq.query,
      durationMs,
    };
  },
};
