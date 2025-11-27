import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger.ts";
import type { ProbeData } from "../probe/injector.ts";

export interface AlertContext {
  probe: ProbeData;
  failedSince: number;
  acknowledged: boolean;
  escalated: boolean;
}

export class SlackAlerter {
  private client: WebClient;

  constructor(
    botToken: string,
    private primaryChannel: string,
    private escalationChannel: string,
  ) {
    this.client = new WebClient(botToken);
  }

  /**
   * Send initial alert to primary channel
   */
  async sendInitialAlert(context: AlertContext): Promise<string> {
    const elapsed = Date.now() - context.failedSince;
    const elapsedMin = Math.floor(elapsed / 60000);

    logger.info("Sending initial alert", {
      probeId: context.probe.id,
      elapsedMin,
    });

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Data Pipeline Health Check Failed",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Umami → BigQuery data pipeline is not working*\n\nProbe ID: \`${context.probe.id}\`\nFailed for: *${elapsedMin} minutes*`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "👍 Jobber med saken",
            },
            action_id: "acknowledge_alert",
            value: context.probe.id,
            style: "primary",
          },
        ],
      },
    ];

    try {
      const response = await this.client.chat.postMessage({
        channel: this.primaryChannel,
        text: "Data Pipeline Health Check Failed",
        blocks,
      });

      const ts = response.ts as string;
      logger.info("Alert sent successfully", { ts });
      return ts;
    } catch (error) {
      logger.error("Error sending Slack alert", error);
      throw error;
    }
  }

  /**
   * Update existing alert with repeat notification
   */
  async updateAlert(messageTs: string, context: AlertContext): Promise<void> {
    const elapsed = Date.now() - context.failedSince;
    const elapsedMin = Math.floor(elapsed / 60000);

    logger.info("Updating alert", {
      probeId: context.probe.id,
      elapsedMin,
      acknowledged: context.acknowledged,
    });

    const statusText = context.acknowledged
      ? "✅ *Acknowledged* - Someone is working on this"
      : "⚠️ *Not acknowledged* - Nobody is working on this";

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Data Pipeline Health Check Failed",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Umami → BigQuery data pipeline is not working*\n\nProbe ID: \`${context.probe.id}\`\nFailed for: *${elapsedMin} minutes*\n\n${statusText}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: context.acknowledged
                ? "✓ Acknowledged"
                : "👍 Jobber med saken",
            },
            action_id: "acknowledge_alert",
            value: context.probe.id,
            style: context.acknowledged ? undefined : "primary",
          },
        ],
      },
    ];

    try {
      await this.client.chat.update({
        channel: this.primaryChannel,
        ts: messageTs,
        text: "Data Pipeline Health Check Failed",
        blocks,
      });
      logger.info("Alert updated successfully");
    } catch (error) {
      logger.error("Error updating Slack alert", error);
      throw error;
    }
  }

  /**
   * Escalate alert to escalation channel
   */
  async escalateAlert(context: AlertContext): Promise<void> {
    const elapsed = Date.now() - context.failedSince;
    const elapsedMin = Math.floor(elapsed / 60000);

    logger.info("Escalating alert", {
      probeId: context.probe.id,
      elapsedMin,
    });

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 ESCALATED: Data Pipeline Health Check Failed",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Umami → BigQuery data pipeline is still not working*\n\nProbe ID: \`${context.probe.id}\`\nFailed for: *${elapsedMin} minutes*\n\n⚠️ *This alert was not acknowledged within 60 minutes*\n\nOriginal alert: ${this.primaryChannel}`,
        },
      },
    ];

    try {
      await this.client.chat.postMessage({
        channel: this.escalationChannel,
        text: "ESCALATED: Data Pipeline Health Check Failed",
        blocks,
      });
      logger.info("Alert escalated successfully");
    } catch (error) {
      logger.error("Error escalating Slack alert", error);
      throw error;
    }
  }

  /**
   * Send recovery notification
   */
  async sendRecoveryAlert(
    messageTs: string | undefined,
    context: AlertContext,
  ): Promise<void> {
    const elapsed = Date.now() - context.failedSince;
    const elapsedMin = Math.floor(elapsed / 60000);

    logger.info("Sending recovery alert", {
      probeId: context.probe.id,
      elapsedMin,
    });

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ Data Pipeline Recovered",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Umami → BigQuery data pipeline is working again*\n\nProbe ID: \`${context.probe.id}\`\nWas down for: *${elapsedMin} minutes*`,
        },
      },
    ];

    try {
      if (messageTs) {
        await this.client.chat.update({
          channel: this.primaryChannel,
          ts: messageTs,
          text: "Data Pipeline Recovered",
          blocks,
        });
      } else {
        await this.client.chat.postMessage({
          channel: this.primaryChannel,
          text: "Data Pipeline Recovered",
          blocks,
        });
      }
      logger.info("Recovery alert sent successfully");
    } catch (error) {
      logger.error("Error sending recovery alert", error);
      throw error;
    }
  }
}
