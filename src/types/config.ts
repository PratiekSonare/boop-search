export type LLMProvider = 'gemini' | 'openai' | 'openrouter';

export interface LLMCredentials {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

export interface ExtensionConfig {
  searchMethod: 'embeddings' | 'llm';
  llmProvider: LLMProvider;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  maxResultsShown: number;
  autoSummarizeOnStartup: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  enableFileWatcher: boolean;
  enableSymbolExtraction: boolean;
  rootFolderPath: string;
}
