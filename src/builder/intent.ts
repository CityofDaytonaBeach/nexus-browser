export type ProductIntent = 'ask' | 'research' | 'plan' | 'build' | 'update' | 'repair' | 'qa' | 'integration' | 'deploy' | 'undo' | 'browser';
const intents: ProductIntent[] = ['ask', 'research', 'plan', 'build', 'update', 'repair', 'qa', 'integration', 'deploy', 'undo', 'browser'];
export function parseProductIntent(value: unknown): ProductIntent | undefined {
  return intents.includes(value as ProductIntent) ? value as ProductIntent : undefined;
}
export function routeProductIntent(message: string, mode: string, hasProject: boolean, semantic?: ProductIntent): ProductIntent {
  if (mode === 'chat') return 'ask';
  if (mode === 'research') return 'research';
  if (mode === 'plan') return 'plan';
  if (semantic) return semantic === 'update' && !hasProject ? 'build' : semantic === 'build' && hasProject ? 'update' : semantic;
  const text = message.trim().toLowerCase();
  const action = /^(?:please\s+)?(?:can|could|would|will)\s+(?:you|we|nexus)\s+(?:please\s+)?(?:build|create|make|add|change|fix|remove|update|improve|connect|test|undo|restore|copy|clone|recreate|replicate|generate|implement)\b/.test(text)
    || /^(?:please\s+)?(?:build|create|make|add|change|fix|remove|update|improve|connect|test|undo|restore|replace|move|redesign|clone|copy|recreate|replicate|generate|implement)\b/.test(text)
    || /^(?:i (?:want|need)|i'd like|let'?s)\b/.test(text);
  if (!action && /^(?:what|why|how|when|where|who|which|does|do|did|is|are|has|have|can|could|would|should|will|explain|tell me)\b/.test(text)) return 'ask';
  if (/^(?:thanks|thank you|ok|okay|great|hello|hi|looks good)[.!]*$/.test(text)) return 'ask';
  if (/\b(undo|restore|revert last|roll back)\b/.test(text)) return 'undo';
  if (/\b(staging studio|visual qa|responsive check|test (?:the )?(?:app|site)|check (?:the )?(?:app|site)|browser shakedown)\b/.test(text)) return 'qa';
  if (/\b(deploy|publish|ship)\b/.test(text) && action) return 'deploy';
  if (/\b(fix|repair|debug|broken|failing|build doctor|auto heal)\b/.test(text)) return hasProject ? 'repair' : 'ask';
  if (hasProject && (action || /\b(more|less|darker|lighter|bigger|smaller|too crowded|too small|too large|doesn't work|does not work)\b/.test(text))) return 'update';
  if (action || /\b(landing page|website|web app|application|dashboard|portal|tracker|storefront|portfolio|blog|game|site)\b/.test(text)) return hasProject ? 'update' : 'build';
  return 'ask';
}
