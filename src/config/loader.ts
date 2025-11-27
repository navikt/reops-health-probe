import { load } from "@std/dotenv";
import type { AppConfig, Config, EnvConfig } from "./types.ts";

export async function loadConfig(): Promise<Config> {
  // Load .env file
  await load({ export: true });

  // Load config.json
  const configPath = new URL("../../config.json", import.meta.url);
  const configText = await Deno.readTextFile(configPath);
  const appConfig: AppConfig = JSON.parse(configText);

  // Load environment variables
  const envConfig: EnvConfig = {
    umamiBaseUrl: getEnv("UMAMI_BASE_URL"),
    umamiApiKey: getEnv("UMAMI_API_KEY"),
    slackBotToken: getEnv("SLACK_BOT_TOKEN"),
    slackSigningSecret: getEnv("SLACK_SIGNING_SECRET"),
    googleCloudProject: getEnv("GOOGLE_CLOUD_PROJECT"),
    gcpServiceAccount: getEnv("GCP_SERVICE_ACCOUNT"),
  };

  return {
    app: appConfig,
    env: envConfig,
  };
}

function getEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
