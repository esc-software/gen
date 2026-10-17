import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools } from './index.js';

type Json = { type?: string | string[]; maxLength?: number; maxItems?: number; properties?: Record<string, Json>; items?: Json; additionalProperties?: boolean | Json; anyOf?: Json[]; enum?: unknown[]; format?: string; pattern?: string };

/** Regex ancorada e sem quantificadores abertos (`*`, `+`, `{n,}`) limita o tamanho por si só. */
const boundedPattern = (p?: string) => !!p && p.startsWith("^") && p.endsWith("$") && ![...p.matchAll(/(\\.)|([*+])|(\{\d+,\})/g)].some((m) => m[1] === undefined);

/** Percorre o schema e lista campos de texto/lista sem limite de tamanho. */
function unbounded(schema: Json, path: string, out: string[]): void {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('string') && !schema.enum && schema.maxLength === undefined && !schema.format && !boundedPattern(schema.pattern)) out.push(`${path} (texto sem maxLength)`);
  if (types.includes('array') && schema.maxItems === undefined) out.push(`${path} (lista sem maxItems)`);
  for (const [k, v] of Object.entries(schema.properties ?? {})) unbounded(v, `${path}.${k}`, out);
  if (schema.items) unbounded(schema.items, `${path}[]`, out);
  for (const alt of schema.anyOf ?? []) unbounded(alt, path, out);
  if (typeof schema.additionalProperties === 'object') unbounded(schema.additionalProperties, `${path}{}`, out);
}

describe('limites de entrada (proteção contra abuso de memória e CPU)', () => {
  it('todo texto e toda lista de toda ferramenta têm tamanho máximo', () => {
    const problems: string[] = [];
    for (const tool of tools) {
      const schema = zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' }) as Json;
      const found: string[] = [];
      unbounded(schema, tool.id, found);
      problems.push(...found);
    }
    expect(problems).toEqual([]);
  });
});

describe('entradas hostis', () => {
  const hostile: unknown[] = [
    null, undefined, 42, 'texto', [], [[]], true,
    { __proto__: { admin: true } },
    JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'),
    { text: 'x'.repeat(2_000_000) },
    { text: '\u0000‮\ud800' },
  ];

  it('nenhuma ferramenta lança, trava ou polui Object.prototype com entradas inesperadas', async () => {
    for (const tool of tools) {
      for (const input of hostile) {
        const started = Date.now();
        const result = await tool.run(input);
        expect(typeof result.ok, `${tool.id}`).toBe('boolean');
        expect(Date.now() - started, `${tool.id} demorou demais`).toBeLessThan(10_000);
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('ferramentas que processam texto livre respondem em tempo razoável a entradas patológicas no limite', async () => {
    const patterns = ['a'.repeat(5000) + '!', '(' .repeat(2000), '<'.repeat(3000), '{"a":'.repeat(500), '\n'.repeat(5000), '9'.repeat(5000), ' '.repeat(5000) + 'x', '=1+1,'.repeat(1000)];
    const slow: string[] = [];
    for (const tool of tools) {
      const schema = zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' }) as Json;
      const textFields = Object.entries(schema.properties ?? {}).filter(([, v]) => v.type === 'string' && !v.enum && !v.format).map(([k, v]) => [k, v.maxLength ?? 1000] as const);
      for (const [field, max] of textFields) {
        for (const p of patterns) {
          const value = p.slice(0, max);
          const started = Date.now();
          await tool.run({ [field]: value });
          const ms = Date.now() - started;
          if (ms > 8000) slow.push(`${tool.id}.${field} com ${JSON.stringify(p.slice(0, 12))}…: ${ms} ms`);
        }
      }
    }
    expect(slow).toEqual([]);
  }, 300_000);
});
