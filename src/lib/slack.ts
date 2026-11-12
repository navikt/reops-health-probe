import { log, logError } from "./log";
import { SOFT_UNCONFIRMED_THRESHOLD, SOFT_WINDOW_SIZE, type SoftWarning } from "./alert-policy";

const webhookUrl = process.env.SLACK_WEBHOOK_URL ?? "";
const environment = process.env.ENVIRONMENT ?? "unknown";
const isProd = ["prod", "production"].includes(environment.toLowerCase());
const PROBE_UI_URL = isProd
  ? "https://reops-health-probe.ansatt.nav.no/"
  : "https://reops-health-probe.ansatt.dev.nav.no/";

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

/**
 * Throttle: track ok→fail transitions per probe within a rolling 1-hour window.
 * After 2 ok→fail transitions in 1 hour, suppress further alerts and post a
 * single throttle notice instead. Reset on recovery (fail→ok).
 */
interface ThrottleState {
  /** Timestamps (ms) of recent ok→fail transitions within the throttle window */
  transitionTimestamps: number[];
  /** Whether a throttle-notice has already been posted for the current burst */
  throttleNoticeSent: boolean;
}

const THROTTLE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_TRANSITIONS = 2;

const throttleMap = new Map<string, ThrottleState>();

function getThrottle(probe: string): ThrottleState {
  if (!throttleMap.has(probe)) {
    throttleMap.set(probe, {
      transitionTimestamps: [],
      throttleNoticeSent: false,
    });
  }
  return throttleMap.get(probe)!;
}

/**
 * Called on ok→fail transition.
 * Returns "send" | "throttled" | "suppress".
 */
function recordFailureTransition(
  probe: string,
): "send" | "throttled" | "suppress" {
  const now = Date.now();
  const state = getThrottle(probe);

  state.transitionTimestamps = state.transitionTimestamps.filter(
    (t) => now - t < THROTTLE_WINDOW_MS,
  );

  if (state.transitionTimestamps.length >= MAX_TRANSITIONS) {
    if (state.throttleNoticeSent) return "suppress";
    return "throttled";
  }

  state.transitionTimestamps.push(now);
  return "send";
}

