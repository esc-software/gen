import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { categoryIdSchema, type CategoryId } from './categories.js';

/**
 * Onde a ferramenta pode executar:
 * - `browser`: localmente no navegador;
 * - `node`: localmente no terminal, no VS Code ou em pacotes npm;
 * - `remote`: no servidor, por meio da API.
 * Uma ferramenta pode declarar mais de um modo; o resultado deve ser o mesmo em todos.
 */
export type ExecutionMode = 'browser' | 'node' | 'remote';

export type ToolFailureCode = 'not_found' | 'invalid_input' | 'execution_failed' | 'invalid_output';

export interface ToolIssue {
  path: string;
  message: string;
}

export interface ToolFailure {
  code: ToolFailureCode;
  message: string;
  issues?: ToolIssue[];
}

export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ToolFailure };

/**
 * Erro esperado de uma ferramenta (por exemplo, "Base64 inválido"). A mensagem é segura para
 * ser mostrada ao usuário. Qualquer outro erro é tratado como falha interna e a mensagem
 * original não é exposta.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolExample<I = unknown, O = unknown> {
  description?: string;
  input: I;
  /**
   * Subconjunto da saída que deve ser produzido (comparação parcial, em profundidade).
   * Omitir em ferramentas não determinísticas (geradores).
   */
  output?: O extends object ? Partial<O> : O;
}

/** Dicas de apresentação de um campo; não afetam a validação. */
export interface FieldHint {
  label?: string;
  help?: string;
  placeholder?: string;
  /** Campo de texto longo (textarea). */
  multiline?: boolean;
  /** Tipo de entrada HTML especializado. */
  inputType?: 'date';
  /** Para campos de arquivo: tipos aceitos (atributo `accept` do HTML), como "application/pdf". */
  accept?: string;
  /** Para campos de arquivo: tamanho máximo de cada arquivo, em MB (padrão 20). */
  maxSizeMB?: number;
  /** Rótulos legíveis para as opções de um enum. */
  optionLabels?: Record<string, string>;
}

/** Campo do resultado que a interface oferece como arquivo para baixar. */
export interface DownloadSpec {
  /** Chave do resultado cujo valor será o conteúdo do arquivo. */
  field: string;
  fileName: string;
  mimeType: string;
  label?: string;
  /** `text` (padrão) usa o valor como texto; `base64` decodifica binário. */
  encoding?: 'text' | 'base64';
}

/** Contrato de uma ferramenta, independente de interface (web, CLI, VS Code, API). */
export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: CategoryId;
  readonly keywords: readonly string[];
  readonly icon: string;
  readonly modes: readonly ExecutionMode[];
  readonly inputSchema: z.ZodTypeAny;
  readonly outputSchema: z.ZodTypeAny;
  readonly examples: readonly ToolExample[];
  readonly documentation: string;
  /** Dicas de apresentação por campo de entrada. */
  readonly fields: Readonly<Record<string, FieldHint>>;
  /** Rótulos legíveis para as chaves do resultado. */
  readonly outputLabels: Readonly<Record<string, string>>;
  /** Campos do resultado oferecidos para download. */
  readonly downloads: readonly DownloadSpec[];
  /** Chaves do resultado que a interface não exibe como texto (conteúdo binário ou muito longo, usado em downloads). */
  readonly hiddenOutputs: readonly string[];
  /** Ferramenta leve que a interface executa a cada alteração, sem botão "Executar". */
  readonly live: boolean;
  /** Identificador de um componente de interface próprio, para ferramentas que não cabem no formulário genérico. */
  readonly ui?: string;
  /** Valida a entrada, executa e valida a saída. Nunca lança. */
  run(rawInput: unknown): Promise<ToolResult>;
}

export interface ToolDefinition<S extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  keywords: string[];
  icon: string;
  modes: ExecutionMode[];
  inputSchema: S;
  outputSchema: O;
  execute: (input: z.output<S>) => z.input<O> | Promise<z.input<O>>;
  examples?: ToolExample<z.input<S>, z.output<O>>[];
  documentation: string;
  fields?: Record<string, FieldHint>;
  outputLabels?: Record<string, string>;
  downloads?: DownloadSpec[];
  hiddenOutputs?: string[];
  live?: boolean;
  ui?: string;
}

const metadataSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'id deve ser kebab-case minúsculo'),
  name: z.string().min(1),
  description: z.string().min(1),
  category: categoryIdSchema,
  keywords: z.array(z.string().min(1)).min(1),
  icon: z.string().min(1),
  modes: z.array(z.enum(['browser', 'node', 'remote'])).min(1),
  documentation: z.string().min(1),
});

function toIssues(error: z.ZodError): ToolIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function failure(code: ToolFailureCode, message: string, issues?: ToolIssue[]): ToolResult<never> {
  return { ok: false, error: issues ? { code, message, issues } : { code, message } };
}

