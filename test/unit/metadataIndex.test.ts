import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { MetadataIndex } from '../../src/services/metadataIndex';
import { FileMetadata } from '../../src/types/metadata';

function makeFile(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    path: '/project/src/components/Button.tsx',
    fileName: 'Button.tsx',
    folderPath: '/project/src/components',
    language: 'typescriptreact',
    purpose: 'Reusable button component',
    purposeSource: 'manual',
    category: 'frontend/components',
    related: [],
    lastModified: Date.now(),
    ...overrides,
  };
}

describe('MetadataIndex', () => {
  let index: MetadataIndex;

  beforeEach(() => {
    index = new MetadataIndex();
  });

  it('starts empty', () => {
    expect(index.size).toBe(0);
    expect(index.getAll()).toEqual([]);
  });

  it('adds and retrieves a file', () => {
    const file = makeFile();
    index.add(file);
    expect(index.size).toBe(1);
    expect(index.getAll()[0]).toEqual(file);
  });

  it('has() returns true for existing path', () => {
    const file = makeFile();
    index.add(file);
    expect(index.has(file.path)).toBe(true);
    expect(index.has('/nonexistent')).toBe(false);
  });

  it('updates existing entry', () => {
    const file = makeFile();
    index.add(file);
    index.update(file.path, { purpose: 'Updated purpose' });
    expect(index.getAll()[0].purpose).toBe('Updated purpose');
    expect(index.getAll()[0].category).toBe('frontend/components');
  });

  it('update is a no-op for nonexistent path', () => {
    index.update('/nonexistent', { purpose: 'x' });
    expect(index.size).toBe(0);
  });

  it('removes a file', () => {
    const file = makeFile();
    index.add(file);
    index.remove(file.path);
    expect(index.size).toBe(0);
  });

  it('clear empties the store', () => {
    index.add(makeFile());
    index.add(makeFile({ path: '/other.ts' }));
    index.clear();
    expect(index.size).toBe(0);
  });

  it('save and load round-trips all fields', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-index-test-'));
    const cachePath = path.join(tmpDir, '.boop-metadata.json');

    const file = makeFile({ embedding: [0.1, 0.2, 0.3] });
    index.add(file);
    await index.save(cachePath);

    const index2 = new MetadataIndex();
    await index2.load(cachePath);

    expect(index2.size).toBe(1);
    const loaded = index2.getAll()[0];
    expect(loaded.path).toBe(file.path);
    expect(loaded.purpose).toBe(file.purpose);
    expect(loaded.embedding).toEqual([0.1, 0.2, 0.3]);

    await fs.rm(tmpDir, { recursive: true });
  });

  it('load is a no-op for nonexistent cache', async () => {
    await index.load('/nonexistent/path/cache.json');
    expect(index.size).toBe(0);
  });
});
