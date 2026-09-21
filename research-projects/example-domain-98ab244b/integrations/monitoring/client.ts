export interface MonitoringConfig {
  sentryDsn?: string;
  logLevel?: string;
  uptimeWebhookUrl?: string;
}

export function createMonitoringIntegration(config: MonitoringConfig = {}) {
  return {
    name: 'monitoring',
    category: 'observability',
    features: [
    "sentry",
    "logs",
    "health-checks",
    "uptime",
    "audit-log"
],
    config,
  };
}
