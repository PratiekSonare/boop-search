import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MetadataIndex } from './services/metadataIndex';
import { EmbeddingsEngine } from './services/embeddings';
import { HeaderParser } from './services/headerParser';
import { FileScanner } from './services/fileScanner';
import { SymbolExtractor } from './services/symbolExtractor';
import { FileIndexer } from './services/fileIndexer';
import { FolderIndex } from './services/folderIndex';
import { FileWatcher } from './services/fileWatcher';
import { ExtensionConfig } from './types/config';
import { logger } from './services/logger';
import { registerOpenByDescription } from './commands/openFilesByDescription';
import { registerAddHeader } from './commands/addFileHeader';
import { registerRebuildIndex } from './commands/rebuildIndex';
import { registerConfigureProvider } from './commands/configureProvider';
import { PookieExplorerProvider } from './sidebar/PookieExplorerProvider';

export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('pookie-explorer');
  return {
    searchMethod: cfg.get('searchMethod', 'embeddings'),
    llmProvider: cfg.get('llmProvider', 'gemini'),
    geminiApiKey: cfg.get('geminiApiKey', ''),
    geminiModel: cfg.get('geminiModel', 'gemini-3.5-flash'),
    openaiApiKey: cfg.get('openaiApiKey', ''),
    openaiModel: cfg.get('openaiModel', 'gpt-4o-mini'),
    openRouterApiKey: cfg.get('openRouterApiKey', ''),
    openRouterModel: cfg.get('openRouterModel', 'anthropic/claude-3-haiku'),
    maxResultsShown: cfg.get('maxResultsShown', 5),
    autoSummarizeOnStartup: cfg.get('autoSummarizeOnStartup', false),
    includePatterns: cfg.get('includePatterns', [
      '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,c,cpp,cc,cxx,h,hpp,hxx,m,mm,asm,s,S,f,f90,f95,f03,f08,cob,cbl,hs,lhs,lua,zig,nim,r,R,dart,jl,pl,pm,ex,exs,clj,cljs,cljc,erl,hrl,scala,sql,json,yaml,yml,toml,md,css,scss,html}',
    ]),
    excludePatterns: cfg.get('excludePatterns', [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
    ]),
    enableFileWatcher: cfg.get('enableFileWatcher', true),
    enableSymbolExtraction: cfg.get('enableSymbolExtraction', true),
    rootFolderPath: cfg.get('rootFolderPath', ''),
  };
}

async function buildIndex(
  index: MetadataIndex,
  fileIndexer: FileIndexer,
  scanner: FileScanner,
  config: ExtensionConfig,
  cachePath: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  progress.report({ message: 'Scanning files...' });

  logger.info(`include: ${config.includePatterns}`);
  logger.info(`exclude: ${config.excludePatterns}`);

  const filePaths = await scanner.scanWorkspace(
    config.includePatterns,
    config.excludePatterns,
    config.rootFolderPath || undefined,
  );

  logger.info(`Building index for ${filePaths.length} files`);

  for (let i = 0; i < filePaths.length; i++) {
    try {
      const metadata = await fileIndexer.buildMetadata(filePaths[i]);
      index.add(metadata);
    } catch (err) {
      logger.warn(`Could not index ${filePaths[i]}`);
    }

    if (i % 25 === 0) {
      progress.report({
        message: `Indexing... (${i + 1}/${filePaths.length})`,
        increment: (25 / filePaths.length) * 100,
      });
    }
  }

  await index.save(cachePath);
  logger.info(`Index built: ${index.size} files`);
}

async function deltaScan(
  index: MetadataIndex,
  fileIndexer: FileIndexer,
  scanner: FileScanner,
  config: ExtensionConfig,
  cachePath: string,
): Promise<void> {
  const cachedPaths = new Set(index.getPaths());
  const workspacePaths = await scanner.scanWorkspace(
    config.includePatterns,
    config.excludePatterns,
    config.rootFolderPath || undefined,
  );
  const workspaceSet = new Set(workspacePaths);

  const newFiles = workspacePaths.filter(p => !cachedPaths.has(p));
  const removedPaths = Array.from(cachedPaths).filter(p => !workspaceSet.has(p));

  if (newFiles.length === 0 && removedPaths.length === 0) {
    logger.info('Delta scan: index is up to date');
    return;
  }

  logger.info(`Delta scan: ${newFiles.length} new, ${removedPaths.length} removed`);

  for (const filePath of removedPaths) {
    index.remove(filePath);
  }

  for (const filePath of newFiles) {
    try {
      const metadata = await fileIndexer.buildMetadata(filePath);
      index.add(metadata);
    } catch (err) {
      logger.error(`Failed to index new file ${filePath}`, err);
    }
  }

  await index.save(cachePath);
  logger.info(`Delta scan complete: index now has ${index.size} files`);
}

