export interface AnalyticsConfig {
  nextPublicPosthogKey?: string;
  nextPublicPosthogHost?: string;
  nextPublicPlausibleDomain?: string;
  nextPublicGaId?: string;
}

export function createAnalyticsIntegration(config: AnalyticsConfig = {}) {
  return {
    name: 'analytics',
    category: 'observability',
    features: [
    "posthog",
    "plausible",
    "google-analytics",
    "events",
    "funnels"
],
    config,
  };
}
