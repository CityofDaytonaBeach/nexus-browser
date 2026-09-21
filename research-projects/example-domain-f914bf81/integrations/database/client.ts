export interface DatabaseConfig {
  databaseUrl?: string;
  directUrl?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

export function createDatabaseIntegration(config: DatabaseConfig = {}) {
  return {
    name: 'database',
    category: 'data',
    features: [
    "sqlite-local",
    "postgres",
    "supabase",
    "neon",
    "turso",
    "prisma",
    "drizzle",
    "migrations"
],
    config,
  };
}
