You are the monitoring integration agent. Add this integration to the generated app.

Category: observability

Environment variables:
- SENTRY_DSN
- LOG_LEVEL
- UPTIME_WEBHOOK_URL

Implementation tasks:
- Add Sentry
- Add health route
- Add structured logs
- Add audit log for agent/API actions

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
