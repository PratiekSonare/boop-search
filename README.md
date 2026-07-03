![Boop](resources/boop-header.svg)

**Boop** lets you open files in your codebase using natural language. Just describe what you're looking for — no need to remember exact file names or folder paths.

Powered by local embeddings (`Xenova/all-MiniLM-L6-v2`) running entirely offline via `@xenova/transformers` (~45 MB unpacked, ~22 MB for the ONNX model itself). No data leaves your machine.

> [!NOTE]
> On first run, the embedding model (~22 MB) is downloaded automatically from Hugging Face Hub and cached locally.

## Features

- **Natural language file search** — "auth middleware", "sidebar component", "database config"
- **Semantic embeddings** — finds files by meaning, not just keywords
- **LLM-powered search** — optional re-ranking via Gemini, OpenAI, or OpenRouter
- **Rich filters** — `@lang: py`, `@ext: .ts`, `@inFolder: src/`, `@symbol: getUser`, `@modified: today`
- **Auto-generated file headers** — add `@purpose`, `@category`, `@related` tags to files
- **Symbol extraction** — functions, classes, interfaces indexed from LSP
- **Delta indexing & file watching** — fast incremental updates on save/create/delete

## How to Use

1. **Install** the extension from the VS Code Marketplace.
2. **Open the sidebar** — click the Boop icon in the activity bar.
3. **Describe what you need** — type a natural language query in the search bar (e.g., `user login handler`).
4. **Pick a search mode:**
   - *Embeddings* — fast, fully offline, no setup required
   - *LLM* — smarter results; requires an API key (Gemini, OpenAI, or OpenRouter)
5. **Click a result** to open the file, or use the command palette (`Ctrl+Shift+P`) for:
   - `Boop: Open Files by Description` — inline quick-pick search
   - `Boop: Add File Purpose Header` — add structured headers to the active file
   - `Boop: Rebuild Metadata Index` — full rescan
   - `Boop: Configure LLM Provider` — set API keys and models

## Requirements

- VS Code 1.85+
- Node.js 18+
- *(Optional)* An API key for Gemini, OpenAI, or OpenRouter if using LLM mode

## Settings

| Setting | Description |
|---|---|
| `pookie-explorer.searchMethod` | `embeddings` (default, offline) or `llm` |
| `pookie-explorer.llmProvider` | `gemini`, `openai`, or `openrouter` |
| `pookie-explorer.geminiApiKey` | Google Gemini API key |
| `pookie-explorer.openaiApiKey` | OpenAI API key |
| `pookie-explorer.openRouterApiKey` | OpenRouter API key |
| `pookie-explorer.maxResultsShown` | Max files in results (1–20) |
| `pookie-explorer.rootFolderPath` | Subdirectory to index (empty = whole workspace) |
| `pookie-explorer.includePatterns` | Glob patterns to include |
| `pookie-explorer.excludePatterns` | Glob patterns to exclude |
| `pookie-explorer.autoSummarizeOnStartup` | Auto-generate `@purpose` headers on first run |

## Screenshots

<!-- TODO: Add screenshot here -->

---

Built with [@xenova/transformers](https://github.com/nick-writes-code/transformers.js) and [onnxruntime](https://onnxruntime.ai/).
