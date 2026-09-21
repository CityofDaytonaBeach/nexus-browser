export interface AiConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  vectorDatabaseUrl?: string;
}

export function createAiIntegration(config: AiConfig = {}) {
  return {
    name: 'ai',
    category: 'ai',
    features: [
    "openai",
    "anthropic",
    "gemini",
    "ollama",
    "rag",
    "embeddings",
    "agent-tools"
],
    config,
  };
}
