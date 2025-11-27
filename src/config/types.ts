export interface ProbeConfig {
  interval: string;
  initialDelay: string;
  checkInterval: string;
  maxWaitTime: string;
}

export interface AlertingConfig {
  repeatInterval: string;
  escalationDelay: string;
  primaryChannel: string;
  escalationChannel: string;
}

export interface UmamiConfig {
  trackingUrl: string;
  websiteId: string;
  probeEventName: string;
}

export interface BigQueryConfig {
  projectId: string;
  datasetId: string;
  tableId: string;
  probeField: string;
}

export interface AppConfig {
  probe: ProbeConfig;
  alerting: AlertingConfig;
  umami: UmamiConfig;
  bigquery: BigQueryConfig;
}

export interface EnvConfig {
  umamiBaseUrl: string;
  umamiApiKey: string;
  slackBotToken: string;
  slackSigningSecret: string;
  googleCloudProject: string;
  gcpServiceAccount: string;
}

export interface Config {
  app: AppConfig;
  env: EnvConfig;
}
