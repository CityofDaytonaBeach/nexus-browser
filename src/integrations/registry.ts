export interface IntegrationProfile {
  name: string;
  category: string;
  features: string[];
  env: string[];
  files: string[];
  tasks: string[];
}

export interface IntegrationArtifact {
  profile: IntegrationProfile;
  files: Record<string, string>;
}

const profiles: IntegrationProfile[] = [
  {
    name: 'github',
    category: 'developer-platform',
    features: ['oauth', 'repo-create', 'issues', 'projects', 'project-task-sync', 'pull-requests', 'actions', 'release-automation'],
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_TOKEN', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_PROJECT_ID'],
    files: ['github/env.example', 'github/tasks.md', 'github/client.ts', 'github/actions.yml', 'github/oauth-route.ts'],
    tasks: ['Add GitHub OAuth', 'Create repo automation', 'Connect GitHub Projects', 'Create issues from build tasks', 'Sync Nexus build tasks to project issues', 'Generate GitHub Actions CI', 'Support PR creation after OpenCode changes'],
  },
  {
    name: 'stripe',
    category: 'payments',
    features: ['checkout', 'subscriptions', 'customer-portal', 'webhooks', 'pricing-table', 'invoices'],
    env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    files: ['stripe/env.example', 'stripe/tasks.md', 'stripe/schema.prisma', 'stripe/checkout-route.ts', 'stripe/webhook-route.ts', 'stripe/billing-page.tsx'],
    tasks: ['Add Stripe client', 'Create checkout session route', 'Create webhook handler', 'Add subscription tables', 'Add billing UI and customer portal'],
  },
  {
    name: 'auth',
    category: 'identity',
    features: ['authjs', 'clerk', 'supabase-auth', 'jwt', 'roles', 'sessions'],
    env: ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
    files: ['auth/env.example', 'auth/tasks.md', 'auth/auth-config.ts', 'auth/schema.prisma', 'auth/middleware.ts'],
    tasks: ['Select Auth.js, Clerk, or Supabase Auth', 'Add user/session models', 'Protect app routes', 'Add roles and permissions', 'Add login/logout UI'],
  },
  {
    name: 'database',
    category: 'data',
    features: ['sqlite-local', 'postgres', 'supabase', 'neon', 'turso', 'prisma', 'drizzle', 'migrations'],
    env: ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    files: ['database/env.example', 'database/tasks.md', 'database/schema.prisma', 'database/drizzle-schema.ts', 'database/migration.sql'],
    tasks: ['Start with SQLite local mode', 'Add Prisma or Drizzle', 'Generate migrations', 'Seed from discovered API samples', 'Add sync jobs for API-backed data'],
  },
  {
    name: 'email',
    category: 'messaging',
    features: ['resend', 'sendgrid', 'postmark', 'mailgun', 'transactional-email', 'templates'],
    env: ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'POSTMARK_TOKEN', 'MAILGUN_API_KEY', 'EMAIL_FROM'],
    files: ['email/env.example', 'email/tasks.md', 'email/client.ts', 'email/templates.tsx'],
    tasks: ['Create email provider abstraction', 'Add transactional templates', 'Send auth/billing notifications', 'Add local preview mode'],
  },
  {
    name: 'storage',
    category: 'files',
    features: ['s3', 'cloudflare-r2', 'supabase-storage', 'firebase-storage', 'signed-uploads'],
    env: ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET'],
    files: ['storage/env.example', 'storage/tasks.md', 'storage/client.ts', 'storage/upload-route.ts'],
    tasks: ['Create storage abstraction', 'Add signed uploads', 'Add asset manifest support', 'Support local filesystem fallback'],
  },
  {
    name: 'ai',
    category: 'ai',
    features: ['openai', 'anthropic', 'gemini', 'ollama', 'rag', 'embeddings', 'agent-tools'],
    env: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OLLAMA_BASE_URL', 'VECTOR_DATABASE_URL'],
    files: ['ai/env.example', 'ai/tasks.md', 'ai/client.ts', 'ai/rag.ts', 'ai/tools.ts'],
    tasks: ['Create model provider abstraction', 'Add embeddings/RAG support', 'Expose app actions as AI tools', 'Support local Ollama fallback'],
  },
  {
    name: 'analytics',
    category: 'observability',
    features: ['posthog', 'plausible', 'google-analytics', 'events', 'funnels'],
    env: ['NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST', 'NEXT_PUBLIC_PLAUSIBLE_DOMAIN', 'NEXT_PUBLIC_GA_ID'],
    files: ['analytics/env.example', 'analytics/tasks.md', 'analytics/client.ts', 'analytics/provider.tsx'],
    tasks: ['Add privacy-aware analytics', 'Track product events', 'Add funnel events for generated app flows', 'Document opt-out behavior'],
  },
  {
    name: 'deployment',
    category: 'platform',
    features: ['vercel', 'netlify', 'cloudflare-workers', 'railway', 'render', 'docker'],
    env: ['VERCEL_TOKEN', 'CLOUDFLARE_API_TOKEN', 'RAILWAY_TOKEN', 'RENDER_API_KEY'],
    files: ['deployment/env.example', 'deployment/tasks.md', 'deployment/Dockerfile', 'deployment/vercel.json', 'deployment/railway.json'],
    tasks: ['Generate deployment config', 'Add Dockerfile', 'Add CI deploy workflow', 'Document environment variables per platform'],
  },
  {
    name: 'commerce',
    category: 'commerce',
    features: ['shopify', 'lemonsqueezy', 'paddle', 'products', 'licenses'],
    env: ['SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_STORE_DOMAIN', 'LEMONSQUEEZY_API_KEY', 'PADDLE_API_KEY'],
    files: ['commerce/env.example', 'commerce/tasks.md', 'commerce/client.ts', 'commerce/products-route.ts'],
    tasks: ['Create commerce provider abstraction', 'Add products/prices/licenses', 'Add webhook processing', 'Support Stripe as default billing path'],
  },
  {
    name: 'monitoring',
    category: 'observability',
    features: ['sentry', 'logs', 'health-checks', 'uptime', 'audit-log'],
    env: ['SENTRY_DSN', 'LOG_LEVEL', 'UPTIME_WEBHOOK_URL'],
    files: ['monitoring/env.example', 'monitoring/tasks.md', 'monitoring/sentry.ts', 'monitoring/health-route.ts'],
    tasks: ['Add Sentry', 'Add health route', 'Add structured logs', 'Add audit log for agent/API actions'],
  },
];

