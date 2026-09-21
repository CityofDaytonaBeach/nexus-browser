export interface StripeConfig {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceId?: string;
  nextPublicStripePublishableKey?: string;
}

export function createStripeIntegration(config: StripeConfig = {}) {
  return {
    name: 'stripe',
    category: 'payments',
    features: [
    "checkout",
    "subscriptions",
    "customer-portal",
    "webhooks",
    "pricing-table",
    "invoices"
],
    config,
  };
}
