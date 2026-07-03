import * as vscode from 'vscode';

interface ResultItem {
  label: string; description: string; filePath: string; score: number;
  language?: string; rank?: number;
}

const LANGUAGE_ICONS: Record<string, string> = {
  typescript: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
  typescriptreact: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
  javascript: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
  javascriptreact: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
  python: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
  go: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original-wordmark.svg',
  rust: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg',
  java: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
  csharp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg',
  ruby: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg',
  php: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg',
  swift: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/swift/swift-original.svg',
  kotlin: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg',
  c: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
  cpp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
  objectivec: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/objectivec/objectivec-plain.svg',
  assembly: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
  fortran: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fortran/fortran-original.svg',
  cobol: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cobol/cobol-original.svg',
  haskell: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/haskell/haskell-original.svg',
  lua: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/lua/lua-original.svg',
  zig: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/zig/zig-original.svg',
  nim: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nim/nim-original.svg',
  r: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/r/r-original.svg',
  dart: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg',
  julia: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/julia/julia-original.svg',
  perl: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/perl/perl-original.svg',
  elixir: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/elixir/elixir-original.svg',
  clojure: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/clojure/clojure-original.svg',
  erlang: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/erlang/erlang-original.svg',
  scala: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/scala/scala-original.svg',
  css: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
  scss: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sass/sass-original.svg',
  html: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
  vue: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg',
  svelte: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/svelte/svelte-original.svg',
  markdown: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg',
  json: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg',
  yaml: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg',
  shell: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg',
  sql: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original-wordmark.svg',
};

export class ResultsPanel {
  private _panel?: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  showResults(
    items: ResultItem[],
    query: string,
  ): void {
    if (this._panel) {
      this._panel.dispose();
    }

    this._panel = vscode.window.createWebviewPanel(
      'pookieExplorerResults',
      `Search: ${query}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true },
    );

    this._panel.webview.html = this._getHtmlForWebview(items, query);

    this._panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile') {
        const uri = vscode.Uri.file(message.filePath);
        await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Active);
      }
    });
  }

  dispose(): void {
    this._panel?.dispose();
  }

  private _getHtmlForWebview(
    items: ResultItem[],
    query: string,
  ): string {
    const resultsHtml = items
      .map(
        (item, idx) => {
          const rank = item.rank || idx + 1;
          const lang = item.language || '';
          const iconUrl = lang ? LANGUAGE_ICONS[lang] : '';
          const iconHtml = iconUrl
            ? `<img src="${iconUrl}" class="lang-icon" alt="${this._escapeHtml(lang)}" />`
            : '';
          return `
        <div class="result-item" data-path="${this._escapeHtml(item.filePath)}">
          <div class="result-header">
            <span class="result-rank">${rank}</span>
            <div class="result-label">${iconHtml}${this._escapeHtml(item.label)}</div>
          </div>
          <div class="result-desc">${this._escapeHtml(item.description || 'No description')}</div>
          <div class="result-path">${this._escapeHtml(item.filePath)}</div>
        </div>
      `;
        },
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Search Results</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px;
      background: var(--vscode-editor-background);
    }
    .header {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-foreground);
    }
    .query { color: var(--vscode-textLinkForeground); }
    .count { color: var(--vscode-descriptionForeground); font-weight: normal; }
    .result-item {
      padding: 12px;
      margin-bottom: 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .result-item:hover { background: var(--vscode-list-hoverBackground); }
    .result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .result-rank {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      width: 16px;
      text-align: right;
      flex-shrink: 0;
    }
    .result-label {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lang-icon {
      width: 14px;
      height: 14px;
      display: inline-block;
    }
    .result-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .result-path {
      font-size: 11px;
      color: var(--vscode-textLinkForeground);
      font-family: var(--vscode-editor-font-family);
    }
    .empty {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    Results for <span class="query">"${this._escapeHtml(query)}"</span>
    <span class="count">(${items.length} file${items.length !== 1 ? 's' : ''})</span>
  </div>
  ${items.length === 0 ? '<div class="empty">No results found.</div>' : resultsHtml}
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.result-item').forEach((el) => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'openFile', filePath: el.dataset.path });
      });
    });
  </script>
</body>
</html>`;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
