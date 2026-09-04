import { LLMClient, LLMMessage, LLMTool } from '../ai/llm';
import { BrowserEngine } from '../browser/engine';
import { createLogger } from '../core/logger';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

const log = createLogger('Agent');

export interface AgentTask {
  id: string;
  goal: string;
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  steps: AgentStep[];
  currentStep: number;
  result?: string;
  error?: string;
  sessionId: string;
  pageId: string;
  createdAt: number;
  completedAt?: number;
}

export interface AgentStep {
  id: string;
  description: string;
  action: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface AgentMemory {
  id: string;
  sessionId: string;
  entries: MemoryEntry[];
}

export interface MemoryEntry {
  type: 'observation' | 'action' | 'reflection' | 'plan';
  content: string;
  timestamp: number;
  pageUrl?: string;
}

const AGENT_TOOLS: LLMTool[] = [
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate to a URL',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to navigate to' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Click on an element using CSS selector or coordinates',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Take a screenshot of the current page',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_page_content',
      description: 'Get the HTML content of the current page',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_interactive_elements',
      description: 'Get all clickable/interactive elements on the page',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate',
      description: 'Execute JavaScript on the page',
      parameters: {
        type: 'object',
        properties: { script: { type: 'string', description: 'JavaScript to execute' } },
        required: ['script'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page up or down',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'to_top', 'to_bottom'] },
          amount: { type: 'number', description: 'Pixels to scroll' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'go_back',
      description: 'Navigate back',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Wait for a specified time (ms)',
      parameters: {
        type: 'object',
        properties: { ms: { type: 'number', description: 'Milliseconds to wait' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_text',
      description: 'Extract text content from the page',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to extract from (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark the task as complete with a result summary',
      parameters: {
        type: 'object',
        properties: { result: { type: 'string', description: 'Final result description' } },
        required: ['result'],
      },
    },
  },
];

export class AIAgent extends EventEmitter {
  private llm: LLMClient;
  private engine: BrowserEngine;
  private tasks: Map<string, AgentTask> = new Map();
  private memories: Map<string, AgentMemory> = new Map();
  private maxSteps = 30;

  constructor() {
    super();
    this.llm = new LLMClient();
    this.engine = BrowserEngine.getInstance();
  }

  async startTask(
    goal: string,
    sessionId: string,
    pageId: string,
  ): Promise<AgentTask> {
    const task: AgentTask = {
      id: uuid(),
      goal,
      status: 'planning',
      steps: [],
      currentStep: 0,
      sessionId,
      pageId,
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.memories.set(task.id, {
      id: task.id,
      sessionId,
      entries: [],
    });

    this.emit('task:started', { taskId: task.id, goal });

    try {
      await this.planTask(task);
      await this.executeTask(task);
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      this.emit('task:failed', { taskId: task.id, error: error.message });
    }

    return task;
  }

  private async planTask(task: AgentTask): Promise<void> {
    task.status = 'planning';
    this.emit('task:planning', { taskId: task.id });

    const pageContent = await this.engine.getPageContent(task.sessionId, task.pageId);
    const elements = await this.engine.getInteractiveElements(task.sessionId, task.pageId);

    const result = await this.llm.chat([
      {
        role: 'system',
        content: `You are an AI browser agent. You can control a web browser to accomplish tasks.
Current page URL: (check via get_page_content)
Available actions: navigate, click, type_text, screenshot, get_page_content, get_interactive_elements, evaluate, scroll, go_back, wait, extract_text, complete_task.

Break the user's goal into a sequence of steps. Return a JSON array of steps, each with a "description" field.
Be specific and actionable. Maximum ${this.maxSteps} steps.
Example: [{"description": "Navigate to google.com"}, {"description": "Click the search box"}, {"description": "Type 'weather forecast'"}, {"description": "Press Enter to search"}]`,
      },
      {
        role: 'user',
        content: `Goal: ${task.goal}\n\nInteractive elements on page:\n${JSON.stringify(elements.slice(0, 20), null, 2)}`,
      },
    ], undefined, { temperature: 0.3 });

    try {
      const stepsMatch = result.content?.match(/\[[\s\S]*\]/);
      if (stepsMatch) {
        const steps = JSON.parse(stepsMatch[0]);
        task.steps = steps.map((s: any, i: number) => ({
          id: uuid(),
          description: s.description,
          action: '',
          status: 'pending' as const,
        }));
      }
    } catch {
      task.steps = [{ id: uuid(), description: task.goal, action: '', status: 'pending' }];
    }

    this.emit('task:planned', { taskId: task.id, steps: task.steps.map(s => s.description) });
  }

  private async executeTask(task: AgentTask): Promise<void> {
    task.status = 'executing';

    for (let i = 0; i < task.steps.length; i++) {
      task.currentStep = i;
      const step = task.steps[i];
      step.status = 'executing';

      this.emit('task:step', { taskId: task.id, step: i, description: step.description });

      const maxRetries = 3;
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await this.executeStep(task, step);
          step.status = 'completed';
          step.result = result;

          this.addMemory(task.id, 'action', `Executed: ${step.description}`, task.pageId);

          if (result === 'TASK_COMPLETE') {
            task.status = 'completed';
            task.completedAt = Date.now();
            this.emit('task:completed', { taskId: task.id });
            return;
          }

          break;
        } catch (error: any) {
          retries++;
          if (retries >= maxRetries) {
            step.status = 'failed';
            step.error = error.message;
            this.addMemory(task.id, 'observation', `Step failed: ${error.message}`, task.pageId);
          }
        }
      }

      if (step.status === 'failed') {
        this.emit('task:step:failed', { taskId: task.id, step: i, error: step.error });
      }
    }

    if (task.status === 'executing') {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = 'All steps executed';
      this.emit('task:completed', { taskId: task.id });
    }
  }

  private async executeStep(task: AgentTask, step: AgentStep): Promise<any> {
    const elements = await this.engine.getInteractiveElements(task.sessionId, task.pageId);

    const result = await this.llm.chat(
      [
        {
          role: 'system',
          content: `You are a browser agent. Execute the given step by calling the appropriate tool.
You have access to these tools: navigate, click, type_text, screenshot, get_page_content, get_interactive_elements, evaluate, scroll, go_back, wait, extract_text, complete_task.
Call exactly one tool to execute the step. If the step's goal is achieved, call complete_task.
Be precise with selectors. Available interactive elements: ${JSON.stringify(elements.slice(0, 15), null, 2)}`,
        },
        {
          role: 'user',
          content: `Execute this step: ${step.description}\n\nPrevious actions in this task:\n${task.steps.slice(0, task.currentStep).map(s => `- ${s.description}: ${s.status}`).join('\n')}`,
        },
      ],
      AGENT_TOOLS,
      { temperature: 0.2, maxTokens: 1000 }
    );

    if (result.toolCalls && result.toolCalls.length > 0) {
      const toolCall = result.toolCalls[0];
      const args = JSON.parse(toolCall.arguments || '{}');

      if (toolCall.name === 'complete_task') {
        return 'TASK_COMPLETE';
      }

      const actionResult = await this.executeToolCall(task.sessionId, task.pageId, toolCall.name, args);
      return actionResult;
    }

    return { content: result.content };
  }

  private async executeToolCall(
    sessionId: string,
    pageId: string,
    toolName: string,
    args: any
  ): Promise<any> {
    switch (toolName) {
      case 'navigate':
        return await this.engine.executeAction(sessionId, pageId, { type: 'navigate', url: args.url });

      case 'click':
        if (args.x !== undefined && args.y !== undefined) {
          return await this.engine.executeAction(sessionId, pageId, { type: 'click', coordinates: { x: args.x, y: args.y } });
        }
        return await this.engine.executeAction(sessionId, pageId, { type: 'click', selector: args.selector });

      case 'type_text':
        return await this.engine.executeAction(sessionId, pageId, { type: 'type', selector: args.selector || 'input:focus, textarea:focus', value: args.text });

      case 'screenshot':
        return await this.engine.getPageScreenshot(sessionId, pageId);

      case 'get_page_content':
        return await this.engine.getPageContent(sessionId, pageId);

      case 'get_interactive_elements':
        return await this.engine.getInteractiveElements(sessionId, pageId);

      case 'evaluate':
        return await this.engine.executeAction(sessionId, pageId, { type: 'evaluate', script: args.script });

      case 'scroll': {
        const dir = args.direction || 'down';
        const amt = args.amount || 300;
        const y = dir === 'up' ? -amt : dir === 'down' ? amt : 0;
        if (dir === 'to_top') return await this.engine.executeAction(sessionId, pageId, { type: 'evaluate', script: 'window.scrollTo(0, 0)' });
        if (dir === 'to_bottom') return await this.engine.executeAction(sessionId, pageId, { type: 'evaluate', script: 'window.scrollTo(0, document.body.scrollHeight)' });
        return await this.engine.executeAction(sessionId, pageId, { type: 'scroll', coordinates: { x: 0, y } });
      }

      case 'go_back':
        return await this.engine.executeAction(sessionId, pageId, { type: 'back' });

      case 'wait':
        return await this.engine.executeAction(sessionId, pageId, { type: 'wait', options: { timeout: args.ms || 1000 } });

      case 'extract_text':
        return await this.engine.executeAction(sessionId, pageId, {
          type: 'evaluate',
          script: args.selector
            ? `document.querySelector('${args.selector}')?.textContent || ''`
            : `document.body.innerText`,
        });

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private addMemory(taskId: string, type: MemoryEntry['type'], content: string, pageUrl?: string): void {
    const memory = this.memories.get(taskId);
    if (memory) {
      memory.entries.push({ type, content, timestamp: Date.now(), pageUrl });
    }
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  getMemory(taskId: string): AgentMemory | undefined {
    return this.memories.get(taskId);
  }

  getAllTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  async stopTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'paused';
      this.emit('task:stopped', { taskId });
    }
  }
}
