import { z } from 'zod';
import Papa from 'papaparse';
import { stringify as yamlStringify } from 'yaml';
import { ToolError, defineTool } from '@esc/gen-core';
import { describeJsonError } from './json.js';

// ---------- JSON -> YAML ----------

export function jsonToYaml(text: string, indent: number): string {
  if (text.trim() === '') throw new ToolError('Entrada vazia');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const info = describeJsonError(text, e);
    const where = info.line !== undefined ? ` (linha ${info.line}, coluna ${info.column})` : '';
    throw new ToolError(`JSON inválido${where}: ${info.message}`);
  }
  return yamlStringify(parsed, { indent, lineWidth: 0 });
}

export const jsonToYamlTool = defineTool({
  id: 'json-yaml',
  name: 'JSON para YAML',
  description: 'Converte JSON em YAML legível, preservando a estrutura e os tipos',
  category: 'conversores',
  keywords: ['json', 'yaml', 'yml', 'converter', 'configuração'],
  icon: '📑',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    text: z.string().max(2_000_000),
    indent: z.enum(['2', '4']).default('2'),
  }),
  outputSchema: z.object({ yaml: z.string() }),
  execute: ({ text, indent }) => ({ yaml: jsonToYaml(text, Number(indent)) }),
  fields: {
    text: { label: 'JSON', multiline: true, placeholder: '{"nome": "Gen", "itens": [1, 2]}' },
    indent: { label: 'Indentação', optionLabels: { '2': '2 espaços', '4': '4 espaços' } },
  },
  outputLabels: { yaml: 'YAML' },
  examples: [
    {
      description: 'Objeto com lista',
      input: { text: '{"nome":"Gen","itens":[1,2],"ativo":true}', indent: '2' },
      output: { yaml: 'nome: Gen\nitens:\n  - 1\n  - 2\nativo: true\n' },
    },
  ],
  documentation:
    'Lê o JSON de forma estrita e o reescreve em YAML 1.2 (biblioteca "yaml"). Textos que poderiam ser lidos como outro tipo (como "true", "123" ou "null") são colocados entre aspas para preservar o tipo original. Linhas longas não são quebradas.',
});

// ---------- CSV -> JSON ----------

export function csvToJson(
  text: string,
  options: { delimiter: ',' | ';' | '\t' | '|' | 'auto'; header: boolean; types: boolean }
): { json: string; rows: number; columns: number } {
  if (text.trim() === '') throw new ToolError('Entrada vazia');
  const result = Papa.parse<unknown>(text, {
    header: options.header,
    delimiter: options.delimiter === 'auto' ? '' : options.delimiter,
    skipEmptyLines: 'greedy',
    dynamicTyping: options.types,
  });
  const fatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
  if (fatal) {
    const where = fatal.row !== undefined ? ` (linha ${fatal.row + 1})` : '';
    throw new ToolError(`CSV inválido${where}: ${fatal.message}`);
  }
  const rows = result.data;
  const first = rows[0];
  const columns = Array.isArray(first) ? first.length : first && typeof first === 'object' ? Object.keys(first).length : 0;
  return { json: JSON.stringify(rows, null, 2), rows: rows.length, columns };
}

export const csvToJsonTool = defineTool({
  id: 'csv-json',
  name: 'CSV para JSON',
  description: 'Converte CSV em JSON, com detecção de delimitador e conversão opcional de números e booleanos',
  category: 'conversores',
  keywords: ['csv', 'json', 'converter', 'planilha', 'tabela', 'delimitador'],
  icon: '🗂️',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    text: z.string().max(5_000_000),
    delimiter: z.enum(['auto', ',', ';', '\t', '|']).default('auto'),
    header: z.boolean().default(true),
    types: z.boolean().default(false),
  }),
  outputSchema: z.object({ json: z.string(), rows: z.number(), columns: z.number() }),
  execute: ({ text, ...options }) => csvToJson(text, options),
  fields: {
    text: { label: 'CSV', multiline: true, placeholder: 'nome;idade\nAna;31\nBruno;28' },
    delimiter: { label: 'Delimitador', optionLabels: { auto: 'Detectar', ',': 'Vírgula (,)', ';': 'Ponto e vírgula (;)', '\t': 'Tabulação', '|': 'Barra vertical (|)' } },
    header: { label: 'A primeira linha contém os nomes das colunas' },
    types: { label: 'Converter números e booleanos (em vez de manter texto)' },
  },
  outputLabels: { json: 'JSON', rows: 'Linhas', columns: 'Colunas' },
  examples: [
    {
      description: 'Ponto e vírgula, com tipos',
      input: { text: 'nome;idade\nAna;31\nBruno;28', delimiter: ';', header: true, types: true },
      output: { rows: 2, columns: 2 },
    },
  ],
  documentation:
    'Usa um analisador CSV completo: campos entre aspas, vírgulas e quebras de linha dentro de aspas e aspas duplicadas ("") são tratados corretamente. Por padrão todos os valores permanecem como texto, o que preserva zeros à esquerda (como em CEPs e CPFs); ative a conversão de tipos apenas se quiser números e booleanos reais.',
});
