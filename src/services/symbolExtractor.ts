import * as vscode from 'vscode';
import { logger } from './logger';

const RELEVANT_KINDS = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Method,
]);

export class SymbolExtractor {
  async extractSymbols(filePath: string): Promise<string[]> {
    const uri = vscode.Uri.file(filePath);

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri,
      );

      if (!symbols || symbols.length === 0) {
        return [];
      }

      return this._flattenSymbols(symbols);
    } catch {
      logger.debug(`Could not extract symbols from ${filePath}`);
      return [];
    }
  }

  private _flattenSymbols(symbols: vscode.DocumentSymbol[]): string[] {
    const result: string[] = [];

    for (const symbol of symbols) {
      if (RELEVANT_KINDS.has(symbol.kind)) {
        result.push(symbol.name);
      }

      if (symbol.children && symbol.children.length > 0) {
        result.push(...this._flattenSymbols(symbol.children));
      }
    }

    return result;
  }
}
