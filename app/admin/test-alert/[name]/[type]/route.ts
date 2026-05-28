import { probes } from "@/server";
import { slackAlertFailing, slackAlertRecovered, slackAlertThrottleTest } from "@/src/lib/slack";
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

  if (type !== "failure" && type !== "recovery" && type !== "throttle") {
    return Response.json({ ok: false, error: "invalid type" }, { status: 400 });
  }

  log({ event: "admin.test-alert", probe: name, type });

  if (type === "failure") {
    await slackAlertFailing(name, "This is a simulated failure alert sent from the dashboard.", {
      bypassThrottle: true,
    });
  } else if (type === "recovery") {
    await slackAlertRecovered(name);
  } else {
    await slackAlertThrottleTest(name);
  }

  return Response.json({ ok: true });
}
