import * as vscode from 'vscode';
import { MetadataIndex } from './metadataIndex';
import { FileIndexer } from './fileIndexer';
import { logger } from './logger';

const DEBOUNCE_MS = 2000;

export class FileWatcher {
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly index: MetadataIndex,
    private readonly fileIndexer: FileIndexer,
    private readonly includePatterns: string[],
    private readonly cachePath: string,
  ) {}

  watch(workspaceFolder: vscode.WorkspaceFolder): vscode.Disposable {
    const globPattern = this.includePatterns.length === 1
      ? this.includePatterns[0]
      : `{${this.includePatterns.join(',')}}`;

    const pattern = new vscode.RelativePattern(workspaceFolder, globPattern);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(async (uri) => {
      logger.info(`File created: ${uri.fsPath}`);
      await this.indexFile(uri.fsPath);
      this.scheduleSave();
    });

    watcher.onDidDelete((uri) => {
      logger.info(`File deleted: ${uri.fsPath}`);
      this.index.remove(uri.fsPath);
      this.scheduleSave();
    });

    watcher.onDidChange(async (uri) => {
      logger.debug(`File changed: ${uri.fsPath}`);
      await this.indexFile(uri.fsPath);
      this.scheduleSave();
    });

    return watcher;
  }

  async indexFile(filePath: string): Promise<void> {
    try {
      const metadata = await this.fileIndexer.buildMetadata(filePath);
      this.index.add(metadata);
    } catch (err) {
      logger.error(`Failed to index ${filePath}`, err);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(async () => {
      await this.index.save(this.cachePath);
    }, DEBOUNCE_MS);
  }
}
