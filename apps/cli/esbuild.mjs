/* global URL */
// Empacota o CLI e as bibliotecas do monorepo (@esc/*) em um único arquivo ESM.
// Dependências de terceiros ficam de fora: o npm as instala (veja "dependencies" no package.json).
import { chmodSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

await build({
  entryPoints: ['src/bin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/bin.js',
  // pdfjs-dist só é usado por ferramentas exclusivas do navegador, que o CLI não oferece.
  external: [...Object.keys(pkg.dependencies ?? {}), 'pdfjs-dist', 'pdfjs-dist/*'],
  conditions: ['source'],
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
  logOverride: { 'empty-import-meta': 'silent' },
})
chmodSync('dist/bin.js', 0o755)
