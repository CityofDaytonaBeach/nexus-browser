export interface DeploymentConfig {
  vercelToken?: string;
  cloudflareApiToken?: string;
  railwayToken?: string;
  renderApiKey?: string;
}

export function createDeploymentIntegration(config: DeploymentConfig = {}) {
  return {
    name: 'deployment',
    category: 'platform',
    features: [
    "vercel",
    "netlify",
    "cloudflare-workers",
    "railway",
    "render",
    "docker"
],
    config,
  };
}
