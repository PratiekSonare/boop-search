# LLM-Based File Explorer VS Code Extension

## Overview

A VS Code extension that intelligently opens relevant files based on natural language queries by reading **file headers** and maintaining a lightweight **metadata index**, solving navigation challenges in large projects and monorepos.

**Example**:

- Query: "open the frontend side of sidebar component"
- Action: Searches metadata index → Opens `Sidebar.tsx`, `SidebarStyles.css`, etc.

---

## Core Concept: File Headers + Metadata Index

**Key Insight**: Don't parse file internals—just describe file _intent_ in a header comment, then use embeddings/LLM for semantic matching on file-level queries.

No AST parsing. No internal function analysis. Just: _"What is this file for?"_

---

## Architecture: File Header Format

### Optional: Manual File Headers

Add a simple comment block at the top of each file (completely optional):

```typescript
/**
 * @file Sidebar.tsx
 * @purpose React component - Main sidebar UI layout and structure
 * @category frontend/components
 * @related SidebarLogic.js, useSidebar.ts
 */

export function Sidebar() { ... }
```

Or for JavaScript:

```javascript
/**
 * @file SidebarLogic.js
 * @purpose Business logic for sidebar state management and event handlers
 * @category frontend/logic
 * @related Sidebar.tsx, sidebarReducer.js
 */
```

**Why this format**:

- Language-agnostic (works for JS/TS/Python/Go/etc)
- Minimal overhead (just a doc block)
- Parseable by regex, not complex parsing
- Optional—missing headers don't break anything (LLM auto-generates summaries)

---

## Pipeline: Index Building + Auto-Summarization

### Step 1: Recursive Scan + Header Extraction

```
On Extension Startup:
├─ Scan workspace recursively
├─ For each file:
│  ├─ Check for @purpose header comment (regex match)
│  ├─ If found: Parse @purpose, @category, @related
│  └─ If NOT found: Queue for LLM auto-summarization
└─ Build preliminary metadata index
```

### Step 2: LLM Auto-Summarization (Fill Missing Headers)

For files without headers, use LLM to generate summaries:

```
Input to LLM:
- File name: "SidebarLogic.js"
- Folder path: "src/frontend/logic/"
- First 50 lines of file (or less if small)

LLM Prompt:
"Based on the file name, folder location, and code snippet,
provide a one-line purpose statement for this file.
Focus on WHAT this file does, not HOW.
Format: 'Business logic for X' or 'React component for Y'"

Output:
"Business logic for sidebar state management and event handlers"
```

**Store in metadata**:

```typescript
interface FileMetadata {
  path: string; // "src/frontend/logic/SidebarLogic.js"
  purpose: string; // Auto-generated or from @purpose tag
  purposeSource: "manual" | "auto"; // Track origin
  category: string; // From @category or inferred
  related: string[]; // From @related tag
  folderPath: string; // "src/frontend/logic"
  fileName: string; // "SidebarLogic.js"
  language: string; // "javascript"
}
```

### Step 3: Cache the Metadata Index

```
Save to: .vscode/.codebase-metadata.json
{
  "version": 1,
  "buildTime": "2026-05-09T10:30:00Z",
  "files": [
    {
      "path": "src/components/Sidebar.tsx",
      "purpose": "React component - Main sidebar UI layout",
      "purposeSource": "auto",
      "category": "frontend/components",
      "folderPath": "src/components"
    },
    { ... }
  ]
}
```

**On subsequent startups**: Load cached index (instant), only re-scan if files changed.

---

## Query Resolution: Two Approaches

### Approach A: Embeddings-Based (Fast, No API Calls)

```
User Query: "open the frontend side of sidebar component"
    ↓ Embed query + embed each file's [name + purpose + category]
    ↓ Find top-3 by cosine similarity
    ↓ Optional: filter by category if user specifies
    ↓ Show user quick-pick, open selected files
```

