import { logger } from "../utils/logger.ts";
import { parseTime, sleep } from "../utils/time.ts";
import type { ProbeInjector } from "../probe/injector.ts";
import type { BigQueryVerifier } from "../verifier/bigquery.ts";
import type { SlackAlerter } from "../alerting/slack.ts";
import type { StateStore } from "../state/store.ts";
import type { Config } from "../config/types.ts";

export class ProbeScheduler {
  private running = false;
  private probeIntervalId?: number;

  constructor(
    private config: Config,
    private injector: ProbeInjector,
    private verifier: BigQueryVerifier,
    private alerter: SlackAlerter,
    private store: StateStore,
  ) {}

  /**
   * Start the probe scheduler
   */
  start(): void {
    if (this.running) {
      logger.warn("Scheduler is already running");
      return;
    }

    this.running = true;
    const intervalMs = parseTime(this.config.app.probe.interval);

    logger.info("Starting probe scheduler", {
      interval: this.config.app.probe.interval,
    });

    // Run first probe immediately
    this.runProbe();

    // Schedule subsequent probes
    this.probeIntervalId = setInterval(() => {
      this.runProbe();
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    logger.info("Stopping probe scheduler");
    this.running = false;

    if (this.probeIntervalId) {
      clearInterval(this.probeIntervalId);
      this.probeIntervalId = undefined;
    }
  }

  /**
   * Run a single probe cycle
   */
  private async runProbe(): Promise<void> {
    logger.info("Starting probe cycle");

    try {
      // 1. Inject probe into Umami
      const probe = await this.injector.injectProbe();

      // 2. Wait initial delay before checking
      const initialDelayMs = parseTime(this.config.app.probe.initialDelay);
      logger.info("Waiting before checking BigQuery", {
        delay: this.config.app.probe.initialDelay,
      });
      await sleep(initialDelayMs);

      // 3. Check BigQuery repeatedly
      const checkIntervalMs = parseTime(this.config.app.probe.checkInterval);
      const maxWaitMs = parseTime(this.config.app.probe.maxWaitTime);
      const startTime = Date.now();

      let found = false;
      let attempts = 0;

      while (Date.now() - startTime < maxWaitMs) {
        attempts++;
        logger.info("Checking BigQuery", { attempt: attempts });

        found = await this.verifier.verifyProbe(probe);

        if (found) {
          logger.info("Probe found in BigQuery", { attempts });
          break;
        }

        await sleep(checkIntervalMs);
      }

      // 4. Handle result
      if (found) {
        await this.handleSuccess(probe);
      } else {
        await this.handleFailure(probe);
      }
    } catch (error) {
      logger.error("Error in probe cycle", error);
      // Continue running despite errors
    }
  }

  /**
   * Handle successful probe verification
   */
  private async handleSuccess(_probe: { id: string; timestamp: number }): Promise<void> {
    logger.info("Probe cycle succeeded");

    const currentState = this.store.getCurrentProbe();

    // If there was a previous failure, send recovery alert
    if (currentState) {
      await this.alerter.sendRecoveryAlert(currentState.lastAlertTs, {
        probe: currentState.probe,
        failedSince: currentState.failedSince,
        acknowledged: currentState.acknowledged,
        escalated: currentState.escalated,
      });

      this.store.clearProbe();
    }
  }

  /**
   * Handle failed probe verification
   */
  private async handleFailure(probe: { id: string; timestamp: number }): Promise<void> {
    logger.warn("Probe cycle failed");

    // Update or create failure state
    this.store.setFailingProbe(probe);
    const state = this.store.getCurrentProbe();

    if (!state) {
      logger.error("Failed to get current probe state");
      return;
    }

    // Check if we should send/update alert
    const repeatIntervalMs = parseTime(this.config.app.alerting.repeatInterval);
    if (this.store.shouldSendAlert(repeatIntervalMs)) {
      if (!state.lastAlertTs) {
        // Send initial alert
        const ts = await this.alerter.sendInitialAlert({
          probe: state.probe,
          failedSince: state.failedSince,
          acknowledged: state.acknowledged,
          escalated: state.escalated,
        });
        this.store.setAlertTimestamp(ts);
      } else {
        // Update existing alert
        await this.alerter.updateAlert(state.lastAlertTs, {
          probe: state.probe,
          failedSince: state.failedSince,
          acknowledged: state.acknowledged,
          escalated: state.escalated,
        });
        this.store.setAlertTimestamp(state.lastAlertTs);
      }
    }

    // Check if we should escalate
    const escalationDelayMs = parseTime(this.config.app.alerting.escalationDelay);
    if (this.store.shouldEscalate(escalationDelayMs)) {
      await this.alerter.escalateAlert({
        probe: state.probe,
        failedSince: state.failedSince,
        acknowledged: state.acknowledged,
        escalated: state.escalated,
      });
      this.store.escalateProbe();
    }
  }
}
