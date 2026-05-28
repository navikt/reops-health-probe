import { log, logError } from "./log.ts";

const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";
const environment = Deno.env.get("ENVIRONMENT") ?? "unknown";
const PROBE_UI_URL = "https://reops-health-probe.intern.dev.nav.no/";

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

  // Prune old timestamps outside the window
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

function envEmoji(): string {
  const e = environment.toLowerCase();
  if (e === "prod" || e === "production") return "🔴";
  if (e === "dev" || e === "development") return "🟡";
  return "⚪";
}

function envLabel(): string {
  const e = environment.toLowerCase();
  if (e === "prod" || e === "production") return "PROD";
  if (e === "dev" || e === "development") return "DEV";
  return environment.toUpperCase();
}

async function postToSlack(payload: unknown): Promise<void> {
  if (!webhookUrl) {
    log({ event: "slack.skipped", reason: "SLACK_WEBHOOK_URL not set" });
    return;
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
    }
  } catch (err) {
    logError({
      event: "slack.error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function slackAlertFailing(
  probe: string,
  message: string,
): Promise<void> {
  const decision = recordFailureTransition(probe);

  if (decision === "suppress") {
    log({ event: "slack.suppressed", probe, reason: "throttled" });
    return;
  }

  if (decision === "throttled") {
    getThrottle(probe).throttleNoticeSent = true;
    const nextAlertAt = new Date(
      Date.now() + THROTTLE_WINDOW_MS,
    ).toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    });
    await postToSlack({
      text: `⏸️ Alert throttled for *${probe}* (${envLabel()}) — too many transitions in 1 hour`,
      attachments: [
        {
          color: "warning",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `⏸️ *Alert throttled* — *${probe}* has triggered more than ${MAX_TRANSITIONS} ok→fail transitions within an hour.\n\nWe know it's failing. Check the dashboard and look into it. Alerts will resume after *${nextAlertAt}*.`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `${envEmoji()} *${envLabel()}* environment  ·  <${PROBE_UI_URL}|See probe dashboard & pause if needed>`,
                },
              ],
            },
          ],
        },
      ],
    });
    return;
  }

  // Normal failure alert
  await postToSlack({
    text: `🔴 *${probe}* probe failing (${envLabel()})`,
    attachments: [
      {
        color: "danger",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🔴 Health probe failing`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Probe*\n${probe}`,
              },
              {
                type: "mrkdwn",
                text: `*Environment*\n${envEmoji()} ${envLabel()}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error*\n${message}`,
            },
          },
          {
            type: "divider",
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<${PROBE_UI_URL}|See probe details & pause health check>`,
              },
            ],
          },
        ],
      },
    ],
  });
}

export async function slackAlertRecovered(probe: string): Promise<void> {
  recordRecovery(probe);
  await postToSlack({
    text: `✅ *${probe}* probe recovered (${envLabel()})`,
    attachments: [
      {
        color: "good",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `✅ Health probe recovered`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Probe*\n${probe}`,
              },
              {
                type: "mrkdwn",
                text: `*Environment*\n${envEmoji()} ${envLabel()}`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<${PROBE_UI_URL}|View probe dashboard>`,
              },
            ],
          },
        ],
      },
    ],
  });
}
