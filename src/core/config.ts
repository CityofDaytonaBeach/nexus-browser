import { EventEmitter } from 'events';
import * as path from 'path';

export interface NexusConfig {
  server: {
    port: number;
    wsPort: number;
    host: string;
    corsOrigin: string;
  };
  auth: {
    jwtSecret: string;
    apiKey: string;
  };
  ai: {
    openaiApiKey: string;
    openaiModel: string;
    anthropicApiKey: string;
    anthropicModel: string;
    provider: 'openai' | 'anthropic' | 'local';
  };
  codeExecution: {
    mode: 'local' | 'remote' | 'custom';
    localCli: string;
    localArgs: string[];
    remoteUrl: string;
    remoteApiKey: string;
    remoteKind: 'opencode' | 'codex' | 'custom';
    ollamaBaseUrl: string;
    ollamaModel: string;
  };
  browser: {
    headless: boolean;
    slowMo: number;
    viewportWidth: number;
    viewportHeight: number;
    userDataDir: string;
    proxy?: { server: string; username?: string; password?: string };
  };
  cloud: {
    enabled: boolean;
    maxSessions: number;
    maxPagesPerSession: number;
  };
  ide: {
    port: number;
    enabled: boolean;
  };
  logging: {
    level: string;
  };
}

const defaults: NexusConfig = {
  server: { port: 3000, wsPort: 3001, host: '0.0.0.0', corsOrigin: '*' },
  auth: { jwtSecret: 'nexus-dev-secret', apiKey: 'nexus-dev-key' },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    provider: (process.env.LLM_PROVIDER as any) || 'openai',
  },
  codeExecution: {
    mode: (process.env.CODE_EXECUTION_MODE as any) || 'local',
    localCli: process.env.CODE_EXECUTION_LOCAL_CLI || process.env.OPENCODE_CLI || 'opencode',
    localArgs: (process.env.CODE_EXECUTION_LOCAL_ARGS || 'run').split(/\s+/).filter(Boolean),
    remoteUrl: process.env.CODE_EXECUTION_REMOTE_URL || '',
    remoteApiKey: process.env.CODE_EXECUTION_REMOTE_API_KEY || '',
    remoteKind: (process.env.CODE_EXECUTION_REMOTE_KIND as any) || 'opencode',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder',
  },
  browser: {
    headless: process.env.BROWSER_HEADLESS === 'true',
    slowMo: parseInt(process.env.BROWSER_SLOW_MO || '0'),
    viewportWidth: parseInt(process.env.BROWSER_VIEWPORT_WIDTH || '1920'),
    viewportHeight: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT || '1080'),
    userDataDir: process.env.USER_DATA_DIR || './profiles',
  },
  cloud: {
    enabled: process.env.CLOUD_MODE === 'true',
    maxSessions: parseInt(process.env.MAX_SESSIONS || '10'),
    maxPagesPerSession: parseInt(process.env.MAX_PAGES_PER_SESSION || '20'),
  },
  ide: {
    port: parseInt(process.env.IDE_PORT || '3002'),
    enabled: process.env.ENABLE_IDE !== 'false',
  },
  logging: { level: process.env.LOG_LEVEL || 'info' },
};

class ConfigManager extends EventEmitter {
  private config: NexusConfig;
  private static instance: ConfigManager;

  private constructor() {
    super();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): NexusConfig {
    const config = { ...defaults };
    try {
      const envConfig = require(path.join(process.cwd(), 'config', 'default.json'));
      return this.mergeDeep(config, envConfig);
    } catch {
      return config;
    }
  }

  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.mergeDeep(output[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  get(): NexusConfig {
    return this.config;
  }

  update(partial: Partial<NexusConfig>): void {
    this.config = this.mergeDeep(this.config, partial);
    this.emit('changed', this.config);
  }
}

export const config = ConfigManager.getInstance();
