import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { MetadataIndex } from '../services/metadataIndex';
import { EmbeddingsEngine } from '../services/embeddings';
import { FileIndexer } from '../services/fileIndexer';
import { LLMQueryEngine } from '../services/llmQuery';
import { FileScanner } from '../services/fileScanner';
import { FolderIndex } from '../services/folderIndex';
import {
  parseQuery,
  getFilterTypeSuggestions,
  getFilterValueSuggestions,
} from '../services/queryParser';
import { applyFilters } from '../services/searchFilter';
import { ExtensionConfig, LLMProvider } from '../types/config';
import { readConfig } from '../extension';
import { logger } from '../services/logger';

export class BoopProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'boop.sidebar';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly index: MetadataIndex,
    private readonly embeddings: EmbeddingsEngine,
    private readonly config: ExtensionConfig,
    private readonly scanner: FileScanner,
    private readonly fileIndexer: FileIndexer,
    private readonly folderIndex: FolderIndex,
    private readonly cachePath: string,
    private readonly folderCachePath: string,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'search':
          await this._handleSearch(message.query, message.searchMode, webviewView.webview);
          break;
        case 'configureProvider':
          await this._handleConfigureProvider(
            message.provider,
            message.apiKey,
            message.model,
            webviewView.webview,
          );
          break;
        case 'openFile':
          await this._handleOpenFile(message.filePath);
          break;
        case 'getInitialState':
          this._sendInitialState(webviewView.webview);
          break;
        case 'rescan':
          await this._handleRescan(webviewView.webview);
          break;
        case 'saveConfig':
          await this._handleSaveConfig(message, webviewView.webview);
          break;
        case 'browseFolder':
          await this._handleBrowseFolder(webviewView.webview);
          break;
        case 'getFilterTypeSuggestions':
          this._handleGetFilterTypeSuggestions(message.partial, webviewView.webview);
          break;
        case 'getFilterSuggestions':
          this._handleGetFilterValueSuggestions(
            message.filterType,
            message.partial,
            webviewView.webview,
          );
          break;
        case 'updateConfig':
          await this._handleUpdateConfig(message.key, message.value, webviewView.webview);
          break;
        case 'copyToClipboard':
          await vscode.env.clipboard.writeText(message.text);
          break;
      }
    });

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  private async _checkCacheExists(): Promise<boolean> {
    try {
      await fs.access(this.cachePath);
      return true;
    } catch {
      return false;
    }
  }

  private async _sendInitialState(webview: vscode.Webview): Promise<void> {
    const providerStatus: Record<LLMProvider, { configured: boolean; model: string }> = {
      gemini: {
        configured: Boolean(this.config.geminiApiKey),
        model: this.config.geminiModel || 'gemini-3.5-flash',
      },
      openai: {
        configured: Boolean(this.config.openaiApiKey),
        model: this.config.openaiModel || 'gpt-5.5',
      },
      openrouter: {
        configured: Boolean(this.config.openRouterApiKey),
        model: this.config.openRouterModel || 'anthropic/claude-3-haiku',
      },
    };

    const hasCache = await this._checkCacheExists();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const effectivePath = this.config.rootFolderPath || workspaceFolder?.uri.fsPath || '';

    webview.postMessage({
      type: 'initialState',
      currentProvider: this.config.llmProvider,
      searchMethod: this.config.searchMethod,
      providerStatus,
      indexSize: this.index.size,
      maxResultsShown: this.config.maxResultsShown,
      rootFolderPath: this.config.rootFolderPath,
      workspacePath: effectivePath,
      hasWorkspace: !!workspaceFolder,
      enableSymbolExtraction: this.config.enableSymbolExtraction,
      hasCache,
    });
  }

  private async _handleSearch(
    query: string,
    searchMode: 'embeddings' | 'llm',
    webview: vscode.Webview,
  ): Promise<void> {
    if (!query || query.trim().length === 0) {
      webview.postMessage({ type: 'error', message: 'Please enter a query.' });
      return;
    }

    if (this.index.size === 0) {
      webview.postMessage({
        type: 'error',
        message: 'Index is empty. Run "Rebuild Metadata Index" first.',
      });
      return;
    }

    const { text, filters } = parseQuery(query);

    if (Object.keys(filters).length > 0 && (!text || text.length === 0)) {
      const allFiles = this.index.getAll();
      const filtered = applyFilters(allFiles, filters);
      const items = filtered.slice(0, this.config.maxResultsShown).map((f, i) => ({
        label: f.fileName,
        description: f.purpose,
        filePath: f.path,
        score: 1.0,
        language: f.language,
        rank: i + 1,
      }));
      webview.postMessage({ type: 'results', items, query });
      return;
    }

    const searchQuery = text || query;
    webview.postMessage({ type: 'searching', message: `Searching with ${searchMode}...` });

    try {
      let filesToSearch = this.index.getAll();

      if (Object.keys(filters).length > 0) {
        filesToSearch = applyFilters(filesToSearch, filters);
      }

      if (searchMode === 'embeddings') {
        const results = await this.embeddings.searchByEmbedding(
          searchQuery,
          filesToSearch,
          this.config.maxResultsShown,
          this.folderIndex,
          true,
        );

        const items = results.map((r, i) => ({
          label: r.file.fileName,
          description: r.file.purpose,
          filePath: r.file.path,
          score: r.score,
          language: r.file.language,
          rank: i + 1,
        }));

        webview.postMessage({ type: 'results', items, query });
      } else {
        const llm = new LLMQueryEngine(this.config);

        if (!llm.isConfigured()) {
          webview.postMessage({
            type: 'warning',
            message: `No API key set for ${this.config.llmProvider}. Click the gear icon to configure.`,
          });
          return;
        }

        const results = await llm.searchFilesWithLLM(
          searchQuery,
          filesToSearch,
          this.embeddings,
          this.folderIndex,
        );

        const items = results.map((r, i) => ({
          label: r.file.fileName,
          description: r.file.purpose,
          filePath: r.file.path,
          score: r.score,
          language: r.file.language,
          rank: i + 1,
        }));

        webview.postMessage({ type: 'results', items, query });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Search failed', err);
      webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleOpenFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Active);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open file';
      logger.error('Failed to open file', err);
      if (this._view) {
        this._view.webview.postMessage({ type: 'error', message: msg });
      }
    }
  }

  private async _handleConfigureProvider(
    provider: LLMProvider,
    apiKey: string,
    model: string,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const cfg = vscode.workspace.getConfiguration('boop');

      const providerKeyMap: Record<LLMProvider, { key: string; model: string }> = {
        gemini: { key: 'geminiApiKey', model: 'geminiModel' },
        openai: { key: 'openaiApiKey', model: 'openaiModel' },
        openrouter: { key: 'openRouterApiKey', model: 'openRouterModel' },
      };

      const mapping = providerKeyMap[provider];

      await cfg.update('llmProvider', provider, vscode.ConfigurationTarget.Global);
      await cfg.update(mapping.key, apiKey, vscode.ConfigurationTarget.Global);

      if (mapping.model && model) {
        await cfg.update(mapping.model, model, vscode.ConfigurationTarget.Global);
      }

      // Reload config from settings to get persisted values
      const freshConfig = readConfig();
      Object.assign(this.config, freshConfig);

      webview.postMessage({
        type: 'providerConfigured',
        provider,
        model,
        message: `${provider} configured successfully with model ${model}.`,
      });

      this._sendInitialState(webview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleRescan(webview: vscode.Webview): Promise<void> {
    try {
      this.index.clear();

      webview.postMessage({
        type: 'scanProgress',
        current: 0,
        total: 0,
        message: 'Scanning files...',
      });

      const filePaths = await this.scanner.scanWorkspace(
        this.config.includePatterns,
        this.config.excludePatterns,
        this.config.rootFolderPath || undefined,
      );

      const total = filePaths.length;
      logger.info(`Rebuilding index for ${total} files`);

      let processed = 0;
      for (const filePath of filePaths) {
        try {
          const metadata = await this.fileIndexer.buildMetadata(filePath);
          this.index.add(metadata);
        } catch (err) {
          logger.warn(`Could not index ${filePath}`);
        }
        processed++;

        if (processed % 5 === 0 || processed === total) {
          webview.postMessage({
            type: 'scanProgress',
            current: processed,
            total,
            message: `Indexing... ${processed}/${total}`,
          });
        }
      }

      await this.index.save(this.cachePath);

      webview.postMessage({
        type: 'scanProgress',
        current: total,
        total,
        message: 'Building folder index...',
      });

      this.folderIndex.buildFromFiles(this.index.getAll());
      for (const folder of this.folderIndex.getAll()) {
        try {
          const folderEmbedding = await this.embeddings.embedText(
            this.folderIndex.folderText(folder),
          );
          folder.embedding = folderEmbedding;
        } catch (err) {
          logger.warn(`Could not embed folder ${folder.folderPath}`);
        }
      }
      await this.folderIndex.save(this.folderCachePath);

      logger.info(`Index rebuilt: ${this.index.size} files, ${this.folderIndex.size()} folders`);

      webview.postMessage({
        type: 'rescanComplete',
        indexSize: this.index.size,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rescan failed';
      logger.error('Rescan failed', err);
      webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleSaveConfig(
    message: { rootPath: string; maxResults: number; symbolExtraction: boolean },
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const cfg = vscode.workspace.getConfiguration('boop');

      await cfg.update('rootFolderPath', message.rootPath, vscode.ConfigurationTarget.Global);
      await cfg.update('maxResultsShown', message.maxResults, vscode.ConfigurationTarget.Global);
      await cfg.update(
        'enableSymbolExtraction',
        message.symbolExtraction,
        vscode.ConfigurationTarget.Global,
      );

      this.config.rootFolderPath = message.rootPath;
      this.config.maxResultsShown = message.maxResults;
      this.config.enableSymbolExtraction = message.symbolExtraction;

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const effectivePath = message.rootPath || workspaceFolder?.uri.fsPath || '';

      webview.postMessage({
        type: 'rootPathSet',
        rootPath: message.rootPath,
        workspacePath: effectivePath,
        message: `Config saved. Rescanning...`,
      });

      await this._handleRescan(webview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save config';
      webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleBrowseFolder(webview: vscode.Webview): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select Workspace Root Folder',
    });

    if (result && result.length > 0) {
      webview.postMessage({
        type: 'folderSelected',
        folderPath: result[0].fsPath,
      });
    }
  }

  private _handleGetFilterTypeSuggestions(partial: string, webview: vscode.Webview): void {
    const suggestions = getFilterTypeSuggestions(partial || '');
    webview.postMessage({
      type: 'filterSuggestions',
      items: suggestions.map((s) => {
        const [label, description] = s.split(': ');
        return { label: `@${label}:`, description, type: 'filterType', value: label };
      }),
    });
  }

  private _handleGetFilterValueSuggestions(
    filterType: string,
    partial: string,
    webview: vscode.Webview,
  ): void {
    const values = getFilterValueSuggestions(
      filterType,
      partial || '',
      this.index,
      this.folderIndex,
    );
    webview.postMessage({
      type: 'filterSuggestions',
      items: values.map((v) => ({
        label: v,
        description: '',
        type: 'filterValue',
        value: v,
      })),
    });
  }

  private async _handleUpdateConfig(
    key: string,
    value: boolean | number,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const cfg = vscode.workspace.getConfiguration('boop');
      await cfg.update(key, value, vscode.ConfigurationTarget.Global);

      const freshConfig = readConfig();
      Object.assign(this.config, freshConfig);

      webview.postMessage({
        type: 'configUpdated',
        key,
        value,
        message: `Setting updated: ${key} = ${value}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update configuration';
      webview.postMessage({ type: 'error', message: msg });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'sidebar', 'webview.js'),
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'sidebar.css'),
    );

    const indexHtmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'sidebar', 'index.html');
    const indexHtml = require('fs').readFileSync(indexHtmlPath.fsPath, 'utf8');

    return indexHtml
      .replace('${scriptUri}', scriptUri.toString())
      .replace('${styleUri}', styleUri.toString());
  }
}
