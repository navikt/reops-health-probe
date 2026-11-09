import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAlertState,
  countUnconfirmedResults,
  isWorkingHours,
  recordAlertResult,
  SOFT_WINDOW_SIZE,
} from "../src/lib/alert-policy";

test("intermittent unconfirmed checks queue one warning without triggering a hard alert", () => {
  const state = createAlertState();
  for (const ok of [false, true, false, true]) assert.equal(recordAlertResult(state, ok, 100), undefined);
  assert.equal(state.pendingWarning, undefined);
  assert.equal(recordAlertResult(state, false, 200), undefined);
  const warning = state.pendingWarning;
  assert.deepEqual(warning, { unconfirmed: 3, runs: 5, detectedAt: 200 });
  recordAlertResult(state, true, 300);
  recordAlertResult(state, false, 400);
  assert.equal(state.pendingWarning, warning);
  assert.equal(state.alertSent, false);
});

test("soft window evicts old unconfirmed checks and rearms only after clearing", () => {
  const state = createAlertState();
  for (const ok of [false, true, false, true, false]) recordAlertResult(state, ok);
  state.pendingWarning = undefined; // Delivered.
  recordAlertResult(state, false);
  assert.equal(state.pendingWarning, undefined);
  for (let i = 0; i < SOFT_WINDOW_SIZE; i++) recordAlertResult(state, true);
  assert.equal(state.recentResults.length, SOFT_WINDOW_SIZE);
  assert.equal(countUnconfirmedResults(state), 0);
  assert.equal(state.softWarningActive, false);
  for (const ok of [false, true, false, true, false]) recordAlertResult(state, ok);
  assert.ok(state.pendingWarning);
});

test("three unconfirmed checks spread across 100 results trigger a warning", () => {
  const state = createAlertState();
  assert.equal(SOFT_WINDOW_SIZE, 100);
  recordAlertResult(state, false);
  for (let i = 0; i < 49; i++) recordAlertResult(state, true);
  recordAlertResult(state, false);
  for (let i = 0; i < 48; i++) recordAlertResult(state, true);
  assert.equal(state.pendingWarning, undefined);
  const observation = "Event not observed within configured polling waits; it may arrive later.";
  recordAlertResult(state, false, 500, observation);
  assert.deepEqual(state.pendingWarning, { unconfirmed: 3, runs: 100, detectedAt: 500, observation });
  recordAlertResult(state, true);
  assert.equal(countUnconfirmedResults(state), 2, "Result 101 evicts the oldest unconfirmed check");
  assert.equal(state.softWarningActive, false);
});

test("queued warning survives a cleared window until working hours", () => {
  const state = createAlertState();
  for (const ok of [false, true, false, true, false]) recordAlertResult(state, ok);
  const warning = state.pendingWarning;
  for (let i = 0; i < SOFT_WINDOW_SIZE; i++) recordAlertResult(state, true);
  assert.equal(countUnconfirmedResults(state), 0);
  assert.equal(state.pendingWarning, warning);
});

test("hard failure supersedes queued warnings; recovery starts a fresh soft window", () => {
  const state = createAlertState();
  for (const ok of [false, true, false, true, false]) recordAlertResult(state, ok);
  assert.ok(state.pendingWarning);
  assert.equal(recordAlertResult(state, false), undefined);
  assert.equal(recordAlertResult(state, false), "failing");
  assert.equal(state.pendingWarning, undefined);
  assert.deepEqual(state.recentResults, []);
  assert.equal(recordAlertResult(state, false), undefined);
  assert.equal(recordAlertResult(state, true), "recovered");
  assert.equal(recordAlertResult(state, true), undefined);
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.pendingWarning, undefined);
});

test("working hours use Oslo local time, weekdays, and exclusive 16:30 close", () => {
  const cases: [string, boolean][] = [
    ["2026-11-09T07:59:59Z", false],
    ["2026-11-09T08:00:00Z", true],
    ["2026-11-09T15:29:59Z", true],
    ["2026-11-09T15:30:00Z", false],
    ["2026-11-13T15:30:00Z", false],
    ["2026-11-14T10:00:00Z", false],
    ["2026-11-15T10:00:00Z", false],
    ["2026-11-16T08:00:00Z", true],
    ["2026-07-06T06:59:59Z", false],
    ["2026-07-06T07:00:00Z", true],
    ["2026-07-06T14:30:00Z", false],
    ["2026-03-30T07:00:00Z", true],
    ["2026-10-26T08:00:00Z", true],
  ];
  for (const [timestamp, expected] of cases) {
    assert.equal(isWorkingHours(Date.parse(timestamp)), expected, timestamp);
  }
});
