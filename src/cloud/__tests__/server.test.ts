import { CloudServer } from '../server';

describe('CloudServer deploy helpers', () => {
  test('routes terse product prompts into an executable build', () => {
    const server = new CloudServer() as any;
    expect(server.detectBuilderMode('bike landing page', 'ui-builder')).toBe('build');
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
});
