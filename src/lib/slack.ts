import { log, logError } from "./log.ts";

const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";

export async function slackAlert(message: string): Promise<void> {
  if (!webhookUrl) {
    log({ event: "slack.skipped", reason: "SLACK_WEBHOOK_URL not set" });
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      logError({ event: "slack.failed", status: res.status, body: await res.text() });
    }
  } catch (err) {
    log({ event: "slack.error", message: err instanceof Error ? err.message : String(err) });
  }
}
