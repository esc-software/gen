import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Command, CommanderError } from 'commander';
import { base64ToBytes, bytesToBase64, describeInput, type DownloadSpec, type InputField, type Tool } from '@esc/gen-core';
import { registry } from '@esc/gen-tools';

export const CLI_VERSION = '0.3.0';

export interface CliIO {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Escreve bytes crus na saída padrão (`--raw` de campos binários). */
  outBytes?: (bytes: Uint8Array) => void;
  /** Lê toda a entrada padrão (usada por `--input -`). */
  readStdin?: () => Promise<string>;
  /** Diretório base para caminhos relativos (padrão: o diretório atual). */
  cwd?: string;
}

const defaultIO: CliIO = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  outBytes: (b) => process.stdout.write(b),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  },
};

/** Erro de uso ou de execução da ferramenta; a mensagem é segura para o usuário. */
class UsageError extends Error {}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip',
};
const MAX_STDIN_BYTES = 70 * 1024 * 1024;

const collect = (value: string, previous: string[]) => [...previous, value];
const available = (t: Tool) => t.modes.includes('node');

function getTool(id: string): Tool {
  const tool = registry.get(id);
  if (!tool) throw new UsageError(`Ferramenta "${id}" não encontrada (veja \`gen list\`)`);
  if (!available(tool)) throw new UsageError(`"${id}" funciona apenas no navegador; use o site do Gen`);
  return tool;
}

