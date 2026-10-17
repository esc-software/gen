import { base64ToBytes, describeInput, type InputField, type Tool, type ToolRegistry } from '@esc/gen-core';

/** Lógica pura da extensão, separada da API `vscode` para ser testável. */

export function generateUuidText(): string {
  return crypto.randomUUID();
}

/** Ferramentas que a extensão consegue executar: as que rodam no Node (nada de canvas nem rede). */
export function runnableTools(registry: ToolRegistry): Tool[] {
  return registry.list().filter((t) => t.modes.includes('node')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export interface QuickCommand {
  /** Id do comando em `package.json` (`gen.<nome>`). */
  command: string;
  tool: string;
  /** `insert` coloca o resultado no cursor; `replace` troca a seleção pelo resultado. */
  mode: 'insert' | 'replace';
  /** Campo de texto que recebe a seleção (modo `replace`). */
  selectionField?: string;
  /** Campos fixos da entrada. */
  input: Record<string, unknown>;
  /** Campo do resultado que vira o texto inserido. */
  resultField: string;
}

export const QUICK_COMMANDS: readonly QuickCommand[] = [
  { command: 'gen.generateUuid', tool: 'uuid', mode: 'insert', input: { count: 1 }, resultField: 'uuids' },
  { command: 'gen.generateCpf', tool: 'cpf', mode: 'insert', input: { action: 'generate' }, resultField: 'cpf' },
  { command: 'gen.generateCnpj', tool: 'cnpj', mode: 'insert', input: { action: 'generate' }, resultField: 'cnpj' },
  { command: 'gen.generatePassword', tool: 'senha', mode: 'insert', input: {}, resultField: 'password' },
  { command: 'gen.base64Encode', tool: 'base64', mode: 'replace', selectionField: 'text', input: { action: 'encode' }, resultField: 'result' },
  { command: 'gen.base64Decode', tool: 'base64', mode: 'replace', selectionField: 'text', input: { action: 'decode' }, resultField: 'result' },
  { command: 'gen.formatJson', tool: 'json', mode: 'replace', selectionField: 'text', input: { mode: 'format' }, resultField: 'result' },
  { command: 'gen.minifyJson', tool: 'json', mode: 'replace', selectionField: 'text', input: { mode: 'minify' }, resultField: 'result' },
  { command: 'gen.slugify', tool: 'slug', mode: 'replace', selectionField: 'text', input: {}, resultField: 'slug' },
];

/** Texto do resultado: strings viram elas mesmas; listas, uma por linha. */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => textOf(v)).join('\n');
  return JSON.stringify(value, null, 2);
}

export type QuickOutcome = { ok: true; text: string } | { ok: false; message: string };

/** Executa um comando rápido sobre um texto (a seleção, quando houver). */
export async function runQuick(registry: ToolRegistry, quick: QuickCommand, selection: string): Promise<QuickOutcome> {
  const tool = registry.get(quick.tool);
  if (!tool) return { ok: false, message: `Ferramenta "${quick.tool}" não encontrada` };
  if (quick.mode === 'replace' && selection.trim() === '') return { ok: false, message: 'Selecione um texto para transformar.' };
  const input = quick.selectionField ? { ...quick.input, [quick.selectionField]: selection } : { ...quick.input };
  const result = await tool.run(input);
  if (!result.ok) return { ok: false, message: [result.error.message, ...(result.error.issues ?? []).map((i) => `${i.path}: ${i.message}`)].join(' — ') };
  const data = result.data as Record<string, unknown>;
  const value = data[quick.resultField];
  if (value === undefined) return { ok: false, message: 'A ferramenta não devolveu o resultado esperado.' };
  return { ok: true, text: textOf(value) };
}

// ---------- "Run Tool": formulário por campos ----------

export interface FieldPlan {
  field: InputField;
  /** Valor inicial (a seleção do editor entra no primeiro campo de texto). */
  initial?: string;
}

export function planFields(tool: Tool, selection: string): FieldPlan[] {
  let used = false;
  return describeInput(tool).map((field) => {
    if (!used && selection.trim() !== '' && field.type === 'string' && !field.options && field.inputType !== 'date') {
      used = true;
      return { field, initial: selection };
    }
    return { field, ...(field.default !== undefined ? { initial: String(field.default) } : {}) };
  });
}

export type ParsedValue = { ok: true; value: unknown; skip?: boolean } | { ok: false; message: string };

/** Converte o texto digitado pelo tipo do campo. Vazio em campo opcional significa "usar o padrão". */
export function parseFieldValue(field: InputField, raw: string): ParsedValue {
  if (raw.trim() === '' && field.type !== 'string') {
    return field.required && field.default === undefined ? { ok: false, message: 'Campo obrigatório' } : { ok: true, value: undefined, skip: true };
  }
  switch (field.type) {
    case 'number':
    case 'integer': {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n)) return { ok: false, message: 'Digite um número' };
      if (field.type === 'integer' && !Number.isInteger(n)) return { ok: false, message: 'Digite um número inteiro' };
      if (field.min !== undefined && n < field.min) return { ok: false, message: `Mínimo: ${field.min}` };
      if (field.max !== undefined && n > field.max) return { ok: false, message: `Máximo: ${field.max}` };
      return { ok: true, value: n };
    }
    case 'boolean':
      if (/^(true|sim|s|1|yes)$/i.test(raw.trim())) return { ok: true, value: true };
      if (/^(false|nao|não|n|0|no)$/i.test(raw.trim())) return { ok: true, value: false };
      return { ok: false, message: 'Responda sim ou não' };
    case 'string':
      if (raw === '' && !field.required) return { ok: true, value: undefined, skip: true };
      return { ok: true, value: raw };
    default:
      return { ok: false, message: 'Este tipo de campo usa o seletor de arquivos' };
  }
}

export interface OutputFile {
  fileName: string;
  bytes: Uint8Array;
}

/** Arquivos gerados pela ferramenta (planilhas, PDFs, imagens...), prontos para salvar. */
export function outputFiles(tool: Tool, data: unknown): OutputFile[] {
  if (typeof data !== 'object' || data === null) return [];
  const record = data as Record<string, unknown>;
  const files: OutputFile[] = [];
  for (const spec of tool.downloads) {
    const value = record[spec.field];
    if (typeof value !== 'string' || value === '') continue;
    const given = typeof record.fileName === 'string' && record.fileName ? record.fileName : spec.fileName;
    const fileName = (given.replace(/\\/g, '/').split('/').pop() ?? spec.fileName).replace(/[<>:"|?*]/g, '_') || spec.fileName;
    files.push({ fileName, bytes: spec.encoding === 'base64' ? base64ToBytes(value) : new TextEncoder().encode(value) });
  }
  return files;
}

/** Resultado legível: oculta conteúdo binário/volumoso e formata o restante. */
export function displayResult(tool: Tool, data: unknown): string {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return textOf(data);
  const shown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (tool.hiddenOutputs.includes(key)) continue;
    shown[tool.outputLabels[key] ?? key] = value;
  }
  const entries = Object.entries(shown);
  // Um único texto vira o próprio texto, para colar direto.
  if (entries.length === 1 && typeof entries[0]?.[1] === 'string') return entries[0][1];
  return JSON.stringify(shown, null, 2);
}
