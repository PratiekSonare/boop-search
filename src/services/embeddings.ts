import { FileMetadata, SearchResult } from '../types/metadata';
import { FolderIndex, FolderMetadata } from './folderIndex';
import { logger } from './logger';

type Pipeline = (texts: string | string[], options?: Record<string, unknown>) => Promise<{ data: Float32Array }>;

export interface DynamicTrimOptions {
  minScore?: number;
  dropThreshold?: number;
  minResults?: number;
}

function dynamicTrim(
  results: SearchResult[],
  maxResults: number,
  opts: DynamicTrimOptions = {},
): SearchResult[] {
  const { minScore = 0.3, dropThreshold = 0.30, minResults = 1 } = opts;

  if (results.length === 0) return [];
  if (results.length <= minResults) return results;

  let cut = results.findIndex((r, i) => {
    if (i === 0) return false;
    if (i >= maxResults) return true;
    if (r.score < minScore) return true;
    const prev = results[i - 1].score;
    return prev > 0 && (prev - r.score) / prev > dropThreshold;
  });

  if (cut === -1) cut = results.length;
  cut = Math.max(cut, Math.min(minResults, results.length));
  return results.slice(0, cut);
}

export class EmbeddingsEngine {
  private pipeline: Pipeline | null = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';

  private async getPipeline(): Promise<Pipeline> {
    if (!this.pipeline) {
      logger.info('Loading embeddings model (first use — may take a moment)');
      // Dynamic import to avoid loading WASM at extension activation
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = (await pipeline('feature-extraction', this.modelName)) as Pipeline;
      logger.info('Embeddings model ready');
    }
    return this.pipeline;
  }

  async embedText(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  async searchByEmbedding(
    query: string,
    files: FileMetadata[],
    topK: number,
    folderIndex?: FolderIndex,
    useDynamicTrim?: boolean | DynamicTrimOptions,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedText(query);

    const filesWithEmbeddings = files.filter((f) => f.embedding && f.embedding.length > 0);

    if (filesWithEmbeddings.length === 0) {
      logger.warn('No files have embeddings — run Rebuild Index');
      return [];
    }

    let folderBoosts = new Map<string, number>();

    if (folderIndex && folderIndex.size() > 0) {
      const folders = folderIndex.getAll();
      const foldersWithEmbeddings = folders.filter((f) => f.embedding && f.embedding.length > 0);

      for (const folder of foldersWithEmbeddings) {
        const folderScore = this.cosineSimilarity(queryEmbedding, folder.embedding!);
        if (folderScore > 0.3) {
          folderBoosts.set(folder.folderPath, folderScore * 0.2);
        }
      }
    }

    const scored: SearchResult[] = filesWithEmbeddings.map((file) => {
      const fileScore = this.cosineSimilarity(queryEmbedding, file.embedding!);
      const boost = folderBoosts.get(file.folderPath) || 0;
      return {
        file,
        score: Math.min(fileScore + boost, 1.0),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    if (useDynamicTrim) {
      const opts = typeof useDynamicTrim === 'object' ? useDynamicTrim : {};
      return dynamicTrim(scored, topK, opts);
    }
    return scored.slice(0, topK);
  }

  embeddingText(file: FileMetadata): string {
    const parts = [
      file.fileName,
      file.purpose,
      file.category,
      file.language,
      file.folderPath,
      ...file.related,
      ...file.symbols,
    ];
    return parts.filter(Boolean).join(' ');
  }
}
