import { CloudServer } from '../server';

describe('CloudServer deploy helpers', () => {
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
});
