import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { secureShuffle } from '@esc/gen-utils';

const MAX_CHARS = 1_000_000;
const MAX_LINES = 200_000;

export type ListOperation = 'dedupe' | 'sort-az' | 'sort-za' | 'sort-numeric' | 'reverse' | 'remove-empty' | 'shuffle';

export interface ListOptions {
  operation: ListOperation;
  ignoreCase: boolean;
  trim: boolean;
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  // Uma quebra de linha no fim não cria uma linha vazia a mais.
  return text.replace(/\r?\n$/, '').split(/\r?\n/);
}

/** Aplica uma operação a uma lista de linhas, mantendo a primeira ocorrência ao remover duplicadas. */
export function processLines(lines: readonly string[], { operation, ignoreCase, trim }: ListOptions): string[] {
  const prepared = trim ? lines.map((l) => l.trim()) : [...lines];
  const collator = new Intl.Collator('pt-BR', { sensitivity: ignoreCase ? 'accent' : 'variant' });
  switch (operation) {
    case 'dedupe': {
      const seen = new Set<string>();
      return prepared.filter((line) => {
        const key = ignoreCase ? line.toLocaleLowerCase('pt-BR') : line;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    case 'sort-az':
      return prepared.sort((a, b) => collator.compare(a, b));
    case 'sort-za':
      return prepared.sort((a, b) => collator.compare(b, a));
    case 'sort-numeric': {
      const value = (s: string) => {
        const n = Number(s.replace(',', '.'));
        return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
      };
      // Linhas que não são número vão para o fim, em ordem alfabética.
      return prepared.sort((a, b) => {
        const x = value(a);
        const y = value(b);
        if (x !== undefined && y !== undefined) return x - y;
        if (x !== undefined) return -1;
        if (y !== undefined) return 1;
        return collator.compare(a, b);
      });
    }
    case 'reverse':
      return prepared.reverse();
    case 'remove-empty':
      return prepared.filter((line) => line.trim() !== '');
    case 'shuffle':
      return secureShuffle(prepared);
  }
}

export const lineListTool = defineTool({
  id: 'linhas-texto',
  name: 'Remover Linhas Duplicadas e Ordenar Texto',
  description: 'Remove linhas duplicadas ou vazias, ordena em ordem alfabética ou numérica, inverte e embaralha as linhas de uma lista',
  category: 'formatadores',
  keywords: ['remover linhas duplicadas', 'duplicados', 'ordenar linhas', 'ordem alfabética', 'ordenar lista', 'linhas vazias', 'embaralhar', 'inverter', 'lista', 'texto'],
  icon: '📋',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(MAX_CHARS).default(''),
    operation: z.enum(['dedupe', 'sort-az', 'sort-za', 'sort-numeric', 'reverse', 'remove-empty', 'shuffle']).default('dedupe'),
    ignoreCase: z.boolean().default(false),
    trim: z.boolean().default(true),
  }),
  outputSchema: z.object({ result: z.string(), before: z.number(), after: z.number(), removed: z.number() }),
  execute: ({ text, operation, ignoreCase, trim }) => {
    const lines = splitLines(text);
    if (lines.length > MAX_LINES) throw new ToolError(`O texto tem mais de ${MAX_LINES.toLocaleString('pt-BR')} linhas`);
    const out = processLines(lines, { operation, ignoreCase, trim });
    return { result: out.join('\n'), before: lines.length, after: out.length, removed: lines.length - out.length };
  },
  fields: {
    text: { label: 'Lista (uma por linha)', multiline: true, placeholder: 'maçã\nbanana\nmaçã' },
    operation: {
      label: 'O que fazer',
      optionLabels: {
        dedupe: 'Remover linhas duplicadas',
        'sort-az': 'Ordenar de A a Z',
        'sort-za': 'Ordenar de Z a A',
        'sort-numeric': 'Ordenar numericamente',
        reverse: 'Inverter a ordem',
        'remove-empty': 'Remover linhas vazias',
        shuffle: 'Embaralhar',
      },
    },
    ignoreCase: { label: 'Ignorar maiúsculas e minúsculas' },
    trim: { label: 'Cortar espaços no início e no fim de cada linha' },
  },
  outputLabels: { result: 'Resultado', before: 'Linhas antes', after: 'Linhas depois', removed: 'Linhas removidas' },
  examples: [{ description: 'Remover duplicadas', input: { text: 'maçã\nbanana\nmaçã', operation: 'dedupe', ignoreCase: false, trim: true }, output: { result: 'maçã\nbanana', before: 3, after: 2, removed: 1 } }],
  documentation:
    'Cada linha do texto é um item. Ao remover duplicadas, a primeira ocorrência fica e a ordem original é mantida. A ordenação alfabética segue o português (acentos e cedilha são tratados corretamente) e a numérica aceita vírgula ou ponto decimal, deixando as linhas que não são número no fim. Embaralhar usa o gerador criptograficamente seguro do sistema. Aceita até 1 milhão de caracteres e 200 mil linhas, tudo no seu dispositivo.',
});