/** Converte `--set campo=valor` para o tipo do campo. */
export function coerce(field: InputField | undefined, name: string, raw: string): unknown {
  if (!field) return tryJson(raw);
  switch (field.type) {
    case 'number':
    case 'integer': {
      const n = Number(raw.replace(',', '.'));
      if (raw.trim() === '' || !Number.isFinite(n)) throw new UsageError(`${name}: "${raw}" não é um número`);
      return n;
    }
    case 'boolean':
      if (/^(true|sim|1|yes)$/i.test(raw)) return true;
      if (/^(false|nao|não|0|no)$/i.test(raw)) return false;
      throw new UsageError(`${name}: use true ou false`);
    case 'string':
      return raw;
    default:
      return tryJson(raw);
  }
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function splitPair(pair: string, flag: string): [string, string] {
  const at = pair.indexOf('=');
  if (at < 1) throw new UsageError(`${flag} espera o formato campo=valor (recebido "${pair}")`);
  return [pair.slice(0, at), pair.slice(at + 1)];
}

/** Nome seguro para gravar: só o último segmento, sem caracteres de controle nem separadores. */
export function safeFileName(name: string, fallback: string): string {
  const last = name.replace(/\\/g, '/').split('/').pop() ?? '';
  // Caracteres de controle e os proibidos no Windows viram "_" (inclui "C:" no início, que o Windows trata como unidade).
  const base = [...last].map((ch) => (ch.charCodeAt(0) < 32 || '<>:"|?*'.includes(ch) ? '_' : ch)).join('').trim();
  return base && base !== '.' && base !== '..' ? base : fallback;
}

async function readFilePayload(path: string, field: InputField, cwd: string) {
  const full = resolve(cwd, path);
  let info;
  try {
    info = await stat(full);
  } catch {
    throw new UsageError(`Arquivo não encontrado: ${path}`);
  }
  if (!info.isFile()) throw new UsageError(`${path} não é um arquivo`);
  const limit = (field.maxSizeMB ?? 50) * 1024 * 1024;
  if (info.size > limit) throw new UsageError(`${path} tem mais de ${field.maxSizeMB ?? 50} MB`);
  const bytes = await readFile(full);
  return { name: basename(full), type: MIME[extname(full).toLowerCase()] ?? 'application/octet-stream', data: bytesToBase64(new Uint8Array(bytes)) };
}

function downloadBytes(spec: DownloadSpec, value: string): Uint8Array {
  return spec.encoding === 'base64' ? base64ToBytes(value) : new TextEncoder().encode(value);
}

const describeField = (f: InputField) =>
  `${f.name}\t${f.type}${f.required ? '*' : ''}${f.options ? ` [${f.options.join('|')}]` : ''}${f.default !== undefined ? ` (padrão: ${JSON.stringify(f.default)})` : ''}\t${f.label ?? ''}`;

export function buildProgram(io: CliIO = defaultIO): Command {
  const cwd = io.cwd ?? process.cwd();
  const program = new Command('gen')
    .description('Ferramentas do ESC Gen no terminal')
    .version(CLI_VERSION)
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });

  program
    .command('list')
    .description('Lista as ferramentas disponíveis no terminal')
    .option('--json', 'saída em JSON')
    .option('-c, --category <id>', 'filtra por categoria')
    .option('-q, --search <texto>', 'busca por nome, descrição e palavras-chave')
    .action((opts: { json?: boolean; category?: string; search?: string }) => {
      let list = opts.search ? registry.search(opts.search) : registry.list();
      if (opts.category) list = list.filter((t) => t.category === opts.category);
      const tools = list.filter(available).map(({ id, name, category }) => ({ id, name, category }));
      if (opts.json) io.out(JSON.stringify(tools, null, 2) + '\n');
      else io.out(tools.map((t) => `${t.id}\t${t.name}`).join('\n') + (tools.length ? '\n' : ''));
    });

  program
    .command('info')
    .description('Mostra a descrição e os campos de uma ferramenta')
    .argument('<tool>', 'id da ferramenta')
    .option('--json', 'saída em JSON')
    .action((id: string, opts: { json?: boolean }) => {
      const tool = getTool(id);
      const fields = describeInput(tool);
      if (opts.json) {
        io.out(JSON.stringify({ id: tool.id, name: tool.name, description: tool.description, category: tool.category, documentation: tool.documentation, fields, examples: tool.examples }, null, 2) + '\n');
        return;
      }
      io.out([`${tool.name} (${tool.id})`, tool.description, '', 'Campos (* = obrigatório):', ...fields.map(describeField), '', tool.documentation, ''].join('\n'));
    });

  program
    .command('run')
    .description('Executa uma ferramenta')
    .argument('<tool>', 'id da ferramenta (veja `gen list`)')
    .option('-i, --input <json>', 'entrada em JSON; use "-" para ler da entrada padrão')
    .option('-F, --input-file <caminho>', 'lê a entrada em JSON de um arquivo')
    .option('-s, --set <campo=valor>', 'define um campo (repetível); converte pelo tipo do campo', collect, [] as string[])
    .option('-f, --file <campo=caminho>', 'envia um arquivo para um campo de arquivo (repetível em campos de vários arquivos)', collect, [] as string[])
    .option('-o, --output <pasta>', 'grava os arquivos gerados nesta pasta')
    .option('--force', 'sobrescreve arquivos existentes ao gravar')
    .option('--raw <campo>', 'imprime só o valor deste campo (binário vai cru para a saída padrão)')
    .action(async (id: string, opts: { input?: string; inputFile?: string; set: string[]; file: string[]; output?: string; force?: boolean; raw?: string }) => {
      const tool = getTool(id);
      const fields = describeInput(tool);
      const byName = new Map(fields.map((f) => [f.name, f]));

      if (opts.input !== undefined && opts.inputFile !== undefined) throw new UsageError('Use --input ou --input-file, não os dois');
      let text = opts.input;
      if (opts.inputFile !== undefined) {
        try {
          text = await readFile(resolve(cwd, opts.inputFile), 'utf8');
        } catch {
          throw new UsageError(`Arquivo não encontrado: ${opts.inputFile}`);
        }
      } else if (text === '-') {
        if (!io.readStdin) throw new UsageError('Leitura da entrada padrão indisponível');
        text = await io.readStdin();
        if (text.length > MAX_STDIN_BYTES) throw new UsageError('Entrada grande demais');
      }
      let input: Record<string, unknown> = {};
      if (text !== undefined && text.trim() !== '') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new UsageError('A entrada não é um JSON válido');
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new UsageError('A entrada precisa ser um objeto JSON');
        input = parsed as Record<string, unknown>;
        const unknown = Object.keys(input).filter((key) => !byName.has(key));
        if (unknown.length > 0) io.err(`Aviso: campos ignorados em ${tool.id}: ${unknown.join(', ')} (veja "gen info ${tool.id}")\n`);
      }

      for (const pair of opts.set) {
        const [name, raw] = splitPair(pair, '--set');
        if (name === '__proto__' || name === 'constructor' || name === 'prototype') throw new UsageError(`Campo inválido: ${name}`);
        const field = byName.get(name);
        // Campo digitado errado não pode virar resultado do valor padrão em silêncio.
        if (!field) throw new UsageError(`Campo desconhecido "${name}". Campos de ${tool.id}: ${[...byName.keys()].join(', ')} (veja "gen info ${tool.id}")`);
        input[name] = coerce(field, name, raw);
      }

      const fileFields = new Map<string, string[]>();
      for (const pair of opts.file) {
        const [name, path] = splitPair(pair, '--file');
        const field = byName.get(name);
        if (!field || (field.type !== 'file' && field.type !== 'files')) throw new UsageError(`"${name}" não é um campo de arquivo desta ferramenta`);
        fileFields.set(name, [...(fileFields.get(name) ?? []), path]);
      }
      for (const [name, paths] of fileFields) {
        const field = byName.get(name) as InputField;
        if (field.type === 'file' && paths.length > 1) throw new UsageError(`"${name}" aceita um único arquivo`);
        const payloads = [];
        for (const p of paths) payloads.push(await readFilePayload(p, field, cwd));
        input[name] = field.type === 'files' ? payloads : payloads[0];
      }

      const result = await registry.run(id, input);
      if (!result.ok) {
        const details = (result.error.issues ?? []).map((i) => `  ${i.path || '(raiz)'}: ${i.message}`);
        throw new UsageError([result.error.message, ...details].join('\n'));
      }
      const data = result.data as Record<string, unknown>;
      const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);

      if (opts.raw !== undefined) {
        const value = isObject ? data[opts.raw] : undefined;
        if (typeof value !== 'string') throw new UsageError(`O resultado não tem o campo de texto "${opts.raw}"`);
        const spec = tool.downloads.find((d) => d.field === opts.raw);
        if (spec?.encoding === 'base64') {
          if (!io.outBytes) throw new UsageError('Saída binária indisponível');
          io.outBytes(base64ToBytes(value));
        } else io.out(value.endsWith('\n') ? value : `${value}\n`);
        return;
      }

      const shown: Record<string, unknown> = isObject ? { ...data } : { result: data };
      const written: string[] = [];
      if (isObject) {
        if (opts.output !== undefined) await mkdir(resolve(cwd, opts.output), { recursive: true });
        for (const spec of tool.downloads) {
          const value = data[spec.field];
          if (typeof value !== 'string' || value === '') continue;
          if (opts.output !== undefined) {
            const name = safeFileName(typeof data.fileName === 'string' && data.fileName ? data.fileName : spec.fileName, spec.fileName);
            const target = join(resolve(cwd, opts.output), name);
            try {
              await writeFile(target, downloadBytes(spec, value), { flag: opts.force ? 'w' : 'wx' });
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new UsageError(`${target} já existe (use --force para sobrescrever)`);
              throw new UsageError(`Não foi possível gravar ${target}`);
            }
            written.push(target);
            shown[spec.field] = `(gravado em ${target})`;
          } else if (tool.hiddenOutputs.includes(spec.field)) {
            shown[spec.field] = `(${downloadBytes(spec, value).length} bytes omitidos; use --output <pasta> ou --raw ${spec.field})`;
          }
        }
        for (const key of tool.hiddenOutputs) {
          const value = shown[key];
          if (typeof value === 'string' && value.length > 200 && !value.startsWith('(')) shown[key] = `(${value.length} caracteres omitidos; use --raw ${key})`;
        }
      }
      io.out(JSON.stringify(shown, null, 2) + '\n');
    });

  return program;
}

/** Executa a CLI e devolve o código de saída: 0 sucesso, 1 erro de uso/entrada, 2 falha inesperada. */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv, { from: 'user' });
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode;
    if (e instanceof UsageError) {
      io.err(`Erro: ${e.message}\n`);
      return 1;
    }
    io.err('Erro inesperado\n');
    return 2;
  }
}
