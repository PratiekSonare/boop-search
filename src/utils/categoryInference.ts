import * as path from 'path';

const SEGMENT_MAP: Record<string, string> = {
  components: 'frontend/components',
  component: 'frontend/components',
  hooks: 'frontend/hooks',
  hook: 'frontend/hooks',
  pages: 'frontend/pages',
  page: 'frontend/pages',
  views: 'frontend/views',
  view: 'frontend/views',
  layouts: 'frontend/layouts',
  layout: 'frontend/layouts',
  styles: 'frontend/styles',
  style: 'frontend/styles',
  css: 'frontend/styles',
  ui: 'frontend/ui',
  logic: 'frontend/logic',
  store: 'frontend/state',
  stores: 'frontend/state',
  reducers: 'frontend/state',
  context: 'frontend/state',
  utils: 'utilities',
  util: 'utilities',
  helpers: 'utilities',
  helper: 'utilities',
  lib: 'utilities',
  shared: 'utilities',
  common: 'utilities',
  services: 'backend/services',
  service: 'backend/services',
  controllers: 'backend/controllers',
  controller: 'backend/controllers',
  routes: 'backend/routes',
  route: 'backend/routes',
  api: 'backend/api',
  middleware: 'backend/middleware',
  models: 'data/models',
  model: 'data/models',
  schemas: 'data/schemas',
  schema: 'data/schemas',
  migrations: 'data/migrations',
  migration: 'data/migrations',
  database: 'data/database',
  db: 'data/database',
  repositories: 'data/repositories',
  repository: 'data/repositories',
  tests: 'tests',
  test: 'tests',
  __tests__: 'tests',
  spec: 'tests',
  specs: 'tests',
  config: 'config',
  configs: 'config',
  configuration: 'config',
  types: 'types',
  type: 'types',
  interfaces: 'types',
  constants: 'constants',
  constant: 'constants',
  scripts: 'scripts',
  script: 'scripts',
  assets: 'assets',
  asset: 'assets',
  public: 'assets',
  static: 'assets',
};

export function inferCategory(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const segments = normalizedPath.split('/');

  for (const segment of segments) {
    const mapped = SEGMENT_MAP[segment];
    if (mapped) {
      return mapped;
    }
  }

  // Check if filename pattern gives a clue
  const fileName = path.basename(filePath).toLowerCase();
  if (fileName.includes('.test.') || fileName.includes('.spec.')) {
    return 'tests';
  }
  if (fileName.endsWith('.d.ts')) {
    return 'types';
  }
  if (fileName === 'index.ts' || fileName === 'index.js') {
    const parentDir = path.basename(path.dirname(filePath)).toLowerCase();
    return SEGMENT_MAP[parentDir] ?? 'misc';
  }

  return 'misc';
}