**Pros**:

- Fast (instant results)
- Works offline
- No API costs
- Predictable latency

**Cons**:

- May miss nuanced queries
- Requires embedding model (lightweight, ~30MB)

### Approach B: LLM-Powered (Smarter, Better UX)

```
User Query: "open only logic files for sidebar"
    ↓ Build prompt with [folder structure] + [metadata index] + [query]
    ↓ Send to LLM with context
    ↓ LLM reasons: "user wants logic files, sidebar is in components"
    ↓ LLM returns: structured JSON {"files": [...], "reasoning": "..."}
    ↓ Show user results
```

**Sample LLM Prompt**:

```
Your task: Help the user find files in their codebase.

Project Folder Structure:
src/
  components/
    - Sidebar.tsx (purpose: "React component - sidebar UI")
    - SidebarStyles.css (purpose: "Styling for sidebar")
  logic/
    - SidebarLogic.js (purpose: "Business logic for sidebar state")
  hooks/
    - useSidebar.ts (purpose: "Custom hook for sidebar")

User Query: "open only logic files for sidebar"

Return JSON:
{"files": ["src/logic/SidebarLogic.js"], "confidence": 0.95}
```

**Pros**:

- Handles complex queries
- Better accuracy
- Natural language understanding

**Cons**:

- LLM latency
- API calls (if using cloud)
- Token costs

---

## Implementation Pipeline

```
┌─────────────────────────────────────────┐
│   Extension Activation (First Time)     │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   Recursive File Scan                   │
│   ├─ Extract existing @purpose headers  │
│   └─ Identify files without headers     │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   LLM Batch: Auto-Summarize Headers     │
│   ├─ Sample 50 lines per file           │
│   ├─ Call LLM in batches (10-20 files)  │
│   ├─ Parallel requests to avoid timeout │
│   └─ Parse responses → metadata         │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   Build Metadata Index                  │
│   └─ Merge manual headers + auto-gen    │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   Cache to .vscode/                     │
│   └─ Instant reload on next startup     │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   Ready: Handle User Queries            │
│   ├─ Embeddings or LLM search           │
│   └─ Show quick-pick, open files        │
└─────────────────────────────────────────┘
```

---

## Key Implementation Details

### LLM Batch Processing (Avoiding Timeouts)

```typescript
async function autoSummarizeFiles(files: string[], llmProvider: LLMClient) {
  const batchSize = 15; // Process 15 files per batch
  const batches = chunk(files, batchSize);

  for (const batch of batches) {
    // Parallel requests within batch
    const promises = batch.map((file) => {
      const preview = readFilePreview(file, 50); // First 50 lines
      return llmProvider.generateSummary({
        fileName: basename(file),
        folderPath: dirname(file),
        codePreview: preview,
      });
    });

    const results = await Promise.all(promises);
    updateMetadataIndex(batch, results);
  }
}
```

### Inferring Category from Folder Structure

**Fallback when `@category` is missing**:

```typescript
function inferCategory(filePath: string): string {
  const folderSegments = filePath.split("/");

  // Map folder names to categories
  const categoryMap = {
    components: "frontend/components",
    hooks: "frontend/hooks",
    logic: "frontend/logic",
    utils: "utilities",
    models: "data/models",
    services: "backend/services",
  };

  for (const segment of folderSegments) {
    if (categoryMap[segment]) return categoryMap[segment];
  }

  return "misc"; // Default
}
```

### File Watcher for Incremental Updates

```typescript
// Watch for new/deleted/modified files
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(workspaceFolder, "**/*.{ts,tsx,js,jsx,py}"),
);

watcher.onDidCreate(async (uri) => {
  // New file: auto-summarize and add to index
  const summary = await generateSummary(uri.fsPath);
  addToMetadataIndex(uri.fsPath, summary);
});

watcher.onDidDelete((uri) => {
  // Deleted file: remove from index
  removeFromMetadataIndex(uri.fsPath);
});
```

