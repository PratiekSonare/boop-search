const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  // vscode is provided by the extension host; @xenova/transformers uses native .node binaries
  // that cannot be bundled — they are loaded from node_modules at runtime
  external: ['vscode', '@xenova/transformers', 'onnxruntime-node', 'sharp'],
  platform: 'node',
  target: 'node18',
  minify: !isWatch,
  sourcemap: true,
  logLevel: 'info',
};

if (isWatch) {
  esbuild
    .context(buildOptions)
    .then((ctx) => ctx.watch())
    .catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}
