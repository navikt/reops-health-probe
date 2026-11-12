import { probes } from "@/server";
import { slackAlertFailing, slackAlertRecovered, slackAlertThrottled, slackAlertWarning } from "@/src/lib/slack";
import { SOFT_UNCONFIRMED_THRESHOLD, SOFT_WINDOW_SIZE } from "@/src/lib/alert-policy";
import { log } from "@/src/lib/log";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string; type: string }> },
) {
  const { name, type } = await params;

  if (!probes.find((p) => p.name === name)) {
    return Response.json({ ok: false, error: "probe not found" }, { status: 404 });
  }

  if (type !== "failure" && type !== "recovery" && type !== "throttle" && type !== "warning") {
    return Response.json({ ok: false, error: "invalid type" }, { status: 400 });
  }

  log({ event: "admin.test-alert", probe: name, type });

  if (type === "failure") {
    await slackAlertFailing(name, "", { bypassThrottle: true, isTest: true });
  } else if (type === "recovery") {
    await slackAlertRecovered(name, { isTest: true });
  } else if (type === "warning") {
    // Send immediately using synthetic counts, without touching live alert state.
    const current = { unconfirmed: SOFT_UNCONFIRMED_THRESHOLD, runs: SOFT_WINDOW_SIZE };
    const sent = await slackAlertWarning(name, {
      ...current,
      detectedAt: Date.now(),
      observation: "Simulated intermittent unconfirmed checks — sent from the test dashboard. No real probe results were changed.",
    }, current, { isTest: true });
    if (!sent) {
      return Response.json({ ok: false, error: "Slack delivery failed" }, { status: 502 });
    }
  } else {
    await slackAlertThrottled(name, { isTest: true });
  }

  return Response.json({ ok: true });
}
