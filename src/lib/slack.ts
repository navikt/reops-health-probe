const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";

export async function slackAlert(message: string): Promise<void> {
  if (!webhookUrl) {
    console.warn("[slack] SLACK_WEBHOOK_URL not set, skipping alert");
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      console.error(`[slack] webhook failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[slack] webhook error (skipping): ${err instanceof Error ? err.message : err}`);
  }
}