function startPeriodicStalenessCheck(
  index: MetadataIndex,
  fileIndexer: FileIndexer,
  scanner: FileScanner,
  config: ExtensionConfig,
  cachePath: string,
): NodeJS.Timeout {
  const INTERVAL_MS = 5 * 60 * 1000;

  return setInterval(async () => {
    try {
      const workspacePaths = await scanner.scanWorkspace(
        config.includePatterns,
        config.excludePatterns,
        config.rootFolderPath || undefined,
      );

      const buildTime = index.getBuildTime();
      if (buildTime === 0) return;

      const staleFiles: string[] = [];
      for (const filePath of workspacePaths) {
        try {
          const fileStat = await fs.stat(filePath);
          if (fileStat.mtimeMs > buildTime) {
            staleFiles.push(filePath);
          }
        } catch {
          // skip
        }
      }

      if (staleFiles.length === 0) return;

      logger.info(`Periodic check: ${staleFiles.length} files modified since last build`);

      for (const filePath of staleFiles) {
        try {
          const metadata = await fileIndexer.buildMetadata(filePath);
          index.add(metadata);
        } catch {
          // file may have been deleted
        }
      }

      await index.save(cachePath);
    } catch (err) {
      logger.error('Periodic staleness check failed', err);
    }
  }, INTERVAL_MS);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Boop activating');

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    logger.warn('No workspace folder — extension inactive');
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const cachePath = path.join(workspacePath, '.vscode', '.codebase-metadata.json');
  const folderCachePath = path.join(workspacePath, '.vscode', '.pookie-folders.json');

  const config = readConfig();
  const index = new MetadataIndex();
  const embeddings = new EmbeddingsEngine();
  const headerParser = new HeaderParser();
  const scanner = new FileScanner();
  const symbolExtractor = new SymbolExtractor();
  const fileIndexer = new FileIndexer(embeddings, headerParser, symbolExtractor, config.enableSymbolExtraction);
  const folderIndex = new FolderIndex();

  await index.load(cachePath);
  await folderIndex.load(folderCachePath);
  logger.info(`Loaded ${index.size} files, ${folderIndex.size()} folders from cache`);

  // No cache file in this workspace — ask user to scan
  try {
    await fs.access(cachePath);
  } catch {
    const scan = await vscode.window.showInformationMessage(
      'No index cache found in this workspace. Scan files now?',
      'Scan',
      'Later',
    );
    if (scan === 'Scan') {
      await vscode.commands.executeCommand('pookie-explorer.rebuildIndex');
    }
  }

  await deltaScan(index, fileIndexer, scanner, config, cachePath);

  let watcherDisposable: vscode.Disposable | undefined;
  if (config.enableFileWatcher) {
    const fileWatcher = new FileWatcher(index, fileIndexer, config.includePatterns, cachePath);
    watcherDisposable = fileWatcher.watch(workspaceFolder);
    context.subscriptions.push(watcherDisposable);
  }

  const stalenessTimer = startPeriodicStalenessCheck(
    index,
    fileIndexer,
    scanner,
    config,
    cachePath,
  );
  context.subscriptions.push({ dispose: () => clearInterval(stalenessTimer) });

  context.subscriptions.push(
    registerOpenByDescription(context, index, embeddings, config, workspacePath),
    registerAddHeader(context),
    registerRebuildIndex(
      context,
      index,
      fileIndexer,
      scanner,
      folderIndex,
      config,
      workspacePath,
      cachePath,
      folderCachePath,
      embeddings,
    ),
    registerConfigureProvider(context),
    logger,
  );

  const sidebarProvider = new PookieExplorerProvider(
    context.extensionUri,
    index,
    embeddings,
    config,
    scanner,
    fileIndexer,
    folderIndex,
    cachePath,
    folderCachePath,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PookieExplorerProvider.viewType, sidebarProvider),
  );

  logger.info('Boop activated');
}

export function deactivate(): void {
  logger.info('Boop deactivated');
}
