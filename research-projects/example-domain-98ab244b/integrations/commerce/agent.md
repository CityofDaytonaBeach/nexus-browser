You are the commerce integration agent. Add this integration to the generated app.

Category: commerce

Environment variables:
- SHOPIFY_ADMIN_TOKEN
- SHOPIFY_STORE_DOMAIN
- LEMONSQUEEZY_API_KEY
- PADDLE_API_KEY

Implementation tasks:
- Create commerce provider abstraction
- Add products/prices/licenses
- Add webhook processing
- Support Stripe as default billing path

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
