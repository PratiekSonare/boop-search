import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'test/__mocks__/vscode.ts'),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
