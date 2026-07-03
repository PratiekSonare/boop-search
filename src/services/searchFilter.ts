import { FileMetadata } from '../types/metadata';
import { QueryFilters } from './queryParser';
import { fuzzyMatch } from '../utils/validators';
import { resolveLangAlias } from '../utils/languageDetect';

export function applyFilters(files: FileMetadata[], filters: QueryFilters): FileMetadata[] {
  let result = files;

  if (filters.inFolder) {
    const folderLower = filters.inFolder.toLowerCase();
    result = result.filter(f => f.folderPath.toLowerCase().includes(folderLower));
  }

  if (filters.lang) {
    const aliases = resolveLangAlias(filters.lang);
    result = result.filter(f =>
      aliases.some(a => f.language.toLowerCase().includes(a)),
    );
  }

  if (filters.ext) {
    let ext = filters.ext;
    if (!ext.startsWith('.')) {
      ext = `.${ext}`;
    }
    const extLower = ext.toLowerCase();
    result = result.filter(f => f.fileName.toLowerCase().endsWith(extLower));
  }

  if (filters.symbol) {
    result = result.filter(f =>
      f.symbols.some(s => fuzzyMatch(filters.symbol!, s))
    );
  }

  if (filters.modified) {
    const now = new Date();
    const cutoff = getCutoffDate(filters.modified, now);
    const cutoffMs = cutoff.getTime();
    result = result.filter(f => f.lastModified >= cutoffMs);
  }

  if (filters.type) {
    const typeLower = filters.type.toLowerCase();
    result = result.filter(f =>
      f.category.toLowerCase().includes(typeLower) ||
      f.purpose.toLowerCase().includes(typeLower)
    );
  }

  return result;
}

function getCutoffDate(modified: string, now: Date): Date {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (modified) {
    case 'today':
      return startOfDay;
    case 'thisWeek': {
      const dayOfWeek = startOfDay.getDay();
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
      return startOfWeek;
    }
    case 'thisMonth':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return startOfDay;
  }
}


