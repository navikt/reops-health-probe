import assert from "node:assert/strict";
import { test } from "node:test";
import { SOFT_UNCONFIRMED_THRESHOLD, SOFT_WINDOW_SIZE } from "../src/lib/alert-policy";

test("QoS warning simulation uses the real template with a test badge", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  process.env.SLACK_WEBHOOK_URL = "https://example.invalid/test-webhook";
  const { slackAlertWarning } = require("../src/lib/slack") as typeof import("../src/lib/slack");
  const payloads: { text: string; attachments: { color: string; blocks: unknown[] }[] }[] = [];
  let slackOk = true;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response(slackOk ? "ok" : "error", { status: slackOk ? 200 : 500 });
  });
  const current = { unconfirmed: SOFT_UNCONFIRMED_THRESHOLD, runs: SOFT_WINDOW_SIZE };
  const warning = {
    ...current,
    detectedAt: Date.parse("2026-11-14T22:00:00Z"),
    observation: "Simulated intermittent unconfirmed checks. No real probe results were changed.",
  };

  assert.equal(await slackAlertWarning("test-probe", warning, current, { isTest: true }), true);
  assert.equal(payloads.length, 1, "Simulation sends directly, without working-hours scheduling");
  assert.match(payloads[0].text, /Possible pipeline QoS degradation · Test/);
  assert.equal(payloads[0].attachments[0].color, "warning");
  const body = JSON.stringify(payloads[0]);
  assert.match(body, /Possible pipeline QoS degradation · Test.*emoji/);
  assert.match(body, /3 of 100 recent completed checks/);
  assert.match(body, /threshold is still met: 3 of the last 100/);
  assert.match(body, /Simulated intermittent unconfirmed checks/);
  assert.match(body, /not confirmed event loss or an outage/);
  assert.match(body, /Mon–Fri, 09:00–16:30 Europe\/Oslo/);

  await slackAlertWarning("test-probe", warning, current);
  assert.doesNotMatch(JSON.stringify(payloads[1]), / · Test/);

  slackOk = false;
  assert.equal(await slackAlertWarning("test-probe", warning, current, { isTest: true }), false);
});
