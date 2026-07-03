import * as fs from 'fs/promises';
import { FileMetadata } from '../types/metadata';
import { logger } from './logger';

const HEADER_SCAN_LINES = 20;

const PURPOSE_RE = /[\/*#\-]+\s*@purpose\s+(.+)/i;
const CATEGORY_RE = /[\/*#\-]+\s*@category\s+(.+)/i;
const RELATED_RE = /[\/*#\-]+\s*@related\s+(.+)/i;

export class HeaderParser {
  async extractHeader(filePath: string): Promise<Partial<FileMetadata> | null> {
    let content: string;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      content = raw.split('\n').slice(0, HEADER_SCAN_LINES).join('\n');
    } catch (err) {
      logger.warn(`Could not read ${filePath} for header extraction`);
      return null;
    }

    const purposeMatch = PURPOSE_RE.exec(content);
    if (!purposeMatch) {
      return null;
    }

    const result: Partial<FileMetadata> = {
      purpose: purposeMatch[1].trim(),
      purposeSource: 'manual',
    };

    const categoryMatch = CATEGORY_RE.exec(content);
    if (categoryMatch) {
      result.category = categoryMatch[1].trim();
    }

    const relatedMatch = RELATED_RE.exec(content);
    if (relatedMatch) {
      result.related = relatedMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    return result;
  }
}
