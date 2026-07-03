import { FileMetadata, SearchResult } from '../types/metadata';
import { ExtensionConfig, LLMCredentials, LLMProvider } from '../types/config';
import { logger } from './logger';
import { EmbeddingsEngine } from './embeddings';
import { FolderIndex } from './folderIndex';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  choices: { message: { content: string } }[];
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-3.5-flash',
  openai: 'gpt-5.5',
  openrouter: 'anthropic/claude-3-haiku',
};

export class LLMQueryEngine {
  private provider: LLMProvider;
  private runtimeCredentials: LLMCredentials | null = null;

  constructor(private readonly config: ExtensionConfig) {
    this.provider = config.llmProvider;
  }

  setRuntimeCredentials(creds: LLMCredentials): void {
    this.runtimeCredentials = creds;
    this.provider = creds.provider;
  }

  isConfigured(): boolean {
    if (this.runtimeCredentials) {
      return Boolean(this.runtimeCredentials.apiKey);
    }
    switch (this.provider) {
      case 'gemini':
        return Boolean(this.config.geminiApiKey);
      case 'openai':
        return Boolean(this.config.openaiApiKey);
      case 'openrouter':
        return Boolean(this.config.openRouterApiKey);
      default:
        return false;
    }
  }

  private getApiKey(): string {
    if (this.runtimeCredentials) {
      return this.runtimeCredentials.apiKey;
    }
    switch (this.provider) {
      case 'gemini':
        return this.config.geminiApiKey;
      case 'openai':
        return this.config.openaiApiKey;
      case 'openrouter':
        return this.config.openRouterApiKey;
      default:
        return '';
    }
  }

  private getModel(): string {
    if (this.runtimeCredentials) {
      return this.runtimeCredentials.model || DEFAULT_MODELS[this.provider];
    }
    switch (this.provider) {
      case 'gemini':
        return this.config.geminiModel || DEFAULT_MODELS.gemini;
      case 'openai':
        return this.config.openaiModel || DEFAULT_MODELS.openai;
      case 'openrouter':
        return this.config.openRouterModel || DEFAULT_MODELS.openrouter;
      default:
        return '';
    }
  }

  private getBaseUrl(): string {
    switch (this.provider) {
      case 'gemini':
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.getModel()}`;
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      default:
        return '';
    }
  }

  private async callLLM(messages: ChatMessage[]): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(`No API key configured for ${this.provider}`);
    }

    if (this.provider === 'gemini') {
      return this.callGemini(messages, apiKey);
    }

    return this.callOpenAICompatible(messages, apiKey);
  }

  private async callGemini(messages: ChatMessage[], apiKey: string): Promise<string> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}:generateContent?key=${apiKey}`;

    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  private async callOpenAICompatible(
    messages: ChatMessage[],
    apiKey: string,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    if (this.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/pookie-explorer';
      headers['X-Title'] = 'Boop';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.getModel(),
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.provider} API error: ${response.status} - ${error}`);
    }

    const data: LLMResponse = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async searchFilesWithLLM(
    query: string,
    metadataIndex: FileMetadata[],
    embeddings?: EmbeddingsEngine,
    folderIndex?: FolderIndex,
  ): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error(
        `LLM search requires an API key. Configure ${this.provider} API key in settings.`,
      );
    }

    let candidateFiles = metadataIndex;

    if (embeddings && metadataIndex.length > 0) {
      const preFilterCount = Math.max(1, Math.floor(metadataIndex.length / 5));
      logger.info(`Pre-filtering ${metadataIndex.length} files to top ${preFilterCount} by embeddings`);

      const preFiltered = await embeddings.searchByEmbedding(query, metadataIndex, preFilterCount, folderIndex);
      candidateFiles = preFiltered.map((r) => r.file);

      logger.info(`Pre-filtered to ${candidateFiles.length} candidates for LLM`);
    }

    const fileList = candidateFiles
      .map((f, i) => `${i + 1}. ${f.fileName}\n   Path: ${f.path}\n   Purpose: ${f.purpose}\n   Category: ${f.category}`)
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code search assistant. Given a user query and a list of candidate files (already ranked by semantic similarity), determine which files are most relevant to the query.

Return a JSON object with:
- "files": array of file paths (in order of relevance, most relevant first)
- "reasoning": brief explanation of why these files match

Return ONLY valid JSON, no other text.`,
      },
      {
        role: 'user',
        content: `User query: "${query}"

Candidate files (ranked by semantic similarity):

${fileList}

Which of these files are most relevant to the query? Return the matching files as JSON.`,
      },
    ];

    const response = await this.callLLM(messages);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in LLM response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const filePaths: string[] = parsed.files || [];
      const fileMap = new Map(candidateFiles.map((f) => [f.path, f]));

      return filePaths
        .filter((p) => fileMap.has(p))
        .map((p, i) => ({
          file: fileMap.get(p)!,
          score: Math.max(0.9 - i * 0.05, 0.5),
          reasoning: parsed.reasoning || 'LLM match',
        }));
    } catch (err) {
      logger.error('Failed to parse LLM response', err);
      return [];
    }
  }

  async generateFilePurpose(
    fileName: string,
    folderPath: string,
    preview: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        `LLM auto-summarization requires an API key. Configure ${this.provider} API key in settings.`,
      );
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You generate one-line purpose statements for code files. Be concise. Focus on WHAT the file does, not HOW. Format: "Description for X" or "Component for Y". No quotes, no period.',
      },
      {
        role: 'user',
        content: `File: ${fileName}\nFolder: ${folderPath}\nCode preview:\n${preview}\n\nGenerate a one-line purpose:`,
      },
    ];

    const response = await this.callLLM(messages);
    return response.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
  }
}
