import * as vscode from 'vscode';
import * as path from 'path';
import { SearchResult } from '../types/metadata';

export interface FileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
}

export function toQuickPickItems(
  results: SearchResult[],
  workspacePath: string,
): FileQuickPickItem[] {
  return results.map((result) => {
    const relativePath = path.relative(workspacePath, result.file.path);
    const scorePercent = Math.round(result.score * 100);
    const sourceIcon = result.file.purposeSource === 'manual' ? '$(bookmark)' : '$(zap)';

    return {
      label: `${sourceIcon} ${relativePath}`,
      description: result.file.purpose,
      detail: `${scorePercent}% match · ${result.file.category}`,
      filePath: result.file.path,
    };
  });
}
