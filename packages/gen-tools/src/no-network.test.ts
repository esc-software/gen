import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A política de segurança do projeto promete que o CLI, a extensão e as ferramentas não usam a rede.
// Este teste varre o código-fonte e falha se alguma API de rede aparecer.
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const FORBIDDEN =
  /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|from ['"]node:(http|https|http2|net|tls|dgram|dns)['"]|require\(['"](http|https|net|tls|dgram|dns)['"]\)|from ['"](http|https|net|tls|dgram|dns)['"]/

function sources(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === 'out') return []
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe('sem rede', () => {
  const dirs = ['packages/gen-core/src', 'packages/gen-utils/src', 'packages/gen-validation/src', 'packages/gen-tools/src', 'apps/cli/src', 'apps/vscode/src']

  it('nenhum código do CLI, da extensão ou das ferramentas usa APIs de rede', () => {
    const offenders = dirs
      .flatMap((dir) => sources(join(root, dir)))
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root.length))
    expect(offenders).toEqual([])
  })

  it('encontra os arquivos que deveria varrer (o teste não passa por estar vazio)', () => {
    expect(sources(join(root, 'packages/gen-tools/src')).length).toBeGreaterThan(20)
    expect(sources(join(root, 'apps/cli/src')).length).toBeGreaterThanOrEqual(2)
  })
})