export function getAllIntegrationProfiles(): IntegrationProfile[] {
  return profiles;
}

export function buildIntegrationArtifacts(selected: string[] = profiles.map((profile) => profile.name)): Record<string, IntegrationArtifact> {
  const selectedSet = new Set(selected);
  return Object.fromEntries(profiles.filter((profile) => selectedSet.has(profile.name)).map((profile) => [profile.name, {
    profile,
    files: buildFiles(profile),
  }]));
}

function buildFiles(profile: IntegrationProfile): Record<string, string> {
  const env = profile.env.map((key) => `${key}=`).join('\n');
  return {
    'integration.json': JSON.stringify(profile, null, 2),
    'env.example': `${env}\n`,
    'tasks.md': `# ${profile.name} Integration\n\nCategory: ${profile.category}\n\n## Features\n${profile.features.map((feature) => `- ${feature}`).join('\n')}\n\n## Tasks\n${profile.tasks.map((task) => `- ${task}`).join('\n')}\n\n## Rules\n- Keep secrets in environment variables.\n- Add tests or local mocks before calling live services.\n- Document setup steps in the generated app README.\n`,
    'client.ts': buildTypeScriptClient(profile),
    'agent.md': buildAgentPrompt(profile),
  };
}

function buildTypeScriptClient(profile: IntegrationProfile): string {
  return `export interface ${pascal(profile.name)}Config {\n${profile.env.map((key) => `  ${camel(key)}?: string;`).join('\n')}\n}\n\nexport function create${pascal(profile.name)}Integration(config: ${pascal(profile.name)}Config = {}) {\n  return {\n    name: '${profile.name}',\n    category: '${profile.category}',\n    features: ${JSON.stringify(profile.features, null, 4)},\n    config,\n  };\n}\n`;
}

function buildAgentPrompt(profile: IntegrationProfile): string {
  return `You are the ${profile.name} integration agent. Add this integration to the generated app.\n\nCategory: ${profile.category}\n\nEnvironment variables:\n${profile.env.map((key) => `- ${key}`).join('\n')}\n\nImplementation tasks:\n${profile.tasks.map((task) => `- ${task}`).join('\n')}\n\nUse production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.\n`;
}

function pascal(value: string): string {
  return value.split(/[^a-z0-9]+/i).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('');
}

function camel(value: string): string {
  const next = pascal(value);
  return next.charAt(0).toLowerCase() + next.slice(1);
}
