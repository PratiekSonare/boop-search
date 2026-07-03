import * as vscode from 'vscode';
import { MetadataIndex } from '../services/metadataIndex';
import { FileIndexer } from '../services/fileIndexer';
import { EmbeddingsEngine } from '../services/embeddings';
import { FileScanner } from '../services/fileScanner';
import { FolderIndex } from '../services/folderIndex';
import { ExtensionConfig } from '../types/config';
import { logger } from '../services/logger';

export function registerRebuildIndex(
  context: vscode.ExtensionContext,
  index: MetadataIndex,
  fileIndexer: FileIndexer,
  scanner: FileScanner,
  folderIndex: FolderIndex,
  config: ExtensionConfig,
  workspacePath: string,
  cachePath: string,
  folderCachePath: string,
  embeddings: EmbeddingsEngine,
): vscode.Disposable {
  return vscode.commands.registerCommand('pookie-explorer.rebuildIndex', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Boop: Rebuilding index...',
        cancellable: false,
      },
      async (progress) => {
        index.clear();

        progress.report({ message: 'Scanning files...' });
        const filePaths = await scanner.scanWorkspace(
          config.includePatterns,
          config.excludePatterns,
          config.rootFolderPath || undefined,
        );

        logger.info(`Rebuilding index for ${filePaths.length} files`);

        let processed = 0;
        for (const filePath of filePaths) {
          try {
            const metadata = await fileIndexer.buildMetadata(filePath);
            index.add(metadata);
          } catch (err) {
            logger.warn(`Could not index ${filePath}: ${err}`);
          }
          processed++;

          if (processed % 20 === 0) {
            progress.report({
              message: `Processing files... (${processed}/${filePaths.length})`,
              increment: (20 / filePaths.length) * 100,
            });
          }
        }

        progress.report({ message: 'Building folder index...' });
        folderIndex.buildFromFiles(index.getAll());
        for (const folder of folderIndex.getAll()) {
          try {
            const folderEmbedding = await embeddings.embedText(folderIndex.folderText(folder));
            folder.embedding = folderEmbedding;
          } catch (err) {
            logger.warn(`Could not embed folder ${folder.folderPath}: ${err}`);
          }
        }

        progress.report({ message: 'Saving index...' });
        await index.save(cachePath);
        await folderIndex.save(folderCachePath);

        logger.info(`Index rebuilt: ${index.size} files, ${folderIndex.size()} folders`);
        vscode.window.showInformationMessage(
          `Boop: Index rebuilt — ${index.size} files, ${folderIndex.size()} folders indexed.`,
        );
      },
    );
  });
}
