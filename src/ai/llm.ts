import { config } from '../core/config';
import { createLogger } from '../core/logger';

const log = createLogger('LLM');

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class LLMClient {
  private provider: string;
  private log = createLogger('LLM');

  constructor() {
    this.provider = config.get().ai.provider;
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMTool[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ content?: string; toolCalls?: LLMToolCall[] }> {
    if (this.provider === 'openai') {
      return this.chatOpenAI(messages, tools, options);
    } else if (this.provider === 'anthropic') {
      return this.chatAnthropic(messages, tools, options);
    } else {
      throw new Error(`Provider ${this.provider} not implemented. Use openai or anthropic.`);
    }
  }

  private async chatOpenAI(
    messages: LLMMessage[],
    tools?: LLMTool[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ content?: string; toolCalls?: LLMToolCall[] }> {
    const cfg = config.get().ai;
    if (!cfg.openaiApiKey) throw new Error('OPENAI_API_KEY not configured');

    const body: any = {
      model: cfg.openaiModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.openaiApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];

    if (choice?.message?.tool_calls?.length) {
      return {
        toolCalls: choice.message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      };
    }

    return { content: choice?.message?.content || '' };
  }

  private async chatAnthropic(
    messages: LLMMessage[],
    tools?: LLMTool[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ content?: string; toolCalls?: LLMToolCall[] }> {
    const cfg = config.get().ai;
    if (!cfg.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    const body: any = {
      model: cfg.anthropicModel,
      max_tokens: options?.maxTokens || 4096,
      messages: nonSystem,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data: any = await response.json();
    const block = data.content?.find((b: any) => b.type === 'text');

    const toolBlocks = data.content?.filter((b: any) => b.type === 'tool_use') || [];
    if (toolBlocks.length > 0) {
      return {
        toolCalls: toolBlocks.map((tb: any) => ({
          id: tb.id,
          name: tb.name,
          arguments: JSON.stringify(tb.input),
        })),
      };
    }

    return { content: block?.text || '' };
  }

  async summarize(text: string, maxLength: number = 500): Promise<string> {
    const result = await this.chat([
      { role: 'system', content: 'You are a text summarizer. Be concise and accurate.' },
      { role: 'user', content: `Summarize the following in under ${maxLength} chars:\n\n${text}` },
    ]);
    return result.content || '';
  }

  async extractData(text: string, schema: string): Promise<any> {
    const result = await this.chat([
      { role: 'system', content: `Extract structured data from the text matching this schema: ${schema}. Return valid JSON.` },
      { role: 'user', content: text },
    ]);
    try {
      return JSON.parse(result.content || '{}');
    } catch {
      return { raw: result.content };
    }
  }
}

export const llm = new LLMClient();
