import { z } from 'zod';

export const browserTaskSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('search'), query: z.string().min(1).max(500) }),
  z.object({ type: z.literal('navigate'), url: z.string().min(1).max(2000) }),
  z.object({ type: z.literal('inspect'), kind: z.enum(['page', 'apis', 'research']).default('page') }),
  z.object({ type: z.literal('click'), target: z.string().min(1).max(300) }),
  z.object({ type: z.literal('find'), target: z.string().min(1).max(300) }),
  z.object({ type: z.literal('fill'), target: z.string().min(1).max(300), value: z.string().max(4000) }),
  z.object({ type: z.literal('press'), key: z.string().min(1).max(80) }),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up', 'down', 'top', 'bottom']) }),
]);
export type BrowserChatTask = z.infer<typeof browserTaskSchema>;
export interface BrowserChatRequest { tasks: BrowserChatTask[]; buildAfter: boolean }

export function browserRequest(message: string): BrowserChatRequest | undefined {
  const text = message.trim().replace(/^\/(?:agent-browser|ab)\s+(?:chat\s+)?|^agent-browser:\s*/i, '')
    .replace(/^['"]|['"]$/g, '').replace(/^(?:please\s+)?(?:can|could|would|will)\s+(?:you|nexus)\s+(?:please\s+)?/i, '').replace(/^please\s+/i, '');
  const buildAfter = /\b(build|clone|copy|recreate|replicate)\b/i.test(text) && !/^(?:what|how|why)\b/i.test(text);
  if (/^(?:diagnose (?:this|the|current) (?:page|site)|inspect this page and map)/i.test(text)) return { tasks: [{ type: 'inspect', kind: 'page' }, { type: 'inspect', kind: 'apis' }], buildAfter: false };
  const url = text.match(/https?:\/\/[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i)?.[0]?.replace(/[),.!?]+$/, '');
  if (buildAfter && /\b(search|find|look (?:up|for)|browse)\b/i.test(text) && !url) {
    const query = text.replace(/^.*?\b(?:search(?: the (?:web|internet))?(?: for)?|find|look (?:up|for)|browse)\s+/i, '')
      .replace(/\s+(?:and|then|to)\s+(?:build|clone|copy|recreate|replicate)[\s\S]*$/i, '').trim();
    return { tasks: [{ type: 'search', query: query || text }], buildAfter: true };
  }
  if (buildAfter && url) return { tasks: [{ type: 'navigate', url }], buildAfter: true };
  const search = text.match(/^(?:search(?: the (?:web|internet))?(?: for)?|look (?:up|for)|find (?:websites?|sites?|pages?|examples?|references?|sources?)(?: (?:for|about|of))?)\s+(.+)/i);
  if (search) return { tasks: [{ type: 'search', query: search[1] }], buildAfter: false };
  if (/^(?:open|visit|navigate to|go to)\s+/i.test(text) && !buildAfter) {
    return { tasks: [{ type: 'navigate', url: text.replace(/^(?:open|visit|navigate to|go to)\s+/i, '').trim() }], buildAfter: false };
  }
  if (/^(?:give|show|find|map|inspect|extract|list|detect)(?: me)? (?:the )?(?:apis?|endpoints?|backend|network)/i.test(text)) {
    return { tasks: [{ type: 'inspect', kind: 'apis' }], buildAfter: false };
  }
  if (/^(?:run |create |do )?(?:research(?: project)?|project brain)\b/i.test(text)) return { tasks: [{ type: 'inspect', kind: 'research' }], buildAfter: false };
  if (/^(?:read|inspect|summarize|snapshot)(?: (?:this|the|current|active))?(?: page| site| website)?[.!?]*$/i.test(text)) return { tasks: [{ type: 'inspect', kind: 'page' }], buildAfter: false };
  const find = text.match(/^(?:find|locate)(?: (?:and )?open)? (.+)/i);
  if (find && !buildAfter) return { tasks: [{ type: 'find', target: find[1].replace(/\s+(?:on|in) (?:this|the|current) (?:page|site).*$/i, '') }], buildAfter: false };
  const click = text.match(/^(?:click|tap)(?: on)? (.+)/i);
  if (click && !buildAfter) return { tasks: [{ type: 'click', target: click[1].replace(/^['"]|['"]$/g, '') }], buildAfter: false };
  return undefined;
}

export const browserTaskSnapshotScript = `(() => ({ title: document.title, url: location.href,
  text: (document.body?.innerText || '').slice(0, 12000),
  links: Array.from(document.querySelectorAll('a[href]')).map(a => ({ text: (a.innerText || a.getAttribute('aria-label') || '').trim(), url: a.href })).filter(a => a.text).slice(0, 100),
  controls: Array.from(document.querySelectorAll('button,input,textarea,select,[role="button"]')).map(e => ({tag:e.tagName.toLowerCase(),text:(e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim()})).slice(0, 80),
  resources: performance.getEntriesByType('resource').map(r => ({url:r.name,type:r.initiatorType})).filter(r=>/fetch|xmlhttprequest/.test(r.type)).slice(-60),
  forms: Array.from(document.forms).map(f=>({action:f.action,method:f.method}))
}))()`;
