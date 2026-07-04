import * as vscode from 'vscode';
import { MetadataIndex } from '../services/metadataIndex';
import { EmbeddingsEngine } from '../services/embeddings';
import { LLMQueryEngine } from '../services/llmQuery';
import { ExtensionConfig, LLMCredentials, LLMProvider } from '../types/config';
import { PROVIDER_LABELS, PROVIDER_MODELS } from '../types/providers';
import { toQuickPickItems } from '../ui/quickPick';
import { validateQuery } from '../utils/validators';
import { logger } from '../services/logger';



async function promptForCredentials(
  config: ExtensionConfig,
): Promise<LLMCredentials | null> {
  const providerItems = (Object.keys(PROVIDER_LABELS) as LLMProvider[]).map((p) => ({
    label: PROVIDER_LABELS[p],
    description: config[`${p}ApiKey` as keyof ExtensionConfig]
      ? '(configured)'
      : '',
    provider: p,
  }));

  const picked = await vscode.window.showQuickPick(providerItems, {
    placeHolder: 'Select an LLM provider',
    title: 'Boop — Choose Provider',
  });

  if (!picked) return null;

  const provider = picked.provider as LLMProvider;

  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter your ${PROVIDER_LABELS[provider]} API key`,
    placeHolder: 'sk-...',
    password: true,
    title: `Boop — ${PROVIDER_LABELS[provider]} API Key`,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'API key is required';
      }
      return null;
    },
  });

  if (!apiKey) return null;

  const models = PROVIDER_MODELS[provider];
  let model: string;

  if (models.length > 0) {
    const modelItems = models.map((m) => ({
      label: m,
      description: m === models[0] ? '(default)' : '',
    }));

    const modelPick = await vscode.window.showQuickPick(modelItems, {
      placeHolder: 'Select a model',
      title: `Boop — ${PROVIDER_LABELS[provider]} Model`,
    });

    if (!modelPick) return null;
    model = modelPick.label;
  } else {
    const customModel = await vscode.window.showInputBox({
      prompt: `Enter the ${PROVIDER_LABELS[provider]} model name`,
      placeHolder: 'e.g., anthropic/claude-3-haiku, openai/gpt-4o, meta-llama/llama-3.1-8b-instruct',
      title: `Boop — ${PROVIDER_LABELS[provider]} Model`,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Model name is required';
        }
        return null;
      },
    });

    if (!customModel) return null;
    model = customModel.trim();
  }

  return { provider, apiKey: apiKey.trim(), model };
}

export function registerOpenByDescription(
  context: vscode.ExtensionContext,
  index: MetadataIndex,
  embeddings: EmbeddingsEngine,
  config: ExtensionConfig,
  workspacePath: string,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'boop.openByDescription',
    async () => {
      const rawQuery = await vscode.window.showInputBox({
        prompt: 'Describe the files you want to open',
        placeHolder: 'e.g., "sidebar component logic" or "authentication middleware"',
      });

      if (!rawQuery) return;

      let query: string;
      try {
        query = validateQuery(rawQuery);
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : 'Invalid query');
        return;
      }

      const searchMode = await vscode.window.showQuickPick(
        [
          {
            label: 'Embeddings',
            description: 'Fast, offline, no API key needed',
            mode: 'embeddings' as const,
          },
          {
            label: 'LLM (AI-powered)',
            description: 'Smarter results, requires API key',
            mode: 'llm' as const,
          },
        ],
        {
          placeHolder: 'How do you want to search?',
          title: 'Boop — Search Mode',
        },
      );

      if (!searchMode) return;

      if (searchMode.mode === 'llm') {
        await searchWithLLM(query, index, embeddings, config, workspacePath);
      } else {
        await searchWithEmbeddings(query, index, embeddings, config, workspacePath);
      }
    },
  );
}

async function searchWithEmbeddings(
  query: string,
  index: MetadataIndex,
  embeddings: EmbeddingsEngine,
  config: ExtensionConfig,
  workspacePath: string,
): Promise<void> {
  let results: Awaited<ReturnType<typeof embeddings.searchByEmbedding>> | undefined;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Searching with embeddings...',
      cancellable: false,
    },
    async () => {
      try {
        results = await embeddings.searchByEmbedding(
          query,
          index.getAll(),
          config.maxResultsShown,
          undefined,
          true,
        );
      } catch (err) {
        logger.error('Embeddings search failed', err);
        vscode.window.showErrorMessage('Search failed. Check Output > Boop for details.');
      }
    },
  );

  await showResults(results, workspacePath);
}

async function searchWithLLM(
  query: string,
  index: MetadataIndex,
  embeddings: EmbeddingsEngine,
  config: ExtensionConfig,
  _workspacePath: string,
): Promise<void> {
  const llm = new LLMQueryEngine(config);

  if (!llm.isConfigured()) {
    const creds = await promptForCredentials(config);
    if (!creds) return;
    llm.setRuntimeCredentials(creds);
  } else {
    const changeKey = await vscode.window.showQuickPick(
      [
        { label: `Use configured ${PROVIDER_LABELS[config.llmProvider]} key`, useExisting: true },
        { label: 'Enter a different key', useExisting: false },
      ],
      {
        placeHolder: `Current provider: ${PROVIDER_LABELS[config.llmProvider]}`,
        title: 'Boop — API Key',
      },
    );

    if (!changeKey) return;

    if (!changeKey.useExisting) {
      const creds = await promptForCredentials(config);
      if (!creds) return;
      llm.setRuntimeCredentials(creds);
    }
  }

  const allFiles = index.getAll();

  let results: Awaited<ReturnType<typeof llm.searchFilesWithLLM>> | undefined;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Searching with LLM...',
      cancellable: false,
    },
    async () => {
      try {
        results = await llm.searchFilesWithLLM(query, allFiles, embeddings);
      } catch (err) {
        logger.error('LLM search failed', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        vscode.window.showErrorMessage(`LLM search failed: ${msg}`);
      }
    },
  );

  if (results && results.length > 0) {
    const items = results.map((r) => ({
      label: r.file.fileName,
      description: r.file.purpose || 'LLM match',
      filePath: r.file.path,
      score: r.score,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: `${results.length} results — select files to open`,
      matchOnDescription: true,
    });

    if (selected) {
      for (const item of selected) {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.filePath));
      }
    }
  } else {
    vscode.window.showInformationMessage('No matching files found for your query.');
  }
}

async function showResults(
  results: Awaited<ReturnType<EmbeddingsEngine['searchByEmbedding']>> | undefined,
  workspacePath: string,
): Promise<void> {
  if (!results || results.length === 0) {
    vscode.window.showInformationMessage('No matching files found for your query.');
    return;
  }

  const items = toQuickPickItems(results, workspacePath);
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: `${results.length} results — select files to open`,
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!selected || selected.length === 0) return;

  for (const item of selected) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.filePath));
  }
}
