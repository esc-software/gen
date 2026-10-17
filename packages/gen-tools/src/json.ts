import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export interface JsonErrorInfo {
  message: string;
  line?: number;
  column?: number;
}

/** Converte um deslocamento (UTF-16) em linha e coluna, começando em 1. */
export function positionToLineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines[lines.length - 1] as string).length + 1 };
}

/**
 * Interpreta o erro de `JSON.parse`. Os motores divulgam a posição de formas diferentes
 * ("at position N" no V8, "line L column C" no Firefox), então a localização é opcional.
 */
export function describeJsonError(text: string, error: unknown): JsonErrorInfo {
  const raw = error instanceof Error ? error.message : String(error);
  const lineCol = /line (\d+) column (\d+)/i.exec(raw);
  if (lineCol) return { message: raw, line: Number(lineCol[1]), column: Number(lineCol[2]) };
  const position = /position (\d+)/i.exec(raw);
  if (position) {
    return { message: raw, ...positionToLineColumn(text, Number(position[1])) };
  }
  return { message: raw };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

export interface JsonOptions {
  mode: 'format' | 'minify' | 'validate';
  indent: '2' | '4' | 'tab';
  sortKeys: boolean;
}

export interface JsonResult {
  valid: boolean;
  message: string;
  result: string;
}

function formatError(text: string, error: unknown): string {
  const info = describeJsonError(text, error);
  const where = info.line !== undefined ? ` (linha ${info.line}, coluna ${info.column})` : '';
  return `JSON inválido${where}: ${info.message}`;
}

export function processJson(text: string, options: JsonOptions): JsonResult {
  if (text.trim() === '') {
    if (options.mode === 'validate') return { valid: false, message: 'Entrada vazia', result: '' };
    throw new ToolError('Entrada vazia');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const message = formatError(text, e);
    if (options.mode === 'validate') return { valid: false, message, result: '' };
    throw new ToolError(message);
  }

  if (options.mode === 'validate') return { valid: true, message: 'JSON válido', result: text };

  const value = options.sortKeys ? sortKeysDeep(parsed) : parsed;
  if (options.mode === 'minify') return { valid: true, message: 'JSON minificado', result: JSON.stringify(value) };
  const indent = options.indent === 'tab' ? '\t' : Number(options.indent);
  return { valid: true, message: 'JSON formatado', result: JSON.stringify(value, null, indent) };
}

export const jsonTool = defineTool({
  id: 'json',
  name: 'Formatador e Validador de JSON',
  description: 'Formata, minifica e valida JSON, indicando a linha e a coluna de cada erro',
  category: 'formatadores',
  keywords: ['json', 'formatar', 'minificar', 'validar', 'indentar', 'pretty print'],
  icon: '🧩',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    text: z.string().max(2_000_000),
    mode: z.enum(['format', 'minify', 'validate']).default('format'),
    indent: z.enum(['2', '4', 'tab']).default('2'),
    sortKeys: z.boolean().default(false),
  }),
  outputSchema: z.object({ valid: z.boolean(), message: z.string(), result: z.string() }),
  execute: (options) => processJson(options.text, options),
  fields: {
    text: { label: 'JSON', multiline: true, placeholder: '{"nome": "Gen", "itens": [1, 2, 3]}' },
    mode: { label: 'Operação', optionLabels: { format: 'Formatar', minify: 'Minificar', validate: 'Validar' } },
    indent: { label: 'Indentação', optionLabels: { '2': '2 espaços', '4': '4 espaços', tab: 'Tabulação' } },
    sortKeys: { label: 'Ordenar chaves alfabeticamente' },
  },
  outputLabels: { valid: 'Válido', message: 'Mensagem', result: 'Resultado' },
  examples: [
    {
      description: 'Formatar',
      input: { text: '{"a":1,"b":[true,null]}', mode: 'format', indent: '2', sortKeys: false },
      output: { valid: true, message: 'JSON formatado', result: '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}' },
    },
    {
      description: 'Minificar com chaves ordenadas',
      input: { text: '{ "b": 1, "a": 2 }', mode: 'minify', indent: '2', sortKeys: true },
      output: { valid: true, message: 'JSON minificado', result: '{"a":2,"b":1}' },
    },
  ],
  documentation:
    'Tudo acontece no seu dispositivo; o JSON não é enviado a servidores. O JSON deve seguir o padrão estrito (aspas duplas, sem vírgula sobrando, sem comentários). Números maiores que 2^53 perdem precisão ao serem lidos e reescritos, e chaves duplicadas mantêm apenas o último valor.',
});
