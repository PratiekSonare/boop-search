import * as vscode from 'vscode';
import * as path from 'path';

const JS_TS_HEADER = (fileName: string) => `/**
 * @file ${fileName}
 * @purpose TODO: Describe what this file does
 * @category TODO: e.g. frontend/components, backend/services, utilities
 * @related TODO: related-file.ts, another-file.ts
 */
`;

const PYTHON_HEADER = (fileName: string) => `# @file ${fileName}
# @purpose TODO: Describe what this file does
# @category TODO: e.g. backend/services, utilities
# @related TODO: related_file.py
`;

const HASH_HEADER = (fileName: string) => `# @file ${fileName}
# @purpose TODO: Describe what this file does
# @category TODO: e.g. config, scripts
# @related TODO: related-file
`;

const SQL_HEADER = (fileName: string) => `-- @file ${fileName}
-- @purpose TODO: Describe what this migration/query does
-- @category data/migrations
-- @related TODO: related-migration.sql
`;

function getHeaderTemplate(languageId: string, fileName: string): string {
  switch (languageId) {
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
    case 'java':
    case 'csharp':
    case 'go':
    case 'swift':
    case 'kotlin':
    case 'rust':
      return JS_TS_HEADER(fileName);
    case 'python':
    case 'ruby':
    case 'shell':
    case 'yaml':
    case 'toml':
      return PYTHON_HEADER(fileName);
    case 'sql':
      return SQL_HEADER(fileName);
    default:
      return HASH_HEADER(fileName);
  }
}

export function registerAddHeader(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('boop.addHeader', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a file first.');
      return;
    }

    const fileName = path.basename(editor.document.fileName);
    const languageId = editor.document.languageId;
    const header = getHeaderTemplate(languageId, fileName);

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), header);
    });

    // Move cursor to the @purpose line so user can start typing immediately
    const purposeLine = header.split('\n').findIndex((l) => l.includes('@purpose'));
    if (purposeLine >= 0) {
      const line = editor.document.lineAt(purposeLine);
      const purposeCol = line.text.indexOf('TODO');
      const pos = new vscode.Position(purposeLine, purposeCol >= 0 ? purposeCol : 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  });
}
