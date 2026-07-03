import { LLMProvider } from './config';

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

export const PROVIDER_MODELS: Record<LLMProvider, string[]> = {
  gemini: ['gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-3-flash', 'gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'o3', 'o4-mini'],
  openrouter: [],
};

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-3.5-flash',
  openai: 'gpt-5.5',
  openrouter: 'anthropic/claude-3-haiku',
};
