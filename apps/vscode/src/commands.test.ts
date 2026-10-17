import { describe, expect, it } from 'vitest';
import { registry } from '@esc/gen-tools';
import { bytesToBase64 } from '@esc/gen-core';
import { QUICK_COMMANDS, displayResult, generateUuidText, outputFiles, parseFieldValue, planFields, runQuick, runnableTools, textOf } from './commands';

const quick = (name: string) => QUICK_COMMANDS.find((q) => q.command === name)!;
const textOfOutcome = (o: Awaited<ReturnType<typeof runQuick>>) => (o.ok ? o.text : `ERRO: ${o.message}`);

describe('comandos rápidos', () => {
  it('gera um UUID v4', () => {
    expect(generateUuidText()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('todo comando rápido aponta para uma ferramenta que existe e roda no Node', () => {
    for (const q of QUICK_COMMANDS) {
      const tool = registry.get(q.tool);
      expect(tool, q.command).toBeDefined();
      expect(tool!.modes).toContain('node');
    }
  });

  it('geradores devolvem valores válidos', async () => {
    expect(textOfOutcome(await runQuick(registry, quick('gen.generateCpf'), ''))).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    expect(textOfOutcome(await runQuick(registry, quick('gen.generateCnpj'), ''))).toMatch(/^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/);
    expect(textOfOutcome(await runQuick(registry, quick('gen.generatePassword'), ''))).toHaveLength(16);
    expect(textOfOutcome(await runQuick(registry, quick('gen.generateUuid'), ''))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('transformações trabalham sobre a seleção', async () => {
    expect(await runQuick(registry, quick('gen.base64Encode'), 'Hello World')).toEqual({ ok: true, text: 'SGVsbG8gV29ybGQ=' });
    expect(await runQuick(registry, quick('gen.base64Decode'), 'SGVsbG8gV29ybGQ=')).toEqual({ ok: true, text: 'Hello World' });
    expect(await runQuick(registry, quick('gen.formatJson'), '{"a":1}')).toEqual({ ok: true, text: '{\n  "a": 1\n}' });
    expect(await runQuick(registry, quick('gen.minifyJson'), '{ "a": 1 }')).toEqual({ ok: true, text: '{"a":1}' });
    expect(await runQuick(registry, quick('gen.slugify'), 'Olá, Mundo Bonito!')).toEqual({ ok: true, text: 'ola-mundo-bonito' });
  });

  it('erros viram mensagens, sem lançar', async () => {
    expect(await runQuick(registry, quick('gen.base64Encode'), '   ')).toEqual({ ok: false, message: 'Selecione um texto para transformar.' });
    expect((await runQuick(registry, quick('gen.formatJson'), '{quebrado')).ok).toBe(false);
    expect(await runQuick(registry, { ...quick('gen.slugify'), tool: 'nao-existe' }, 'x')).toEqual({ ok: false, message: 'Ferramenta "nao-existe" não encontrada' });
    expect((await runQuick(registry, { ...quick('gen.slugify'), resultField: 'inexistente' }, 'x')).ok).toBe(false);
  });
});

describe('executar ferramenta', () => {
  it('lista só ferramentas do modo node, ordenadas', () => {
    const tools = runnableTools(registry);
    expect(tools.length).toBeGreaterThan(100);
    expect(tools.every((t) => t.modes.includes('node'))).toBe(true);
    expect(tools.map((t) => t.id)).not.toContain('cronometro');
    const names = tools.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('a seleção preenche o primeiro campo de texto livre; padrões vêm preenchidos', () => {
    const plan = planFields(registry.get('base64')!, 'meu texto');
    expect(plan.find((p) => p.field.name === 'text')?.initial).toBe('meu texto');
    expect(plan.find((p) => p.field.name === 'action')?.initial).toBe('encode');
    expect(planFields(registry.get('base64')!, '  ').find((p) => p.field.name === 'text')?.initial).toBeUndefined();
    const cpf = planFields(registry.get('cpf')!, 'x');
    expect(cpf.find((p) => p.field.name === 'action')?.initial).toBe('generate');
    expect(cpf.find((p) => p.field.name === 'cpf')?.initial).toBe('x');
  });

  it('converte e valida o texto digitado pelo tipo do campo', () => {
    const field = (tool: string, name: string) => planFields(registry.get(tool)!, '').find((p) => p.field.name === name)!.field;
    const length = field('senha', 'length');
    expect(parseFieldValue(length, '20')).toEqual({ ok: true, value: 20 });
    expect(parseFieldValue(length, 'abc').ok).toBe(false);
    expect(parseFieldValue(length, '3.5').ok).toBe(false);
    expect(parseFieldValue(length, '')).toMatchObject({ ok: true, skip: true });
    const symbols = field('senha', 'symbols');
    expect(parseFieldValue(symbols, 'sim')).toEqual({ ok: true, value: true });
    expect(parseFieldValue(symbols, 'não')).toEqual({ ok: true, value: false });
    expect(parseFieldValue(symbols, 'talvez').ok).toBe(false);
    expect(parseFieldValue(field('base64', 'text'), 'oi')).toEqual({ ok: true, value: 'oi' });
    const count = field('uuid', 'count');
    expect(parseFieldValue(count, '0').ok).toBe(false);
    expect(parseFieldValue(count, '5000').ok).toBe(false);
    expect(parseFieldValue(count, '2,0')).toEqual({ ok: true, value: 2 });
    expect(parseFieldValue(field('pdf-unir', 'files'), 'x').ok).toBe(false);
  });

  it('resultado: texto único vira o próprio texto; binário é ocultado; arquivos são extraídos', async () => {
    expect(displayResult(registry.get('base64')!, { result: 'abc' })).toBe('abc');
    expect(textOf(['a', 'b'])).toBe('a\nb');
    const sheet = registry.get('planilha-gastos')!;
    const res = await sheet.run({ format: 'xlsx', rows: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const shown = displayResult(sheet, res.data);
      expect(shown).not.toContain('UEsDB');
      expect(shown.length).toBeLessThan(2000);
      const files = outputFiles(sheet, res.data);
      expect(files).toHaveLength(1);
      expect(files[0]!.fileName).toBe('planilha-de-gastos.xlsx');
      expect([...files[0]!.bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    }
    const fake = { downloads: [{ field: 'f', fileName: 'x.bin', mimeType: 'a/b', encoding: 'base64' as const }] } as never;
    expect(outputFiles(fake, { f: bytesToBase64(new Uint8Array([1, 2, 3])), fileName: '../../evil:name.bin' })[0]!.fileName).toBe('evil_name.bin');
    expect(outputFiles(fake, { f: '' })).toEqual([]);
    expect(outputFiles(fake, null)).toEqual([]);
  });
});
