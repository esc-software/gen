import { build } from 'esbuild';

// A extensão é CommonJS e o Gen é ESM: empacotamos tudo em um único arquivo.
// `vscode` é fornecido pelo editor; `pdfjs-dist` só é usado por uma ferramenta exclusiva do navegador.
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'out/extension.js',
  external: ['vscode', 'pdfjs-dist', 'pdfjs-dist/*'],
  conditions: ['source'],
  // "buffers" não declara licença e só é usado para ler xlsx (a extensão só gera): ver stubs/buffers.cjs.
  alias: { buffers: './stubs/buffers.cjs' },
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  // Só a ferramenta exclusiva do navegador usa import.meta; ela não é oferecida na extensão.
  logOverride: { 'empty-import-meta': 'silent' },
});
