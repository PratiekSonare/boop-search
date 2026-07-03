import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMetadata } from '../types/metadata';
import { EmbeddingsEngine } from './embeddings';
import { HeaderParser } from './headerParser';
import { SymbolExtractor } from './symbolExtractor';
import { inferCategory } from '../utils/categoryInference';
import { detectLanguage } from '../utils/languageDetect';
import { logger } from './logger';

export class FileIndexer {
  constructor(
    private readonly embeddings: EmbeddingsEngine,
    private readonly headerParser: HeaderParser,
    private readonly symbolExtractor: SymbolExtractor,
    private readonly enableSymbolExtraction: boolean,
  ) {}

  async buildMetadata(filePath: string): Promise<FileMetadata> {
    const header = await this.headerParser.extractHeader(filePath);
    const symbols = this.enableSymbolExtraction
      ? await this.symbolExtractor.extractSymbols(filePath)
      : [];
    const fileName = path.basename(filePath);
    const folderPath = path.dirname(filePath);

    let lastModified = Date.now();
    try {
      const s = await fs.stat(filePath);
      lastModified = s.mtimeMs;
    } catch {}

    const metadata: FileMetadata = {
      path: filePath,
      fileName,
      folderPath,
      language: detectLanguage(filePath),
      purpose: header?.purpose ?? `${fileName} in ${path.basename(folderPath)}`,
      purposeSource: header?.purposeSource ?? 'inferred',
      category: header?.category ?? inferCategory(filePath),
      related: header?.related ?? [],
      symbols,
      lastModified,
    };

    try {
      metadata.embedding = await this.embeddings.embedText(
        this.embeddings.embeddingText(metadata),
      );
    } catch {
      logger.warn(`Could not embed ${fileName}`);
    }

    return metadata;
  }
}
