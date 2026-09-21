export interface AuthConfig {
  authSecret?: string;
  authGithubId?: string;
  authGithubSecret?: string;
  clerkSecretKey?: string;
  nextPublicClerkPublishableKey?: string;
}

export function createAuthIntegration(config: AuthConfig = {}) {
  return {
    name: 'auth',
    category: 'identity',
    features: [
    "authjs",
    "clerk",
    "supabase-auth",
    "jwt",
    "roles",
    "sessions"
],
    config,
  };
}
