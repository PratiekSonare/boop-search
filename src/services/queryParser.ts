import * as path from 'path';
import { MetadataIndex } from './metadataIndex';
import { FolderIndex } from './folderIndex';
import { fuzzyMatch } from '../utils/validators';
import { LANG_ALIASES } from '../utils/languageDetect';

export interface QueryFilters {
  inFolder?: string;
  lang?: string;
  ext?: string;
  symbol?: string;
  modified?: 'today' | 'thisWeek' | 'thisMonth';
  type?: string;
}

export interface ParsedQuery {
  text: string;
  filters: QueryFilters;
}

const FILTER_TYPES = ['inFolder', 'lang', 'ext', 'symbol', 'modified', 'type'] as const;

export function parseQuery(rawQuery: string): ParsedQuery {
  const filters: QueryFilters = {};
  let remaining = rawQuery;

  const filterRegex = /@(\w+):\s*("([^"]+)"|(\S+))/g;
  let match;

  while ((match = filterRegex.exec(rawQuery)) !== null) {
    const filterName = match[1];
    const filterValue = match[3] || match[4];

    switch (filterName) {
      case 'inFolder':
        filters.inFolder = filterValue;
        break;
      case 'lang':
        filters.lang = filterValue;
        break;
      case 'ext':
        filters.ext = filterValue;
        break;
      case 'symbol':
        filters.symbol = filterValue;
        break;
      case 'modified':
        if (['today', 'thisWeek', 'thisMonth'].includes(filterValue)) {
          filters.modified = filterValue as 'today' | 'thisWeek' | 'thisMonth';
        }
        break;
      case 'type':
        filters.type = filterValue;
        break;
    }

    remaining = remaining.replace(match[0], '');
  }

  const text = remaining.replace(/\s+/g, ' ').trim();

  return { text, filters };
}

export function getFilterTypeSuggestions(partial: string): string[] {
  const filterDescriptions: Record<string, string> = {
    inFolder: 'Search in specific folder',
    lang: 'Filter by language (typescript, python, etc.)',
    ext: 'Filter by extension (.ts, .tsx, .py)',
    symbol: 'Filter by function/class name',
    modified: 'Filter by last modified (today, thisWeek, thisMonth)',
    type: 'Filter by file type/category',
  };

  return FILTER_TYPES
    .filter(ft => ft.toLowerCase().includes(partial.toLowerCase()))
    .map(ft => `${ft}: ${filterDescriptions[ft]}`);
}

export function getFilterValueSuggestions(
  filterType: string,
  partial: string,
  index: MetadataIndex,
  folderIndex: FolderIndex,
): string[] {
  const files = index.getAll();

  switch (filterType) {
    case 'inFolder': {
      const folders = folderIndex.getAll();
      return folders
        .map(f => f.folderPath)
        .filter(fp => fp.toLowerCase().includes(partial.toLowerCase()))
        .slice(0, 10);
    }

    case 'lang': {
      const languages = [...new Set(files.map(f => f.language))];
      const coveredLangs = new Set(Object.values(LANG_ALIASES).flat());
      const aliasEntries = Object.entries(LANG_ALIASES)
        .filter(([alias, targets]) =>
          targets.some(t => languages.includes(t)) &&
          alias.toLowerCase().includes(partial.toLowerCase()),
        )
        .map(([alias]) => `${alias} (${languages.filter(l => LANG_ALIASES[alias].includes(l)).join(', ')})`);
      return [
        ...aliasEntries,
        ...languages
          .filter(l => !coveredLangs.has(l) && l.toLowerCase().includes(partial.toLowerCase()))
          .sort(),
      ];
    }

    case 'ext': {
      const extensions = [...new Set(files.map(f => path.extname(f.fileName)))];
      return extensions
        .filter(e => e.toLowerCase().includes(partial.toLowerCase()))
        .sort();
    }

    case 'symbol': {
      const allSymbols = [...new Set(files.flatMap(f => f.symbols))];
      return allSymbols
        .filter(s => fuzzyMatch(partial, s))
        .slice(0, 15);
    }

    case 'modified': {
      return ['today', 'thisWeek', 'thisMonth']
        .filter(o => o.includes(partial.toLowerCase()));
    }

    case 'type': {
      const categories = [...new Set(files.map(f => f.category))];
      return categories
        .filter(c => c.toLowerCase().includes(partial.toLowerCase()))
        .sort();
    }

    default:
      return [];
  }
}


