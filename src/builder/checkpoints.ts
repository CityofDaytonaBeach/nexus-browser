import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

export interface CheckpointFile { path: string; size: number; modified: number; hash: string }
export interface Checkpoint {
  id: string; root: string; createdAt: string; reason: string;
  files: CheckpointFile[];
  after?: CheckpointFile[];
  restorable?: boolean;
  changedFiles?: number;
}

const ignored = new Set(['.git', '.nexus', '.chromium-source', '.setup', '.cache', 'node_modules', 'dist', 'build', '.next', 'coverage', '.venv', '__pycache__', 'vendor']);
export function sourceFiles(root: string): CheckpointFile[] {
  const result: CheckpointFile[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.nexus' && entry.isDirectory()) {
        for (const name of ['product-contract.json', 'accepted-contract.json']) {
          const full = path.join(dir, entry.name, name);
          if (fs.existsSync(full) && !fs.lstatSync(full).isSymbolicLink()) {
            const stat = fs.statSync(full);
            result.push({ path: path.relative(root, full), size: stat.size, modified: stat.mtimeMs,
              hash: createHash('sha256').update(fs.readFileSync(full)).digest('hex') });
          }
        }
        continue;
      }
      if (ignored.has(entry.name) || entry.isSymbolicLink() || /\.log$/.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const stat = fs.statSync(full);
        result.push({ path: path.relative(root, full), size: stat.size, modified: stat.mtimeMs,
          hash: createHash('sha256').update(fs.readFileSync(full)).digest('hex') });
      }
    }
  };
  visit(root);
  return result;
}

// Check every path component: a symlink introduced after a checkpoint must not
// turn a restore into a write outside the workspace.
function contained(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid checkpoint path');
  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Checkpoint path contains a symlink');
  }
  return target;
}

export class Checkpoints {
  create(root: string, reason: string): Checkpoint {
    root = fs.realpathSync(root);
    const item: Checkpoint = { id: randomUUID(), root, reason, createdAt: new Date().toISOString(), files: sourceFiles(root) };
    const dir = this.directory(root, item.id);
    fs.mkdirSync(path.join(dir, 'contents'), { recursive: true });
    for (const file of item.files) {
      const destination = contained(path.join(dir, 'contents'), file.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(contained(root, file.path), destination);
    }
    this.save(item);
    return item;
  }

  seal(item: Checkpoint): void {
    item.after = sourceFiles(item.root);
    this.save(item);
  }

  list(root: string): Checkpoint[] {
    const dir = path.join(root, '.nexus', 'checkpoints');
    if (!fs.existsSync(dir)) return [];
    const current = new Map(sourceFiles(root).map((file) => [file.path, file.hash]));
    return fs.readdirSync(dir).flatMap((id) => {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(this.directory(root, id), 'manifest.json'), 'utf8')) as Checkpoint;
        return item.root === fs.realpathSync(root) && item.id === id ? [item] : [];
      } catch { return []; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => {
      const before = new Map(item.files.map((file) => [file.path, file.hash]));
      const after = item.after ? new Map(item.after.map((file) => [file.path, file.hash])) : current;
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name));
      return { ...item, changedFiles: changed.length, restorable: !item.after || changed.every((name) => current.get(name) === after.get(name)) };
    });
  }

  restore(root: string, id: string): { restored: string[]; backup: Checkpoint } {
    root = fs.realpathSync(root);
    const item = this.list(root).find((entry) => entry.id === id);
    if (!item) throw new Error('Checkpoint not found in this project');
    const before = new Map(item.files.map((file) => [file.path, file]));
    const after = new Map((item.after || item.files).map((file) => [file.path, file]));
    const current = new Map(sourceFiles(root).map((file) => [file.path, file]));
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => item.after ? before.get(name)?.hash !== after.get(name)?.hash : before.get(name)?.hash !== current.get(name)?.hash);
    for (const name of changed) {
      contained(root, name);
      if (item.after && current.get(name)?.hash !== after.get(name)?.hash)
        throw new Error(`Restore would overwrite a later edit to ${name}. Restore a newer checkpoint first.`);
      const old = before.get(name);
      if (old) {
        const content = fs.readFileSync(contained(path.join(this.directory(root, id), 'contents'), name));
        if (createHash('sha256').update(content).digest('hex') !== old.hash) throw new Error(`Checkpoint contents damaged: ${name}`);
      }
    }
    const backup = this.create(root, `Before restoring ${id}`);
    for (const name of changed) {
      const target = contained(root, name);
      if (before.has(name)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(contained(path.join(this.directory(root, id), 'contents'), name), target);
      } else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    this.seal(backup);
    return { restored: changed, backup };
  }

  private directory(root: string, id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid checkpoint ID');
    return contained(root, path.join('.nexus', 'checkpoints', id));
  }
  private save(item: Checkpoint): void {
    const dir = this.directory(item.root, item.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(item, null, 2));
  }
}
