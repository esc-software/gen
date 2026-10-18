import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { splitLines } from './text-lists.js';

const MAX_CHARS = 1_000_000;
const MAX_CELLS = 4_000_000;

export type DiffOp = { type: 'same' | 'add' | 'remove'; line: string };

export interface DiffOptions {
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
}

const normalizer = ({ ignoreCase, ignoreWhitespace }: DiffOptions) => (line: string): string => {
  let s = line;
  if (ignoreWhitespace) s = s.trim().replace(/\s+/g, ' ');
  if (ignoreCase) s = s.toLocaleLowerCase('pt-BR');
  return s;
};

/** Diferença linha a linha (maior subsequência comum). Tira o começo e o fim iguais antes de montar a tabela. */
export function diffLines(a: readonly string[], b: readonly string[], options: DiffOptions): DiffOp[] {
  const norm = normalizer(options);
  const na = a.map(norm);
  const nb = b.map(norm);
  let start = 0;
  while (start < na.length && start < nb.length && na[start] === nb[start]) start++;
  let endA = na.length;
  let endB = nb.length;
  while (endA > start && endB > start && na[endA - 1] === nb[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  if ((n + 1) * (m + 1) > MAX_CELLS) throw new ToolError('Os textos são grandes e diferentes demais para comparar aqui. Compare por partes menores.');

  // Tabela do comprimento da subsequência comum dos sufixos.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        na[start + i] === nb[start + j] ? (table[(i + 1) * width + j + 1] as number) + 1 : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }

  const ops: DiffOp[] = [];
  for (let k = 0; k < start; k++) ops.push({ type: 'same', line: b[k] as string });
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (na[start + i] === nb[start + j]) {
      ops.push({ type: 'same', line: b[start + j] as string });
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      ops.push({ type: 'remove', line: a[start + i] as string });
      i++;
    } else {
      ops.push({ type: 'add', line: b[start + j] as string });
      j++;
    }
  }
  for (; i < n; i++) ops.push({ type: 'remove', line: a[start + i] as string });
  for (; j < m; j++) ops.push({ type: 'add', line: b[start + j] as string });
  for (let k = endB; k < nb.length; k++) ops.push({ type: 'same', line: b[k] as string });
  return ops;
}

/** Mostra só as mudanças com `context` linhas de contexto; trechos distantes ficam separados por "…". */
export function renderDiff(ops: readonly DiffOp[], context: number): string {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.type === 'same') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) keep[k] = true;
  });
  const lines: string[] = [];
  let skipped = false;
  ops.forEach((op, idx) => {
    if (!keep[idx]) {
      skipped = true;
      return;
    }
    if (skipped && lines.length > 0) lines.push('…');
    skipped = false;
    lines.push(`${op.type === 'add' ? '+' : op.type === 'remove' ? '-' : ' '} ${op.line}`);
  });
  return lines.join('\n');
}

export const textDiffTool = defineTool({
  id: 'diff-texto',
  name: 'Comparador de Textos (Diff Online)',
  description: 'Compara dois textos linha a linha e mostra o que foi adicionado, removido e mantido, com contagem de mudanças',
  category: 'formatadores',
  keywords: ['diff', 'comparar textos', 'comparador de texto', 'diferença entre textos', 'diff online', 'comparar código', 'text compare', 'linhas alteradas'],
  icon: '🔀',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    original: z.string().max(MAX_CHARS).default(''),
    changed: z.string().max(MAX_CHARS).default(''),
    ignoreCase: z.boolean().default(false),
    ignoreWhitespace: z.boolean().default(false),
    context: z.number().int().min(0).max(50).default(3),
  }),
  outputSchema: z.object({ diff: z.string(), added: z.number(), removed: z.number(), unchanged: z.number(), identical: z.boolean() }),
  execute: ({ original, changed, ignoreCase, ignoreWhitespace, context }) => {
    const ops = diffLines(splitLines(original), splitLines(changed), { ignoreCase, ignoreWhitespace });
    const added = ops.filter((o) => o.type === 'add').length;
    const removed = ops.filter((o) => o.type === 'remove').length;
    return { diff: added + removed === 0 ? '(os textos são iguais)' : renderDiff(ops, context), added, removed, unchanged: ops.length - added - removed, identical: added + removed === 0 };
  },
  fields: {
    original: { label: 'Texto original', multiline: true },
    changed: { label: 'Texto alterado', multiline: true },
    ignoreCase: { label: 'Ignorar maiúsculas e minúsculas' },
    ignoreWhitespace: { label: 'Ignorar espaços no início, no fim e repetidos' },
    context: { label: 'Linhas de contexto ao redor das mudanças', help: 'De 0 a 50.' },
  },
  outputLabels: { diff: 'Diferenças (+ adicionada, − removida)', added: 'Linhas adicionadas', removed: 'Linhas removidas', unchanged: 'Linhas iguais', identical: 'Textos idênticos' },
  examples: [{ description: 'Uma linha trocada', input: { original: 'a\nb\nc', changed: 'a\nB\nc', ignoreCase: false, ignoreWhitespace: false, context: 1 }, output: { added: 1, removed: 1, unchanged: 2, identical: false } }],
  documentation:
    'A comparação é feita por linhas, com o algoritmo da maior subsequência comum: a menor lista de linhas removidas e adicionadas que transforma o original no texto alterado. Uma linha editada aparece como uma remoção seguida de uma adição. Você pode ignorar diferenças de maiúsculas e de espaços. O processamento acontece no seu dispositivo; textos muito grandes e muito diferentes são recusados para não travar o navegador.',
});
