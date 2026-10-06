import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Checkpoints } from '../checkpoints';
import { routeProductIntent } from '../intent';

describe('Restorable project versions', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-version-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  test('restores contents and deleted files, removes job additions, survives restart', () => {
    fs.writeFileSync(path.join(root, 'app.ts'), 'original');
    fs.writeFileSync(path.join(root, '.env.example'), 'KEY=');
    const versions = new Checkpoints();
    const before = versions.create(root, 'Before change');
    fs.writeFileSync(path.join(root, 'app.ts'), 'changed');
    fs.unlinkSync(path.join(root, '.env.example'));
    fs.writeFileSync(path.join(root, 'added.ts'), 'new');
    versions.seal(before);
    fs.writeFileSync(path.join(root, 'unrelated.txt'), 'keep');
    const restored = new Checkpoints().restore(root, before.id);
    expect(restored.restored).toHaveLength(3);
    expect(fs.readFileSync(path.join(root, 'app.ts'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(root, '.env.example'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'added.ts'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
    new Checkpoints().restore(root, restored.backup.id);
    expect(fs.readFileSync(path.join(root, 'app.ts'), 'utf8')).toBe('changed');
  });
  test('refuses to overwrite a later edit and does not partially restore', () => {
    fs.writeFileSync(path.join(root, 'app.ts'), 'original');
    const versions = new Checkpoints();
    const before = versions.create(root, 'Before change');
    fs.writeFileSync(path.join(root, 'app.ts'), 'agent');
    versions.seal(before);
    fs.writeFileSync(path.join(root, 'app.ts'), 'later user edit');
    expect(() => versions.restore(root, before.id)).toThrow('later edit');
    expect(fs.readFileSync(path.join(root, 'app.ts'), 'utf8')).toBe('later user edit');
  });
  test('restores the product acceptance contract with its version', () => {
    fs.mkdirSync(path.join(root, '.nexus'));
    fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), 'original');
    const versions = new Checkpoints();
    const before = versions.create(root, 'Before change');
    fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), 'changed');
    versions.seal(before); versions.restore(root, before.id);
    expect(fs.readFileSync(path.join(root, '.nexus', 'product-contract.json'), 'utf8')).toBe('original');
  });
});

test('routes conversational product changes without treating acknowledgements or questions as edits', () => {
  expect(routeProductIntent('Can you make the homepage less crowded?', 'build', true)).toBe('update');
  expect(routeProductIntent('make the homepage less crowded?', 'build', true)).toBe('update');
  expect(routeProductIntent('It feels too crowded', 'build', true)).toBe('update');
  expect(routeProductIntent('Thanks', 'build', true)).toBe('ask');
  expect(routeProductIntent('Does it persist tasks?', 'build', true)).toBe('ask');
  expect(routeProductIntent('build a task tracker', 'chat', false, 'build')).toBe('ask');
  expect(routeProductIntent('undo the last change', 'build', true)).toBe('undo');
});
