import { probes } from "@/server";
import { slackAlertFailing, slackAlertRecovered, slackAlertThrottled } from "@/src/lib/slack";
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
    await slackAlertFailing(name, "", { bypassThrottle: true, isTest: true });
  } else if (type === "recovery") {
    await slackAlertRecovered(name, { isTest: true });
  } else {
    await slackAlertThrottled(name, { isTest: true });
  }

  return Response.json({ ok: true });
}
