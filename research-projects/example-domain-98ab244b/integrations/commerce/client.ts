export interface CommerceConfig {
  shopifyAdminToken?: string;
  shopifyStoreDomain?: string;
  lemonsqueezyApiKey?: string;
  paddleApiKey?: string;
}

export function createCommerceIntegration(config: CommerceConfig = {}) {
  return {
    name: 'commerce',
    category: 'commerce',
    features: [
    "shopify",
    "lemonsqueezy",
    "paddle",
    "products",
    "licenses"
],
    config,
  };
}
