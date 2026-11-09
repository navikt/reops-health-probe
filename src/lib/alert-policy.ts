export const CONSECUTIVE_FAILURES_THRESHOLD = 3;
export const SOFT_UNCONFIRMED_THRESHOLD = 3;
export const SOFT_WINDOW_SIZE = 100;

export interface SoftWarning {
  unconfirmed: number;
  runs: number;
  detectedAt: number;
  observation?: string;
}

export interface ProbeAlertState {
  consecutiveFailures: number;
  alertSent: boolean;
  recentResults: boolean[];
  softWarningActive: boolean;
  pendingWarning?: SoftWarning;
}

export function createAlertState(): ProbeAlertState {
  return {
    consecutiveFailures: 0,
    alertSent: false,
    recentResults: [],
    softWarningActive: false,
  };
}

/** Completed, non-aborted runs only. Hard incidents supersede soft warnings. */
export function recordAlertResult(
  state: ProbeAlertState,
  ok: boolean,
  now = Date.now(),
  observation?: string,
): "failing" | "recovered" | undefined {
  state.consecutiveFailures = ok ? 0 : state.consecutiveFailures + 1;

  if (state.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD && !state.alertSent) {
    state.alertSent = true;
    state.pendingWarning = undefined;
    state.recentResults = [];
    state.softWarningActive = false;
    return "failing";
  }

  if (state.alertSent) {
    if (!ok) return;
    state.alertSent = false;
    return "recovered";
  }

  state.recentResults.push(ok);
  if (state.recentResults.length > SOFT_WINDOW_SIZE) state.recentResults.shift();
  const unconfirmed = countUnconfirmedResults(state);
  const active = unconfirmed >= SOFT_UNCONFIRMED_THRESHOLD;
  if (active && !state.softWarningActive) {
    // Keep an overnight warning even if later runs clear the rolling window.
    state.pendingWarning ??= {
      unconfirmed,
      runs: state.recentResults.length,
      detectedAt: now,
      ...(observation ? { observation } : {}),
    };
  }
  state.softWarningActive = active;
}

export function countUnconfirmedResults(state: ProbeAlertState): number {
  return state.recentResults.filter((ok) => !ok).length;
}

const osloClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isWorkingHours(now = Date.now()): boolean {
  const parts = osloClock.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const weekday = value("weekday");
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  return !["Sat", "Sun"].includes(weekday) && minutes >= 9 * 60 && minutes < 16 * 60 + 30;
}
