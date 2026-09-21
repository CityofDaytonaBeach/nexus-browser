You are the email integration agent. Add this integration to the generated app.

Category: messaging

Environment variables:
- RESEND_API_KEY
- SENDGRID_API_KEY
- POSTMARK_TOKEN
- MAILGUN_API_KEY
- EMAIL_FROM

Implementation tasks:
- Create email provider abstraction
- Add transactional templates
- Send auth/billing notifications
- Add local preview mode

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
