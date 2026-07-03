import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

export class FileScanner {
  async scanWorkspace(
    includePatterns: string[],
    excludePatterns: string[],
    rootPath?: string,
  ): Promise<string[]> {
    if (rootPath) {
      return this._scanFromRoot(rootPath, includePatterns, excludePatterns);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.warn('No workspace folder open');
      return [];
    }

    const includeGlob = `{${includePatterns.join(',')}}`;
    const excludeGlob = `{${excludePatterns.join(',')}}`;

    logger.info(`Scanning workspace with include: ${includeGlob}`);

    const uris = await vscode.workspace.findFiles(includeGlob, excludeGlob);
    logger.info(`Found ${uris.length} candidate files`);

    const validPaths: string[] = [];
    for (const uri of uris) {
      try {
        const stat = await fs.stat(uri.fsPath);
        if (stat.size <= MAX_FILE_SIZE_BYTES) {
          validPaths.push(uri.fsPath);
        }
      } catch {
        // skip unreadable files
      }
    }

    logger.info(`${validPaths.length} files pass size filter`);
    return validPaths;
  }

  private async _scanFromRoot(
    rootPath: string,
    includePatterns: string[],
    excludePatterns: string[],
  ): Promise<string[]> {
    logger.info(`Scanning from root path: ${rootPath}`);

    const extensions = this._extractExtensions(includePatterns);
    const excludeDirs = this._extractExcludeDirs(excludePatterns);

    const validPaths: string[] = [];
    await this._walkDir(rootPath, extensions, excludeDirs, validPaths);

    logger.info(`${validPaths.length} files found from root path`);
    return validPaths;
  }

  private async _walkDir(
    dir: string,
    extensions: Set<string>,
    excludeDirs: Set<string>,
    results: string[],
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) {
          continue;
        }
        await this._walkDir(fullPath, extensions, excludeDirs, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size <= MAX_FILE_SIZE_BYTES) {
              results.push(fullPath);
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  private _extractExtensions(includePatterns: string[]): Set<string> {
    const extensions = new Set<string>();
    for (const pattern of includePatterns) {
      const match = pattern.match(/\.\*?\{([^}]+)\}/);
      if (match) {
        for (const ext of match[1].split(',')) {
          extensions.add(`.${ext.trim()}`);
        }
      } else if (pattern.startsWith('*.')) {
        extensions.add(pattern.slice(1));
      }
    }
    return extensions;
  }

  private _extractExcludeDirs(excludePatterns: string[]): Set<string> {
    const dirs = new Set<string>();
    for (const pattern of excludePatterns) {
      const match = pattern.match(/\*\*\/([^/*]+)\/\*\*/);
      if (match) {
        dirs.add(match[1]);
      }
    }
    return dirs;
  }

  async getFilePreview(filePath: string, lines = 50): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.split('\n').slice(0, lines).join('\n');
    } catch (err) {
      logger.warn(`Could not read preview for ${path.basename(filePath)}`);
      return '';
    }
  }
}
