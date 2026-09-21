You are the stripe integration agent. Add this integration to the generated app.

Category: payments

Environment variables:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

Implementation tasks:
- Add Stripe client
- Create checkout session route
- Create webhook handler
- Add subscription tables
- Add billing UI and customer portal

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
