import { z } from 'zod';
import Papa from 'papaparse';
import { parse as yamlParse } from 'yaml';
import { ToolError, defineTool } from '@esc/gen-core';
import { describeJsonError } from './json.js';

const MAX_CHARS = 5_000_000;
const MAX_ROWS = 200_000;
const MAX_OUTPUT = 20_000_000;

// ---------- YAML -> JSON ----------

export function yamlToJson(text: string, indent: number): string {
  if (text.trim() === '') throw new ToolError('Entrada vazia');
  let parsed: unknown;
  try {
    // maxAliasCount limita a expansão de âncoras (&a e *a) contra a "bomba de YAML".
    parsed = yamlParse(text, { maxAliasCount: 100, uniqueKeys: true });
  } catch (e) {
    const err = e as { message?: string; linePos?: Array<{ line: number; col: number }> };
    const pos = err.linePos?.[0];
    const where = pos ? ` (linha ${pos.line}, coluna ${pos.col})` : '';
    const reason = (err.message ?? 'erro de sintaxe').split('\n')[0];
    throw new ToolError(`YAML inválido${where}: ${reason}`);
  }
  const json = JSON.stringify(parsed === undefined ? null : parsed, null, indent === 0 ? undefined : indent);
  if (json === undefined) throw new ToolError('O YAML não gera um valor JSON');
  if (json.length > MAX_OUTPUT) throw new ToolError('O resultado ficou grande demais (a expansão de âncoras multiplica o tamanho)');
  return json;
}

export const yamlJsonTool = defineTool({
  id: 'yaml-json',
  name: 'Conversor de YAML para JSON',
  description: 'Converte YAML (docker-compose, Kubernetes, GitHub Actions, OpenAPI) em JSON válido, apontando a linha de qualquer erro',
  category: 'conversores',
  keywords: ['yaml para json', 'yml para json', 'converter yaml', 'yaml to json', 'docker compose json', 'kubernetes yaml', 'openapi', 'github actions'],
  icon: '🔁',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: z.string().max(MAX_CHARS).default(''), indent: z.number().int().min(0).max(8).default(2) }),
  outputSchema: z.object({ json: z.string() }),
  execute: ({ text, indent }) => ({ json: yamlToJson(text, indent) }),
  fields: {
    text: { label: 'YAML', multiline: true, placeholder: 'nome: Maria\nidade: 30\ntags:\n  - dev\n  - qa' },
    indent: { label: 'Espaços de indentação', help: '0 gera o JSON em uma linha.' },
  },
  outputLabels: { json: 'JSON' },
  downloads: [{ field: 'json', fileName: 'resultado.json', mimeType: 'application/json', label: 'Baixar JSON' }],
  examples: [{ description: 'Objeto simples', input: { text: 'nome: Maria\nidade: 30', indent: 0 }, output: { json: '{"nome":"Maria","idade":30}' } }],
  documentation:
    'Lê YAML 1.2 e escreve JSON. Âncoras e aliases (&a e *a) são expandidos, com limite para evitar arquivos que se multiplicam. Etiquetas de tipo personalizadas e execução de código não existem aqui: o texto é só dado. Valores que JSON não representa (como .inf e .nan) viram null. Arquivos YAML com vários documentos (separados por ---) devem ser convertidos um por vez.',
});

// ---------- JSON -> CSV ----------

type Cell = string | number | boolean | null;

function flatten(value: unknown, prefix: string, out: Record<string, Cell>, depth: number): void {
  if (depth > 20) throw new ToolError('O JSON tem objetos aninhados demais para virar colunas');
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix) out[prefix] = '';
    for (const [key, inner] of entries) flatten(inner, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    return;
  }
  if (Array.isArray(value)) out[prefix || 'valor'] = JSON.stringify(value);
  else out[prefix || 'valor'] = value as Cell;
}

/** Evita que uma célula de texto seja interpretada como fórmula pelo Excel e pelo Calc (injeção de CSV). */
function safeCell(cell: Cell | undefined): string | number | boolean {
  if (cell === undefined || cell === null) return '';
  if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell) && !/^-?\d+([.,]\d+)?$/.test(cell)) return `'${cell}`;
  return cell;
}

export function jsonToCsv(text: string, delimiter: ',' | ';' | '\t'): { csv: string; rows: number; columns: number } {
  if (text.trim() === '') throw new ToolError('Entrada vazia');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const info = describeJsonError(text, e);
    const where = info.line !== undefined ? ` (linha ${info.line}, coluna ${info.column})` : '';
    throw new ToolError(`JSON inválido${where}: ${info.message}`);
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length > MAX_ROWS) throw new ToolError(`O JSON tem mais de ${MAX_ROWS.toLocaleString('pt-BR')} itens`);
  const flat = items.map((item) => {
    const row: Record<string, Cell> = {};
    flatten(item, '', row, 0);
    return row;
  });
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of flat) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const data = [columns.map((c) => safeCell(c)), ...flat.map((row) => columns.map((c) => safeCell(row[c])))];
  const csv = Papa.unparse(data, { delimiter, newline: '\n' });
  return { csv, rows: flat.length, columns: columns.length };
}

export const jsonCsvTool = defineTool({
  id: 'json-csv',
  name: 'Conversor de JSON para CSV',
  description: 'Converte uma lista de objetos JSON em CSV para abrir no Excel ou Google Planilhas, com colunas aninhadas achatadas (a.b) e proteção contra fórmulas',
  category: 'conversores',
  keywords: ['json para csv', 'converter json em csv', 'json to csv', 'json para excel', 'json para planilha', 'api para csv', 'exportar json'],
  icon: '🧮',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: z.string().max(MAX_CHARS).default(''), delimiter: z.enum([',', ';', '\t']).default(',') }),
  outputSchema: z.object({ csv: z.string(), rows: z.number(), columns: z.number() }),
  execute: ({ text, delimiter }) => jsonToCsv(text, delimiter),
  fields: {
    text: { label: 'JSON', multiline: true, placeholder: '[{"nome":"Ana","idade":30},{"nome":"Bruno","idade":25}]' },
    delimiter: { label: 'Separador', help: 'No Excel em português, use ponto e vírgula.', optionLabels: { ',': 'Vírgula (,)', ';': 'Ponto e vírgula (;)', '\t': 'Tabulação' } },
  },
  outputLabels: { csv: 'CSV', rows: 'Linhas de dados', columns: 'Colunas' },
  downloads: [{ field: 'csv', fileName: 'resultado.csv', mimeType: 'text/csv', label: 'Baixar CSV' }],
  examples: [{ description: 'Duas pessoas', input: { text: '[{"nome":"Ana","idade":30},{"nome":"Bruno","idade":25}]', delimiter: ',' }, output: { csv: 'nome,idade\nAna,30\nBruno,25', rows: 2, columns: 2 } }],
  documentation:
    'Cada objeto da lista vira uma linha; as colunas são a união das chaves de todos os objetos, na ordem em que aparecem. Objetos aninhados viram colunas com ponto (endereco.cidade) e listas viram texto JSON dentro da célula. Textos que começam com =, +, - ou @ ganham um apóstrofo na frente, para que planilhas não os executem como fórmula (injeção de CSV). Se o JSON for um único objeto, o resultado tem uma linha.',
});
