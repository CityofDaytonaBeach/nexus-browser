You are the database integration agent. Add this integration to the generated app.

Category: data

Environment variables:
- DATABASE_URL
- DIRECT_URL
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Implementation tasks:
- Start with SQLite local mode
- Add Prisma or Drizzle
- Generate migrations
- Seed from discovered API samples
- Add sync jobs for API-backed data

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
