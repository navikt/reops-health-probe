import { bqQuery } from "../lib/bigquery.ts";
import type { Probe, ProbeResult } from "../lib/runner.ts";

const INGRESS_URL = "https://reops-event-proxy.ekstern.dev.nav.no";
const WEBSITE_ID = "96a8b610-7391-45f5-9253-84bee2333669";
const BQ_PROJECT = "team-researchops-prod-01d6";
const BQ_DATASET = "umami_custom";
const BQ_TABLE = "public_website_event";

const WAIT_MS = 10 * 60 * 1000; // 10 minutes

async function sendProbeEvent(probeId: string): Promise<number> {
  const res = await fetch(`${INGRESS_URL}/api/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  return res.status;
}

async function checkBigQuery(probeId: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) AS cnt
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\`
    WHERE event_name = 'health_probe'
      AND JSON_VALUE(event_data, '$.probe_id') = @probe_id
      AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
  `;
  const result = await bqQuery(BQ_PROJECT, query, [
    { name: "probe_id", type: "STRING", value: probeId },
  ]);
  const cnt = parseInt(result.rows?.[0]?.[0]?.v ?? "0", 10);
  return cnt > 0;
}

export const innblikkPipelineProbe: Probe = {
  name: "innblikk-pipeline",

  async run(): Promise<ProbeResult> {
    const probeId = crypto.randomUUID();
    const start = Date.now();

    const ingressStatusCode = await sendProbeEvent(probeId);

    if (ingressStatusCode < 200 || ingressStatusCode >= 300) {
      return {
        ok: false,
        message: `Ingress returned HTTP ${ingressStatusCode}`,
        durationMs: Date.now() - start,
        ingressStatusCode,
      };
    }

    console.log(`[innblikk-pipeline] probe sent (id=${probeId}), waiting ${WAIT_MS / 1000}s for BQ...`);
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

    const found = await checkBigQuery(probeId);
    const durationMs = Date.now() - start;

    if (!found) {
      return {
        ok: false,
        message: `Probe event (id=${probeId}) not found in BigQuery after ${WAIT_MS / 60000} minutes`,
        durationMs,
        ingressStatusCode,
      };
    }

    return { ok: true, durationMs, ingressStatusCode };
  },
};