---

## Query Handling: User Interaction

```typescript
async function handleFileQuery() {
  // Show input box
  const query = await vscode.window.showInputBox({
    prompt: "Describe the files you want to open",
    placeHolder: 'e.g., "sidebar component logic"',
  });

  if (!query) return;

  // Search (embeddings or LLM)
  const results = await searchFiles(query, metadataIndex);

  // Show quick-pick
  const selected = await vscode.window.showQuickPick(results, {
    canPickMany: true,
    placeHolder: "Select files to open",
  });

  // Open selected files
  if (selected) {
    for (const file of selected) {
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(file.path),
      );
    }
  }
}
```

---

## Effort Estimate

| Component                          | Effort        | Notes                                        |
| ---------------------------------- | ------------- | -------------------------------------------- |
| File scanner + header parser       | 1 day         | Recursive scan + regex                       |
| LLM auto-summarization pipeline    | 1-2 days      | Batch processing, error handling             |
| Metadata index + caching           | 0.5 days      | JSON serialization                           |
| Embeddings search                  | 1 day         | Use existing library (sentence-transformers) |
| LLM query handler (optional)       | 1 day         | Prompt engineering                           |
| File watcher + incremental updates | 1 day         | VS Code API                                  |
| UI/UX (quick-pick, input)          | 0.5 days      | VS Code built-ins                            |
| **Total MVP**                      | **~5-6 days** | With auto-summarization                      |

---

## Why This Approach Works

| Factor                   | Benefit                                        |
| ------------------------ | ---------------------------------------------- |
| File headers (optional)  | Gives users explicit control over descriptions |
| LLM auto-summarization   | Fills gaps, no manual work required            |
| Metadata caching         | Instant second startup, only scan on changes   |
| Embeddings search        | Fast, offline-capable fallback                 |
| Folder structure context | Helps narrow results (category filtering)      |
| No AST parsing           | Simple, fast, maintainable                     |
| Incremental updates      | Always accurate without full rescans           |

---

## Configuration & Customization

### Extension Settings

```json
{
  "llm-file-explorer.searchMethod": "embeddings", // or "llm"
  "llm-file-explorer.llmProvider": "openai", // or "local"
  "llm-file-explorer.maxResultsShown": 5,
  "llm-file-explorer.autoSummarizeOnStartup": true,
  "llm-file-explorer.includePatterns": ["src/**", "lib/**"],
  "llm-file-explorer.excludePatterns": ["node_modules/**", ".next/**"]
}
```

### Commands

```
cmd+shift+p → "Open Files by Description"
  Opens input box for natural language query

cmd+shift+p → "Add File Purpose Header"
  Inserts template @purpose header in current file

cmd+shift+p → "Rebuild Metadata Index"
  Forces full rescan (useful after large refactors)
```

---

## LLM Provider Options

### Embeddings (Recommended for MVP)

- **Local**: sentence-transformers (open-source, ~30MB)
- **Cloud**: OpenAI embeddings API (~$0.00002 per query)

### LLM (Optional layer for complex queries)

- **Local**: Ollama, LM Studio (privacy, offline)
- **Cloud**: OpenAI GPT-4, Claude, Gemini (better reasoning)

---

## Bottom Line

✅ **File headers + auto-summarization = practical, scalable solution**

**Recommended implementation order**:

1. Build file scanner + header extractor (day 1)
2. Add LLM auto-summarization (day 2)
3. Build metadata index + caching (day 2-3)
4. Add embeddings search (day 4)
5. Add optional LLM query handler (day 5)
6. Polish UI + incremental updates (day 5-6)

**Most valuable for**:

- Large monorepos (5k+ files)
- Teams with inconsistent folder structures
- Projects with complex interdependencies
- First-time contributors unfamiliar with codebase
- Codebases changing frequently (file watcher handles updates)