/** Called on fail→ok recovery. Resets throttle for the probe. */
function recordRecovery(probe: string): void {
  throttleMap.set(probe, {
    transitionTimestamps: [],
    throttleNoticeSent: false,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envLabel(): string {
  const e = environment.toLowerCase();
  if (e === "prod" || e === "production") return "PROD";
  if (e === "dev" || e === "development") return "DEV";
  return environment.toUpperCase();
}

async function postToSlack(payload: unknown): Promise<boolean> {
  if (!webhookUrl) {
    log({ event: "slack.skipped", reason: "SLACK_WEBHOOK_URL not set" });
    return false;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logError({
        event: "slack.failed",
        status: res.status,
        body: await res.text(),
      });
      return false;
    }
    return true;
  } catch (err) {
    logError({
      event: "slack.error",
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alert template
// ---------------------------------------------------------------------------

type AlertType = "failing" | "recovered" | "throttled" | "warning";

interface AlertData {
  type: AlertType;
  probe: string;
  /** Body message. For "failing": the error detail. For "throttled": omit — derived internally. */
  message?: string;
  /** Throttled only — human-readable time when alerts resume. */
  resumesAt?: string;
  /** When true, marks the message as a test. Default false. */
  isTest?: boolean;
}

const ALERT_CONFIG: Record<
  AlertType,
  { emoji: string; color: string; title: string; defaultMessage: string }
> = {
  warning: {
    emoji: "🟡",
    color: "warning",
    title: "Possible pipeline QoS degradation",
    defaultMessage: "",
  },
  failing: {
    emoji: "🔴",
    color: "danger",
    title: "Health probe unable to confirm delivery",
    defaultMessage: "Simulated failure — sent from the test dashboard.",
  },
  recovered: {
    emoji: "✅",
    color: "good",
    title: "Health probe recovered",
    defaultMessage: "",
  },
  throttled: {
    emoji: "⏸️",
    color: "warning",
    title: "Alert throttled",
    defaultMessage: "",
  },
};

function buildAlertPayload(data: AlertData): unknown {
  const { type, probe, isTest = false, resumesAt } = data;
  const cfg = ALERT_CONFIG[type];

  const testBadge = isTest ? " · Test" : "";
  const headerText = `${cfg.emoji} ${cfg.title}${testBadge}`;
  const fallbackText = `${cfg.emoji} *${probe}* — ${cfg.title}${testBadge} (${envLabel()})`;

  let bodyText: string;
  if (type === "throttled") {
    bodyText =
      `*${probe}* has triggered more than ${MAX_TRANSITIONS} ok→fail transitions within an hour.\n\n` +
      `Repeated checks could not confirm delivery. Check the dashboard and look into it.` +
      (resumesAt ? ` Alerts will resume after *${resumesAt}*.` : "");
  } else if (type === "recovered") {
    bodyText = `*${probe}* can confirm delivery again. Earlier unconfirmed events may still arrive; they have not been rechecked.`;
  } else {
    bodyText = data.message ?? cfg.defaultMessage;
  }

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Probe*\n${probe}` },
        { type: "mrkdwn", text: `*Environment*\n${envLabel()}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: bodyText },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${PROBE_UI_URL}|Open probe dashboard>`,
        },
      ],
    },
  ];

  return {
    text: fallbackText,
    attachments: [{ color: cfg.color, blocks }],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function slackAlertWarning(
  probe: string,
  warning: SoftWarning,
  current: { unconfirmed: number; runs: number },
  { isTest = false }: { isTest?: boolean } = {},
): Promise<boolean> {
  const detectedAt = new Date(warning.detectedAt).toLocaleString("en-GB", {
    timeZone: "Europe/Oslo",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const status = current.unconfirmed >= SOFT_UNCONFIRMED_THRESHOLD
    ? `The warning threshold is still met: ${current.unconfirmed} of the last ${current.runs} completed checks could not confirm delivery.`
    : `The warning threshold is no longer met: ${current.unconfirmed} of the last ${current.runs} completed checks could not confirm delivery.`;
  const message =
    `*${probe}*: ${warning.unconfirmed} of ${warning.runs} recent completed checks could not confirm delivery when this warning was detected (${detectedAt}, Europe/Oslo).\n\n` +
    (warning.observation ? `*Latest observation at detection*\n${warning.observation}\n\n` : "") +
    `${status}\n\n` +
    `Events not observed in BigQuery within the probe's verification window may still arrive later. ` +
    `This suggests possible QoS degradation, not confirmed event loss or an outage. Please check the pipeline during working hours.\n\n` +
    `Warnings trigger at ${SOFT_UNCONFIRMED_THRESHOLD} unconfirmed checks within the last ${SOFT_WINDOW_SIZE} completed probes and are delivered Mon–Fri, 09:00–16:30 Europe/Oslo.`;
  const sent = await postToSlack(buildAlertPayload({ type: "warning", probe, message, isTest }));
  if (sent) log({ event: "slack.warning_sent", probe, detected_at: warning.detectedAt });
  return sent;
}

export async function slackAlertFailing(
  probe: string,
  message: string,
  { bypassThrottle = false, isTest = false }: { bypassThrottle?: boolean; isTest?: boolean } = {},
): Promise<void> {
  const decision = bypassThrottle ? "send" : recordFailureTransition(probe);

  if (decision === "suppress") {
    log({ event: "slack.suppressed", probe, reason: "throttled" });
    return;
  }

  if (decision === "throttled") {
    const state = getThrottle(probe);
    state.throttleNoticeSent = true;
    const resumesAt = new Date(
      Date.now() + THROTTLE_WINDOW_MS,
    ).toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    });
    await postToSlack(buildAlertPayload({ type: "throttled", probe, resumesAt, isTest }));
    return;
  }

  await postToSlack(buildAlertPayload({ type: "failing", probe, message, isTest }));
}

export async function slackAlertRecovered(
  probe: string,
  { isTest = false }: { isTest?: boolean } = {},
): Promise<void> {
  recordRecovery(probe);
  await postToSlack(buildAlertPayload({ type: "recovered", probe, isTest }));
}

export async function slackAlertThrottled(
  probe: string,
  { isTest = false }: { isTest?: boolean } = {},
): Promise<void> {
  const resumesAt = new Date(
    Date.now() + THROTTLE_WINDOW_MS,
  ).toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
  await postToSlack(buildAlertPayload({ type: "throttled", probe, resumesAt, isTest }));
}
