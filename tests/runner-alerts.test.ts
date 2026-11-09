import assert from "node:assert/strict";
import { test } from "node:test";
import type { Probe } from "../src/lib/runner";
import { SOFT_WINDOW_SIZE } from "../src/lib/alert-policy";

test("runner delivers soft warnings in working hours without changing hard alerts", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  // No real webhook or pipeline calls: all network traffic is intercepted.
  process.env.SLACK_WEBHOOK_URL = "https://example.invalid/test-webhook";
  const { runProbe, startProbe } = require("../src/lib/runner") as typeof import("../src/lib/runner");
  const { setPaused } = require("../src/lib/state") as typeof import("../src/lib/state");
  let now = Date.parse("2026-11-13T17:00:00Z");
  t.mock.method(Date, "now", () => now);
  const payloads: { text: string; attachments: { blocks: unknown[] }[] }[] = [];
  let slackOk = true;
  let deliveryGate: Promise<void> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)));
    await deliveryGate;
    return new Response(slackOk ? "ok" : "error", { status: slackOk ? 200 : 500 });
  });
  const ticks: (() => Promise<void>)[] = [];
  t.mock.method(globalThis, "setInterval", (fn: () => Promise<void>) => {
    ticks.push(fn);
    return {} as ReturnType<typeof setInterval>;
  });
  let ok = true;
  const probe = (name: string): Probe => ({
    name,
    schedule: { type: "interval", ms: 30_000 },
    async run() {
      return {
        ok,
        durationMs: 1,
        message: "Probe event not observed in BigQuery after 7 checks (configured polling waits: ~20 min). It may still arrive later; event loss is not confirmed.",
      };
    },
  });
  const run = async (p: Probe, results: boolean[]) => {
    for (const result of results) { ok = result; await runProbe(p); }
  };

  const intermittent = probe("intermittent");
  startProbe(intermittent);
  await run(intermittent, [false, true, false, true, false]);
  assert.equal(payloads.length, 0, "Friday evening warning is deferred");
  await run(intermittent, Array(SOFT_WINDOW_SIZE).fill(true));
  setPaused(intermittent.name, true);
  now = Date.parse("2026-11-14T10:00:00Z");
  await ticks[1]();
  assert.equal(payloads.length, 0, "Saturday is not a workday");
  now = Date.parse("2026-11-16T08:00:00Z");
  await ticks[1]();
  assert.equal(payloads.length, 1, "Monday timer delivers even when paused");
  assert.match(payloads[0].text, /Possible pipeline QoS degradation/);
  const warningText = JSON.stringify(payloads[0]);
  assert.match(warningText, /no longer met: 0 of the last 100/);
  assert.match(warningText, /configured polling waits: ~20 min/);
  assert.match(warningText, /may still arrive later/);
  assert.match(warningText, /not confirmed event loss or an outage/);
  assert.doesNotMatch(warningText, /failures|probes failed/i);
  await ticks[1]();
  assert.equal(payloads.length, 1, "Delivered warning is not repeated");

  const retry = probe("retry");
  startProbe(retry);
  slackOk = false;
  await run(retry, [false, true, false, true, false]);
  assert.equal(payloads.length, 2);
  slackOk = true;
  let releaseDelivery!: () => void;
  deliveryGate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
  const pendingDelivery = ticks[3]();
  await ticks[3]();
  assert.equal(payloads.length, 3, "Concurrent flush does not duplicate an in-flight warning");
  releaseDelivery();
  await pendingDelivery;
  deliveryGate = undefined;
  assert.equal(payloads.length, 3, "Failed delivery is retried");
  await ticks[3]();
  assert.equal(payloads.length, 3);

  now = Date.parse("2026-11-16T22:00:00Z");
  const hard = probe("hard");
  startProbe(hard);
  await run(hard, [false, true, false, true, false, false, false]);
  assert.equal(payloads.length, 4, "Hard failure fires immediately outside working hours");
  assert.match(payloads[3].text, /Health probe unable to confirm delivery/);
  await run(hard, [false, true]);
  assert.equal(payloads.length, 5);
  assert.match(payloads[4].text, /Health probe recovered/);
  now = Date.parse("2026-11-17T08:00:00Z");
  await ticks[5]();
  assert.equal(payloads.length, 5, "Hard incident cancels pending soft warning");
});
