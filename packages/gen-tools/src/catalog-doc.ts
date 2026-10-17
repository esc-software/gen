import { CATEGORIES } from '@esc/gen-core';
import { ROADMAP } from './roadmap.js';
import { registry } from './index.js';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Gera `docs/tools.md` a partir do registro, para a lista nunca divergir do código. */
export function renderCatalogDoc(): string {
  const tools = registry.list();
  const lines = [
    '# Catálogo de ferramentas',
    '',
    '> Gerado do registro por `catalog-doc.ts`; não edite à mão. Para atualizar: `UPDATE_DOCS=1 bunx vitest run packages/gen-tools/src/catalog-doc.test.ts`.',
    '',
    `**${tools.length} ferramentas.** "CLI/API" indica que a ferramenta também roda no Node (CLI, API e extensão do VS Code); as marcadas "só navegador" dependem de recursos do navegador.`,
    '',
  ];
  for (const c of CATEGORIES) {
    const list = tools.filter((t) => t.category === c.id);
    lines.push(`## ${c.label} (${list.length})`, '', `${c.description}.`, '', '| Ferramenta | Id | O que faz | Onde roda |', '|---|---|---|---|');
    for (const t of list) {
      const where = t.modes.includes('node') ? 'navegador, CLI/API' : 'só navegador';
      lines.push(`| ${esc(t.name)} | \`${t.id}\` | ${esc(t.description)} | ${where} |`);
    }
    lines.push('');
  }
  const pending = ROADMAP.filter((r) => !registry.has(r.id));
  lines.push(`## Ainda não implementadas (${pending.length})`, '', '| Ferramenta | Motivo |', '|---|---|');
  for (const r of pending) lines.push(`| ${esc(r.name)} (\`${r.id}\`) | ${esc(r.pending ?? 'não implementada')} |`);
  lines.push('');
  return lines.join('\n');
}
