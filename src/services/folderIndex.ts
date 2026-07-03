import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMetadata } from '../types/metadata';
import { logger } from './logger';

const CACHE_VERSION = 1;

export interface FolderMetadata {
  folderPath: string;
  fileCount: number;
  languages: Record<string, number>;
  categories: string[];
  symbols: string[];
  embedding?: number[];
  lastUpdated: string;
}

export interface FolderCache {
  version: number;
  folders: Record<string, FolderMetadata>;
}

export class FolderIndex {
  private store = new Map<string, FolderMetadata>();

  async load(cachePath: string): Promise<void> {
    try {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const cache: FolderCache = JSON.parse(raw);

      if (cache.version !== CACHE_VERSION) {
        logger.info('Folder cache version mismatch, will rebuild');
        return;
      }

      this.store.clear();
      for (const [key, value] of Object.entries(cache.folders)) {
        this.store.set(key, value);
      }
      logger.info(`Loaded ${this.store.size} folder entries from cache`);
    } catch {
      logger.info('No valid folder cache found, will build fresh');
    }
  }

  async save(cachePath: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      const cache: FolderCache = {
        version: CACHE_VERSION,
        folders: Object.fromEntries(this.store),
      };
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
      logger.info(`Saved ${this.store.size} folder entries to cache`);
    } catch (err) {
      logger.error('Failed to save folder cache', err);
    }
  }

  buildFromFiles(files: FileMetadata[]): void {
    this.store.clear();

    const folderMap = new Map<string, FileMetadata[]>();

    for (const file of files) {
      const folderPath = file.folderPath;
      if (!folderMap.has(folderPath)) {
        folderMap.set(folderPath, []);
      }
      folderMap.get(folderPath)!.push(file);
    }

    for (const [folderPath, folderFiles] of folderMap) {
      const languages: Record<string, number> = {};
      const categorySet = new Set<string>();
      const symbolSet = new Set<string>();

      for (const file of folderFiles) {
        languages[file.language] = (languages[file.language] || 0) + 1;
        categorySet.add(file.category);
        for (const sym of file.symbols) {
          symbolSet.add(sym);
        }
      }

      const folderMeta: FolderMetadata = {
        folderPath,
        fileCount: folderFiles.length,
        languages,
        categories: Array.from(categorySet),
        symbols: Array.from(symbolSet),
        lastUpdated: new Date().toISOString(),
      };

      this.store.set(folderPath, folderMeta);
    }

    logger.info(`Built folder index: ${this.store.size} folders`);
  }

  getAll(): FolderMetadata[] {
    return Array.from(this.store.values());
  }

  getByPath(folderPath: string): FolderMetadata | undefined {
    return this.store.get(folderPath);
  }

  size(): number {
    return this.store.size;
  }

  folderText(folder: FolderMetadata): string {
    const parts = [
      path.basename(folder.folderPath),
      ...folder.categories,
      ...folder.symbols.slice(0, 30),
    ];
    return parts.filter(Boolean).join(' ');
  }
}
