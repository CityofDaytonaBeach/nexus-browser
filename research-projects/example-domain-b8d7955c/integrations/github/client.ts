export interface GithubConfig {
  githubClientId?: string;
  githubClientSecret?: string;
  githubToken?: string;
  githubWebhookSecret?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubProjectId?: string;
}

export function createGithubIntegration(config: GithubConfig = {}) {
  return {
    name: 'github',
    category: 'developer-platform',
    features: [
    "oauth",
    "repo-create",
    "issues",
    "projects",
    "project-task-sync",
    "pull-requests",
    "actions",
    "release-automation"
],
    config,
  };
}