/**
 * Cria uma ferramenta. Valida os metadados e os exemplos no momento da definição,
 * então uma ferramenta malformada falha ao ser carregada, não ao ser usada.
 */
export function defineTool<S extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  def: ToolDefinition<S, O>
): Tool {
  const meta = metadataSchema.safeParse(def);
  if (!meta.success) {
    const detail = meta.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Ferramenta "${def.id}" inválida: ${detail}`);
  }

  const examples: ToolExample[] = def.examples ?? [];
  examples.forEach((example, index) => {
    const parsed = def.inputSchema.safeParse(example.input);
    if (!parsed.success) {
      throw new Error(`Ferramenta "${def.id}": exemplo #${index + 1} não satisfaz o inputSchema`);
    }
  });

  const run = async (rawInput: unknown): Promise<ToolResult> => {
    const parsed = def.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return failure('invalid_input', 'Entrada inválida', toIssues(parsed.error));
    }

    let output: unknown;
    try {
      output = await def.execute(parsed.data);
    } catch (e) {
      if (e instanceof ToolError) return failure('execution_failed', e.message);
      return failure('execution_failed', 'Falha interna ao executar a ferramenta');
    }

    const checked = def.outputSchema.safeParse(output);
    if (!checked.success) {
      return failure('invalid_output', 'A ferramenta produziu uma saída inválida');
    }
    return { ok: true, data: checked.data };
  };

  return Object.freeze({
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    keywords: Object.freeze([...def.keywords]),
    icon: def.icon,
    modes: Object.freeze([...def.modes]),
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    examples: Object.freeze(examples),
    documentation: def.documentation,
    fields: Object.freeze({ ...(def.fields ?? {}) }),
    outputLabels: Object.freeze({ ...(def.outputLabels ?? {}) }),
    downloads: Object.freeze([...(def.downloads ?? [])]),
    hiddenOutputs: Object.freeze([...(def.hiddenOutputs ?? [])]),
    live: def.live ?? false,
    ...(def.ui ? { ui: def.ui } : {}),
    run,
  });
}

export interface InputField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'file' | 'files';
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
  required: boolean;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
  inputType?: 'date';
  options?: string[];
  optionLabels?: Record<string, string>;
  default?: unknown;
  min?: number;
  max?: number;
}

/** Arquivo recebido da interface: nome, tipo MIME declarado e conteúdo em Base64 (sem o prefixo data:). */
export const filePayloadSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().max(100).default(''),
  data: z.string().min(1),
});
export type FilePayload = z.infer<typeof filePayloadSchema>;

type JsonProp = Record<string, unknown>;

const isFileObject = (p: JsonProp | undefined): boolean => {
  const props = p?.properties as Record<string, unknown> | undefined;
  return p?.type === 'object' && props !== undefined && 'name' in props && 'data' in props;
};

function fieldKind(prop: JsonProp): InputField['type'] | undefined {
  const type = prop.type;
  if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') return type;
  if (isFileObject(prop)) return 'file';
  if (type === 'array' && isFileObject(prop.items as JsonProp | undefined)) return 'files';
  return undefined;
}

/** Descreve os campos do `inputSchema` (objeto plano) para a UI montar um formulário. */
export function describeInput(tool: Tool): InputField[] {
  const json = zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' }) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).flatMap(([name, prop]) => {
    const hint = tool.fields[name] ?? {};
    const kind = fieldKind(prop);
    if (kind === undefined) return [];
    const field: InputField = { name, label: hint.label ?? name, type: kind, required: required.has(name) };
    if (kind === 'file' || kind === 'files') {
      if (hint.accept) field.accept = hint.accept;
      field.maxSizeMB = hint.maxSizeMB ?? 20;
      if (kind === 'files' && typeof prop.maxItems === 'number') field.maxFiles = prop.maxItems;
    }
    if (hint.help) field.help = hint.help;
    if (hint.placeholder) field.placeholder = hint.placeholder;
    if (hint.multiline) field.multiline = true;
    if (hint.inputType) field.inputType = hint.inputType;
    if (hint.optionLabels) field.optionLabels = hint.optionLabels;
    if (Array.isArray(prop.enum)) field.options = prop.enum.map(String);
    if (prop.default !== undefined) field.default = prop.default;
    if (typeof prop.minimum === 'number') field.min = prop.minimum;
    if (typeof prop.maximum === 'number') field.max = prop.maximum;
    return [field];
  });
}

/** Valores iniciais de um formulário: `default` do schema ou primeira opção de um enum. */
export function defaultInput(fields: InputField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.name] = f.default;
    else if (f.options && f.options.length > 0 && f.required) out[f.name] = f.options[0];
  }
  return out;
}
