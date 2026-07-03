import * as vscode from 'vscode';
import { LLMProvider } from '../types/config';
import { PROVIDER_LABELS, PROVIDER_MODELS } from '../types/providers';
import { logger } from '../services/logger';

export function registerConfigureProvider(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'pookie-explorer.configureProvider',
    async () => {
      const providerItems = (Object.keys(PROVIDER_LABELS) as LLMProvider[]).map((p) => ({
        label: PROVIDER_LABELS[p],
        provider: p,
      }));

      const picked = await vscode.window.showQuickPick(providerItems, {
        placeHolder: 'Select an LLM provider',
        title: 'Boop — Configure Provider',
      });

      if (!picked) return;

      const provider = picked.provider as LLMProvider;

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${PROVIDER_LABELS[provider]} API key`,
        placeHolder: provider === 'gemini' ? 'AIza...' : 'sk-...',
        password: true,
        title: `Boop — ${PROVIDER_LABELS[provider]} API Key`,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'API key is required';
          }
          return null;
        },
      });

      if (!apiKey) return;

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

        if (!modelPick) return;
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

        if (!customModel) return;
        model = customModel.trim();
      }

      const cfg = vscode.workspace.getConfiguration('pookie-explorer');

      const providerKeyMap: Record<LLMProvider, { key: string; model: string }> = {
        gemini: { key: 'geminiApiKey', model: '' },
        openai: { key: 'openaiApiKey', model: 'openaiModel' },
        openrouter: { key: 'openRouterApiKey', model: 'openRouterModel' },
      };

      const mapping = providerKeyMap[provider];

      await cfg.update('llmProvider', provider, vscode.ConfigurationTarget.Global);
      await cfg.update(mapping.key, apiKey.trim(), vscode.ConfigurationTarget.Global);

      if (mapping.model) {
        await cfg.update(mapping.model, model, vscode.ConfigurationTarget.Global);
      }

      logger.info(`Configured provider: ${provider}, model: ${model}`);
      vscode.window.showInformationMessage(
        `Boop: ${PROVIDER_LABELS[provider]} configured with model ${model}.`,
      );
    },
  );
}
