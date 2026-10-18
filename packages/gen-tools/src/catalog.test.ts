import { describe, expect, it } from 'vitest';
import { describeInput } from '@esc/gen-core';
import { createDefaultRegistry, registry, tools } from './index.js';

describe('contrato do catálogo (vale para toda ferramenta registrada)', () => {
  it('ids são únicos e o registro contém todas as ferramentas', () => {
    const ids = tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(registry.size).toBe(tools.length);
    expect(createDefaultRegistry().size).toBe(tools.length);
  });

  describe.each(tools.map((t) => [t.id, t] as const))('%s', (_id, tool) => {
    it('tem documentação e exemplos', () => {
      expect(tool.documentation.length).toBeGreaterThan(40);
      // Ferramentas que recebem arquivos são exercitadas com arquivos gerados em seus próprios testes.
      const takesFiles = describeInput(tool).some((f) => f.type === 'file' || f.type === 'files');
      // As que só funcionam com a API não têm exemplo fixo (dependem de dados de fora); são testadas com um cliente simulado.
      const apiOnly = tool.modes.every((m) => m === 'remote');
      if (!takesFiles && !apiOnly) expect(tool.examples.length).toBeGreaterThan(0);
    });

    it.each(tool.examples.map((e, i) => [e.description ?? `exemplo ${i + 1}`, e] as const))(
      'exemplo: %s',
      async (_name, example) => {
        const result = await tool.run(example.input);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(tool.outputSchema.safeParse(result.data).success).toBe(true);
          if (example.output !== undefined) expect(result.data).toMatchObject(example.output as object);
        }
      }
    );

    it('dicas de campo referem-se a campos que existem', () => {
      const names = describeInput(tool).map((f) => f.name);
      for (const key of Object.keys(tool.fields)) expect(names, `campo "${key}"`).toContain(key);
    });

    it('rótulos de saída referem-se a chaves do outputSchema', () => {
      const schema = tool.outputSchema as { shape?: Record<string, unknown>; _def?: { catchall?: { _def?: { typeName?: string } } } };
      // Saídas com campos extras dinâmicos (catchall) não têm lista fechada de chaves.
      if (!schema.shape || schema._def?.catchall?._def?.typeName !== 'ZodNever') return;
      const shape = schema.shape;
      for (const key of Object.keys(tool.outputLabels)) expect(Object.keys(shape), `saída "${key}"`).toContain(key);
    });

    it('downloads referem-se a campos da saída', () => {
      const shape = (tool.outputSchema as { shape?: Record<string, unknown> }).shape
      if (!shape) return
      for (const d of tool.downloads) expect(Object.keys(shape), `download "${d.field}"`).toContain(d.field)
    });

    it('ferramentas ao vivo rodam no navegador', () => {
      if (tool.live) expect(tool.modes.some((m) => m === 'browser' || m === 'remote')).toBe(true);
    });

    it('rejeita entrada de tipo inválido sem lançar', async () => {
      const result = await tool.run(42);
      expect(result.ok).toBe(false);
    });
  });
});
