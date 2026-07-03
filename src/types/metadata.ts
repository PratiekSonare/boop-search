export interface FileMetadata {
  path: string;
  fileName: string;
  folderPath: string;
  language: string;
  purpose: string;
  purposeSource: 'manual' | 'auto' | 'inferred';
  category: string;
  related: string[];
  symbols: string[];
  embedding?: number[];
  lastModified: number;
}

export interface SearchResult {
  file: FileMetadata;
  score: number;
  reasoning?: string;
}

export interface MetadataCache {
  version: number;
  buildTime: string;
  files: FileMetadata[];
}
