import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ToolError,
  createRegistry,
  defaultInput,
  defineTool,
  describeInput,
  normalizeText,
  filePayloadSchema,
  base64ToBytes,
  bytesToBase64,
} from './index.js';

const double = defineTool({
  id: 'double',
  name: 'Dobrar número',
  description: 'Multiplica um número por dois',
  category: 'calculadoras',
  keywords: ['dobro', 'multiplicar'],
  icon: '✖️',
  modes: ['browser', 'node'],
  inputSchema: z.object({ n: z.number().int().min(0).max(1000) }),
  outputSchema: z.object({ result: z.number() }),
  execute: ({ n }) => ({ result: n * 2 }),
  examples: [{ input: { n: 4 }, output: { result: 8 } }],
  documentation: 'Exemplo usado nos testes do núcleo.',
});

describe('defineTool / run', () => {
  it('executa com entrada válida', async () => {
    expect(await double.run({ n: 21 })).toEqual({ ok: true, data: { result: 42 } });
  });

  it('rejeita entrada inválida com os caminhos dos problemas', async () => {
    const res = await double.run({ n: -1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('invalid_input');
      expect(res.error.issues?.[0]?.path).toBe('n');
    }
  });

  it('não lança com entrada de tipo errado', async () => {
    expect((await double.run('texto')).ok).toBe(false);
    expect((await double.run(undefined)).ok).toBe(false);
  });

  it('expõe a mensagem de ToolError, mas esconde erros internos', async () => {
    const make = (fn: () => never) =>
      defineTool({
        id: 'boom',
        name: 'Boom',
        description: 'Sempre falha',
        category: 'utilidades',
        keywords: ['boom'],
        icon: '💥',
        modes: ['node'],
        inputSchema: z.object({}),
        outputSchema: z.string(),
        execute: fn,
        documentation: 'Teste.',
      });

    const expected = await make(() => {
      throw new ToolError('Entrada não suportada');
    }).run({});
    expect(expected).toEqual({
      ok: false,
      error: { code: 'execution_failed', message: 'Entrada não suportada' },
    });

    const internal = await make(() => {
      throw new Error('segredo: /etc/passwd');
    }).run({});
    expect(internal.ok).toBe(false);
    if (!internal.ok) expect(internal.error.message).not.toContain('segredo');
  });

  it('detecta saída que viola o outputSchema', async () => {
    const bad = defineTool({
      id: 'bad-output',
      name: 'Saída ruim',
      description: 'Devolve o tipo errado',
      category: 'utilidades',
      keywords: ['teste'],
      icon: '🐛',
      modes: ['node'],
      inputSchema: z.object({}),
      outputSchema: z.object({ value: z.string() }),
      // @ts-expect-error - propositalmente fora do contrato
      execute: () => ({ value: 1 }),
      documentation: 'Teste.',
    });
    const res = await bad.run({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('invalid_output');
  });

  it('rejeita metadados inválidos na definição', () => {
    expect(() =>
      defineTool({
        id: 'Id Inválido',
        name: 'x',
        description: 'x',
        category: 'utilidades',
        keywords: ['x'],
        icon: 'x',
        modes: ['node'],
        inputSchema: z.object({}),
        outputSchema: z.string(),
        execute: () => 'x',
        documentation: 'x',
      })
    ).toThrow(/kebab-case/);
  });

  it('rejeita exemplo que não satisfaz o inputSchema', () => {
    expect(() =>
      defineTool({
        id: 'exemplo-ruim',
        name: 'x',
        description: 'x',
        category: 'utilidades',
        keywords: ['x'],
        icon: 'x',
        modes: ['node'],
        inputSchema: z.object({ n: z.number() }),
        outputSchema: z.string(),
        execute: () => 'x',
        // @ts-expect-error - propositalmente inválido
        examples: [{ input: { n: 'abc' } }],
        documentation: 'x',
      })
    ).toThrow(/exemplo #1/);
  });
});

describe('createRegistry', () => {
  it('registra, busca e executa sem tocar no núcleo', async () => {
    const registry = createRegistry();
    registry.register(double);
    expect(registry.size).toBe(1);
    expect(registry.get('double')).toBe(double);
    expect(registry.byCategory('calculadoras')).toEqual([double]);
    expect(registry.byCategory('pdf')).toEqual([]);
    expect(await registry.run('double', { n: 5 })).toEqual({ ok: true, data: { result: 10 } });
  });

  it('não permite registrar o mesmo id duas vezes, salvo com replace', () => {
    const registry = createRegistry();
    registry.register(double);
    expect(() => registry.register(double)).toThrow(/já está registrada/);
    expect(() => registry.register(double, { replace: true })).not.toThrow();
  });

  it('run devolve not_found para id desconhecido', async () => {
    const res = await createRegistry().run('nada', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('not_found');
  });

  it('busca ignora acentos e caixa, exige todos os termos e ordena por relevância', () => {
    const registry = createRegistry();
    registry.register(double);
    expect(registry.search('DÓBRAR')).toHaveLength(1);
    expect(registry.search('multiplicar numero')).toHaveLength(1);
    expect(registry.search('multiplicar cpf')).toHaveLength(0);
    expect(registry.search('  ')).toHaveLength(1);
  });

  it('registros são independentes entre si', () => {
    const a = createRegistry();
    const b = createRegistry();
    a.register(double);
    expect(b.size).toBe(0);
  });
});

describe('describeInput / defaultInput', () => {
  const tool = defineTool({
    id: 'formulario',
    name: 'Formulário',
    description: 'Cobre os tipos de campo',
    category: 'utilidades',
    keywords: ['form'],
    icon: '📝',
    modes: ['browser'],
    inputSchema: z.object({
      action: z.enum(['a', 'b']).default('b'),
      mode: z.enum(['x', 'y']),
      length: z.number().int().min(1).max(64).default(16),
      text: z.string().optional(),
      flag: z.boolean().default(false),
    }),
    outputSchema: z.unknown(),
    execute: () => null,
    documentation: 'Teste.',
  });

  it('descreve tipos, opções, limites e obrigatoriedade', () => {
    const fields = describeInput(tool);
    const by = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(by.action).toMatchObject({ type: 'string', options: ['a', 'b'], default: 'b' });
    expect(by.mode).toMatchObject({ options: ['x', 'y'], required: true });
    expect(by.length).toMatchObject({ type: 'integer', min: 1, max: 64, default: 16 });
    expect(by.text).toMatchObject({ type: 'string', required: false });
    expect(by.flag).toMatchObject({ type: 'boolean', default: false });
  });

  it('aplica dicas de apresentação aos campos e expõe live', () => {
    const hinted = defineTool({
      id: 'com-dicas',
      name: 'Com dicas',
      description: 'Usa fields e live',
      category: 'utilidades',
      keywords: ['dicas'],
      icon: '💡',
      modes: ['browser'],
      inputSchema: z.object({ text: z.string(), mode: z.enum(['a', 'b']).default('a') }),
      outputSchema: z.unknown(),
      execute: () => null,
      live: true,
      fields: {
        text: { label: 'Texto', multiline: true, help: 'Ajuda', placeholder: 'Digite' },
        mode: { optionLabels: { a: 'Opção A', b: 'Opção B' } },
      },
      documentation: 'Teste.',
    });
    expect(hinted.live).toBe(true);
    expect(tool.live).toBe(false);
    const by = Object.fromEntries(describeInput(hinted).map((f) => [f.name, f]));
    expect(by.text).toMatchObject({ label: 'Texto', multiline: true, help: 'Ajuda', placeholder: 'Digite' });
    expect(by.mode).toMatchObject({ label: 'mode', optionLabels: { a: 'Opção A', b: 'Opção B' } });
  });

  it('calcula valores iniciais', () => {
    expect(defaultInput(describeInput(tool))).toEqual({
      action: 'b',
      mode: 'x',
      length: 16,
      flag: false,
    });
  });
});

describe('normalizeText', () => {
  it('remove acentos e baixa a caixa', () => {
    expect(normalizeText('Validação ÇÃO')).toBe('validacao cao');
  });
});

describe('campos de arquivo e Base64', () => {
  const fileTool = defineTool({
    id: 'com-arquivos',
    name: 'Com arquivos',
    description: 'Declara campos de arquivo',
    category: 'pdf',
    keywords: ['arquivo'],
    icon: '📎',
    modes: ['browser'],
    inputSchema: z.object({
      files: z.array(filePayloadSchema).min(1).max(5),
      single: filePayloadSchema.optional(),
      note: z.string().optional(),
    }),
    outputSchema: z.unknown(),
    execute: () => null,
    fields: { files: { label: 'PDFs', accept: 'application/pdf', maxSizeMB: 10 }, single: { label: 'Um arquivo' } },
    documentation: 'Teste.',
  });

  it('descreve campos file e files com os limites', () => {
    const by = Object.fromEntries(describeInput(fileTool).map((f) => [f.name, f]));
    expect(by.files).toMatchObject({ type: 'files', required: true, accept: 'application/pdf', maxSizeMB: 10, maxFiles: 5, label: 'PDFs' });
    expect(by.single).toMatchObject({ type: 'file', required: false, maxSizeMB: 20 });
    expect(by.note).toMatchObject({ type: 'string' });
  });

  it('converte bytes e Base64 nos dois sentidos, inclusive arquivos grandes', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new TextEncoder().encode('abc'))).toBe('YWJj');
    expect(new TextDecoder().decode(base64ToBytes('data:text/plain;base64,YWJj'))).toBe('abc');
    expect(new TextDecoder().decode(base64ToBytes('YW\nJj'))).toBe('abc');
    expect(() => base64ToBytes('***')).toThrow();
  });
});
