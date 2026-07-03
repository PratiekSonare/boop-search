import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMetadata, MetadataCache } from '../types/metadata';
import { logger } from './logger';

const CACHE_VERSION = 2;

export class MetadataIndex {
  private store = new Map<string, FileMetadata>();
  private cacheBuildTime: number = 0;

  async load(cachePath: string): Promise<void> {
    try {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const cache: MetadataCache = JSON.parse(raw);

      if (cache.version !== CACHE_VERSION) {
        logger.info('Cache version mismatch, will rebuild');
        return;
      }

      this.store.clear();
      for (const file of cache.files) {
        this.store.set(file.path, file);
      }
      this.cacheBuildTime = new Date(cache.buildTime).getTime();
      logger.info(`Loaded ${this.store.size} entries from cache`);
    } catch {
      logger.info('No valid cache found, will build fresh index');
    }
  }

  async save(cachePath: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      const cache: MetadataCache = {
        version: CACHE_VERSION,
        buildTime: new Date().toISOString(),
        files: Array.from(this.store.values()),
      };
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
      this.cacheBuildTime = Date.now();
      logger.info(`Saved ${this.store.size} entries to cache`);
    } catch (err) {
      logger.error('Failed to save metadata cache', err);
    }
  }

  add(metadata: FileMetadata): void {
    this.store.set(metadata.path, metadata);
  }

  update(filePath: string, updates: Partial<FileMetadata>): void {
    const existing = this.store.get(filePath);
    if (existing) {
      this.store.set(filePath, { ...existing, ...updates });
    }
  }

  remove(filePath: string): void {
    this.store.delete(filePath);
  }

  has(filePath: string): boolean {
    return this.store.has(filePath);
  }

  getAll(): FileMetadata[] {
    return Array.from(this.store.values());
  }

  getPaths(): string[] {
    return Array.from(this.store.keys());
  }

  get(filePath: string): FileMetadata | undefined {
    return this.store.get(filePath);
  }

  getBuildTime(): number {
    return this.cacheBuildTime;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

}
