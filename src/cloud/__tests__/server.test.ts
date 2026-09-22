import { CloudServer } from '../server';

describe('CloudServer deploy helpers', () => {
  test('routes terse product prompts into an executable build', () => {
    const server = new CloudServer() as any;
    expect(server.detectBuilderMode('bike landing page', 'ui-builder')).toBe('ui-builder');
    expect(server.shouldStartBuild('bike landing page', 'ui-builder')).toBe(true);
    expect(server.shouldStartBuild('bike landing page', 'build')).toBe(true);
    expect(server.shouldRequireBrowserGrounding('bike landing page', 'build', 'No active page is available')).toBe(false);
    server.stop?.();
  });

  test('keeps Ask mode conversational even for product wording', () => {
    const server = new CloudServer() as any;
    expect(server.shouldStartBuild('bike landing page', 'chat')).toBe(false);
    expect(server.shouldUpdateBuild('fix the bike landing page', 'chat')).toBe(false);
    server.stop?.();
  });

  test('honors the selected mode until the prompt explicitly changes it', () => {
    const server = new CloudServer() as any;
    const prompt = 'bike landing page';

    expect(server.detectBuilderMode(prompt, 'chat')).toBe('chat');
    expect(server.detectBuilderMode(prompt, 'plan')).toBe('plan');
    expect(server.detectBuilderMode(prompt, 'research')).toBe('research');
    expect(server.detectBuilderMode('Switch to Agent mode and build it', 'plan')).toBe('build');
    expect(server.shouldStartBuild(prompt, 'plan')).toBe(false);
    expect(server.shouldStartBuild(prompt, 'research')).toBe(false);
    expect(server.shouldUpdateBuild('fix the tablet layout', 'plan')).toBe(false);
    expect(server.detectChatWorkIntent(prompt, 'chat', '')).toBe('ask');
    expect(server.detectChatWorkIntent(prompt, 'plan', '')).toBe('plan');
    expect(server.detectChatWorkIntent(prompt, 'research', '')).toBe('research');
    server.stop?.();
  });

  test('answers build questions without launching another Agent mode update', () => {
    const server = new CloudServer() as any;
    const question = 'Does it own all screen sizes now why you continue to chat and build';

    expect(server.isConversationalBuildQuestion(question)).toBe(true);
    expect(server.shouldStartBuild(question, 'build')).toBe(false);
    expect(server.shouldUpdateBuild(question, 'build')).toBe(false);
    expect(server.shouldUpdateBuild('Can you fix the tablet layout?', 'build')).toBe(true);
    expect(server.shouldStartBuild('Can you build a responsive PHP portal?', 'build')).toBe(true);
    const reply = server.createFallbackBuilderChat(question, 'build', 'faithful-clone', '');
    expect(reply.response).toContain('will not start another code update');
    expect(reply.response).toContain('desktop, laptop, tablet, and mobile');
    server.stop?.();
  });

  test('creates a focused agent, skill, expert, and knowledge route for each product prompt', () => {
    const server = new CloudServer() as any;
    const plan = server.createChatOrchestrationPlan(
      'Build a Laravel customer portal with MySQL, Stripe checkout, and responsive account screens',
      'build',
      '',
      'No active rendered browser session yet.',
    );

    expect(plan.intent).toBe('build');
    expect(plan.stack.framework).toBe('Laravel');
    expect(plan.agents.map((agent: any) => agent.id)).toEqual(expect.arrayContaining([
      'framework-expert-router',
      'opencode-build-agent',
      'integration-agent',
      'qa-agent',
      'memory-agent',
    ]));
    expect(plan.experts.map((expert: any) => expert.id)).toEqual(expect.arrayContaining(['php', 'laravel', 'composer', 'mysql', 'stripe']));
    expect(plan.skills.map((skill: any) => skill.name)).toEqual(expect.arrayContaining(['Intent To Product Sprint', 'Stack Expert Routing']));
    expect(plan.steps.join(' ')).toContain('product slice');
    server.stop?.();
  });

  test('uses reversible smart defaults for fast prototypes but asks about high-risk production gaps', () => {
    const server = new CloudServer() as any;
    const prototype = server.createProjectReadiness('default', 'Build an ecommerce store with auth and a database', [], '');
    const production = server.createProjectReadiness('default', 'Build a production ecommerce store for real customers', [], '');

    expect(server.shouldAskProjectReadiness('Build an ecommerce store with auth and a database', 'build', prototype)).toBe(false);
    expect(server.shouldAskProjectReadiness('Build a production ecommerce store for real customers', 'build', production)).toBe(true);
    expect(server.buildProjectReadinessContext(prototype)).toContain('reversible local/mock defaults');
    server.stop?.();
  });

  test('extracts deploy URLs from provider output', () => {
    const server = new CloudServer() as any;
    const urls = server.extractDeployUrls('Preview: https://demo-abc.vercel.app\nWebsite URL: https://nexus.netlify.app.\nIgnore https://example.com');
    expect(urls).toEqual(['https://demo-abc.vercel.app', 'https://nexus.netlify.app']);
    server.stop?.();
  });

  test('creates browser-first post deploy QA plan', () => {
    const server = new CloudServer() as any;
    const plan = server.postDeployQaPlan('https://demo.vercel.app');
    expect(plan.url).toBe('https://demo.vercel.app');
    expect(plan.steps.join(' ')).toContain('Nexus browser');
    expect(plan.steps.join(' ')).toContain('SEO/Security');
    server.stop?.();
  });

  test('parses changed files from git diff', () => {
    const server = new CloudServer() as any;
    const files = server.parseDiffFiles('diff --git a/src/a.ts b/src/a.ts\n+one\n-two\ndiff --git a/public/index.html b/public/index.html\n+three\n+four\n');
    expect(files).toEqual([
      { path: 'src/a.ts', additions: 1, deletions: 1 },
      { path: 'public/index.html', additions: 2, deletions: 0 },
    ]);
    server.stop?.();
  });

  test('creates Supabase schema plan from browser evidence', () => {
    const server = new CloudServer() as any;
    const plan = server.createSupabaseSchemaPlan('Customer dashboard with tasks, invoices, browser events, and team profiles');
    expect(plan.tables.length).toBeGreaterThan(0);
    expect(plan.prompt).toContain('browser evidence');
    expect(plan.prompt).toContain('RLS');
    server.stop?.();
  });

  test('creates side-by-side visual diff review package', () => {
    const server = new CloudServer() as any;
    const pkg = server.createSideBySideVisualDiff({
      scores: { overall: 82 },
      findings: [],
      artifacts: { targetScreenshot: 'target.png', localScreenshot: 'local.png', diffJson: 'visual-diff.json' },
    });
    expect(pkg.targetScreenshot).toBe('target.png');
    expect(pkg.browserFirstApprovalRule).toContain('browser evidence');
    server.stop?.();
  });

  test('lists vision-capable browser routes', () => {
    const server = new CloudServer() as any;
    const routes = server.getVisionRoutes();
    expect(routes.some((route: any) => route.browserUse.includes('browser screenshots'))).toBe(true);
    server.stop?.();
  });

  test('maps native browser chat commands to active-tab actions', () => {
    const server = new CloudServer() as any;

    expect(server.nativeBrowserActionFromCommand('open example.com')).toEqual({ type: 'navigate', url: 'example.com' });
    expect(server.nativeBrowserActionFromCommand('click "Sign in"')).toEqual({ type: 'click', selector: 'text=Sign in' });
    expect(server.nativeBrowserActionFromCommand('fill "Email" "name@example.com"')).toEqual({ type: 'type', selector: 'text=Email', value: 'name@example.com' });
    expect(server.nativeBrowserActionFromCommand('go back')).toEqual({ type: 'back' });
    expect(server.nativeBrowserActionFromCommand('take a screenshot')).toEqual({ type: 'screenshot' });
    server.stop?.();
  });
});
