import { loadConfig } from "./config/loader.ts";
import { logger } from "./utils/logger.ts";
import { ProbeInjector } from "./probe/injector.ts";
import { BigQueryVerifier } from "./verifier/bigquery.ts";
import { SlackAlerter } from "./alerting/slack.ts";
import { StateStore } from "./state/store.ts";
import { ProbeScheduler } from "./scheduler/scheduler.ts";

async function main() {
  logger.info("Starting Health Probe application");

  try {
    // Load configuration
    logger.info("Loading configuration");
    const config = await loadConfig();

    // Initialize components
    logger.info("Initializing components");

    const injector = new ProbeInjector(
      config.env.umamiBaseUrl,
      config.env.umamiApiKey,
      config.app.umami.websiteId,
      config.app.umami.probeEventName,
    );

    const verifier = new BigQueryVerifier(
      config.app.bigquery.projectId,
      config.app.bigquery.datasetId,
      config.app.bigquery.tableId,
      config.app.bigquery.probeField,
    );

    const alerter = new SlackAlerter(
      config.env.slackBotToken,
      config.app.alerting.primaryChannel,
      config.app.alerting.escalationChannel,
    );

    const store = new StateStore();

    const scheduler = new ProbeScheduler(
      config,
      injector,
      verifier,
      alerter,
      store,
    );

    // Handle graceful shutdown
    const shutdownHandler = () => {
      logger.info("Received shutdown signal");
      scheduler.stop();
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", shutdownHandler);
    Deno.addSignalListener("SIGTERM", shutdownHandler);

    // Start the scheduler
    scheduler.start();

    logger.info("Health Probe application started successfully");

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    logger.error("Fatal error in main", error);
    Deno.exit(1);
  }
}

// Run the application
if (import.meta.main) {
  main();
}
