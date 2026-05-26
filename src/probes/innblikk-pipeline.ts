import { bqQuery } from "../lib/bigquery.ts";
import type { Probe, ProbeResult } from "../lib/runner.ts";

const INGRESS_URL = "https://reops-event-proxy.ekstern.dev.nav.no";
const WEBSITE_ID = "96a8b610-7391-45f5-9253-84bee2333669";
const BQ_PROJECT = "team-researchops-prod-01d6";
const BQ_DATASET = "umami_custom";

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

async function checkBigQuery(probeId: string, sentAt: number): Promise<boolean> {
  // public_website_event has no partition — filter on website_id + created_at to limit scan.
  // probe_id is stored as a key-value row in public_event_data, joined via website_event_id.
  const query = `
    SELECT COUNT(*) AS cnt
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.public_website_event\` e
    JOIN \`${BQ_PROJECT}.${BQ_DATASET}.public_event_data\` d
      ON d.website_event_id = e.event_id
    WHERE e.website_id = @website_id
      AND e.created_at >= @sent_at
      AND e.created_at <= TIMESTAMP_ADD(@sent_at, INTERVAL 35 MINUTE)
      AND e.event_name = 'health_probe'
      AND d.data_key = 'probe_id'
      AND d.string_value = @probe_id
  `;
  const result = await bqQuery(BQ_PROJECT, query, [
    { name: "website_id", type: "STRING", value: WEBSITE_ID },
    { name: "sent_at", type: "TIMESTAMP", value: new Date(sentAt).toISOString() },
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

    const found = await checkBigQuery(probeId, start);
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
