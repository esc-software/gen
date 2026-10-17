import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

/** Remove ruído de ponto flutuante (0.1 + 0.2) mantendo 12 algarismos significativos. */
export const clean = (n: number): number => Number(n.toPrecision(12));

// ---------- temperatura ----------

export type TemperatureUnit = 'celsius' | 'fahrenheit' | 'kelvin';

export function convertTemperature(value: number, from: TemperatureUnit) {
  const celsius = from === 'celsius' ? value : from === 'fahrenheit' ? ((value - 32) * 5) / 9 : value - 273.15;
  if (celsius < -273.15 - 1e-9) throw new ToolError('Temperatura abaixo do zero absoluto (-273,15 °C)');
  return {
    celsius: clean(celsius),
    fahrenheit: clean((celsius * 9) / 5 + 32),
    kelvin: clean(celsius + 273.15),
  };
}

export const temperatureTool = defineTool({
  id: 'temperatura',
  name: 'Conversor de Temperatura',
  description: 'Converte entre Celsius, Fahrenheit e Kelvin',
  category: 'conversores',
  keywords: ['temperatura', 'celsius', 'fahrenheit', 'kelvin', 'graus', 'converter'],
  icon: '🌡️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.number().finite().min(-1e9).max(1e9),
    from: z.enum(['celsius', 'fahrenheit', 'kelvin']).default('celsius'),
  }),
  outputSchema: z.object({ celsius: z.number(), fahrenheit: z.number(), kelvin: z.number() }),
  execute: ({ value, from }) => convertTemperature(value, from),
  fields: {
    value: { label: 'Valor' },
    from: { label: 'Unidade de origem', optionLabels: { celsius: 'Celsius (°C)', fahrenheit: 'Fahrenheit (°F)', kelvin: 'Kelvin (K)' } },
  },
  outputLabels: { celsius: 'Celsius (°C)', fahrenheit: 'Fahrenheit (°F)', kelvin: 'Kelvin (K)' },
  examples: [
    { description: 'Ebulição da água', input: { value: 100, from: 'celsius' }, output: { celsius: 100, fahrenheit: 212, kelvin: 373.15 } },
    { description: 'Ponto em que °C = °F', input: { value: -40, from: 'fahrenheit' }, output: { celsius: -40, fahrenheit: -40, kelvin: 233.15 } },
  ],
  documentation:
    'Usa as fórmulas exatas de conversão (°F = °C × 9/5 + 32; K = °C + 273,15). Valores abaixo do zero absoluto são rejeitados. Os resultados são arredondados a 12 algarismos significativos para eliminar ruído de ponto flutuante.',
});

// ---------- tamanho de arquivo ----------

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
type SizeUnit = (typeof SIZE_UNITS)[number];
const IEC_NAMES: Record<SizeUnit, string> = { B: 'B', KB: 'KiB', MB: 'MiB', GB: 'GiB', TB: 'TiB', PB: 'PiB' };

export function convertFileSize(value: number, unit: SizeUnit, standard: 'decimal' | 'binary') {
  const base = standard === 'decimal' ? 1000 : 1024;
  const bytes = value * base ** SIZE_UNITS.indexOf(unit);
  const conversions = SIZE_UNITS.map((u) => {
    const amount = clean(bytes / base ** SIZE_UNITS.indexOf(u));
    const name = standard === 'binary' ? IEC_NAMES[u] : u;
    return `${amount} ${name}`;
  });
  return { bytes: clean(bytes), conversions };
}

export const fileSizeTool = defineTool({
  id: 'tamanho-arquivo',
  name: 'Conversor de Tamanho de Arquivo',
  description: 'Converte entre bytes, KB, MB, GB, TB e PB, no padrão decimal (1000) ou binário (1024)',
  category: 'conversores',
  keywords: ['tamanho', 'arquivo', 'bytes', 'kb', 'mb', 'gb', 'tb', 'kib', 'mib', 'gib', 'armazenamento'],
  icon: '💾',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.number().finite().min(0).max(1e15),
    unit: z.enum(SIZE_UNITS).default('MB'),
    standard: z.enum(['decimal', 'binary']).default('decimal'),
  }),
  outputSchema: z.object({ bytes: z.number(), conversions: z.array(z.string()) }),
  execute: ({ value, unit, standard }) => convertFileSize(value, unit, standard),
  fields: {
    value: { label: 'Valor' },
    unit: { label: 'Unidade' },
    standard: {
      label: 'Padrão',
      optionLabels: { decimal: 'Decimal (1 KB = 1000 B)', binary: 'Binário (1 KiB = 1024 B)' },
      help: 'Fabricantes de discos usam o decimal; sistemas operacionais costumam usar o binário.',
    },
  },
  outputLabels: { bytes: 'Bytes', conversions: 'Conversões' },
  examples: [
    {
      description: '1,5 GiB em outras unidades',
      input: { value: 1.5, unit: 'GB', standard: 'binary' },
      output: {
        bytes: 1610612736,
        conversions: ['1610612736 B', '1572864 KiB', '1536 MiB', '1.5 GiB', '0.00146484375 TiB', '0.00000143051147461 PiB'],
      },
    },
  ],
  documentation:
    'No padrão decimal (SI), 1 KB = 1000 bytes. No binário (IEC), 1 KiB = 1024 bytes, e as unidades se chamam KiB, MiB, GiB etc. A diferença explica por que um disco de "500 GB" aparece com menos espaço em alguns sistemas.',
});

// ---------- bases numéricas ----------

const BASES = { '2': { prefix: '0b', digits: /^[01]+$/ }, '8': { prefix: '0o', digits: /^[0-7]+$/ }, '10': { prefix: '', digits: /^\d+$/ }, '16': { prefix: '0x', digits: /^[0-9a-f]+$/i } } as const;

export function convertBase(input: string, from: keyof typeof BASES) {
  let text = input.trim().replace(/[\s_]/g, '');
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);
  const { prefix, digits } = BASES[from];
  if (prefix && text.toLowerCase().startsWith(prefix)) text = text.slice(prefix.length);
  if (text === '') throw new ToolError('Informe um número');
  if (!digits.test(text)) throw new ToolError(`"${input.trim()}" não é um número válido na base ${from}`);

  const value = BigInt(prefix ? prefix + text : text);
  const signed = (v: bigint, base: number) => (negative ? '-' : '') + v.toString(base).toUpperCase();
  return {
    binary: signed(value, 2),
    octal: signed(value, 8),
    decimal: signed(value, 10),
    hexadecimal: signed(value, 16),
  };
}

export const numberBaseTool = defineTool({
  id: 'bases-numericas',
  name: 'Conversor Binário, Decimal e Hexadecimal',
  description: 'Converte números entre as bases 2, 8, 10 e 16, sem limite de tamanho',
  category: 'conversores',
  keywords: ['binário', 'decimal', 'hexadecimal', 'octal', 'base', 'hex', 'bin', 'converter'],
  icon: '🔢',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.string().max(512),
    from: z.enum(['2', '8', '10', '16']).default('10'),
  }),
  outputSchema: z.object({ binary: z.string(), octal: z.string(), decimal: z.string(), hexadecimal: z.string() }),
  execute: ({ value, from }) => convertBase(value, from),
  fields: {
    value: { label: 'Número', placeholder: '255, 0xFF, 1111_1111' },
    from: { label: 'Base de origem', optionLabels: { '2': 'Binária (2)', '8': 'Octal (8)', '10': 'Decimal (10)', '16': 'Hexadecimal (16)' } },
  },
  outputLabels: { binary: 'Binário', octal: 'Octal', decimal: 'Decimal', hexadecimal: 'Hexadecimal' },
  examples: [
    {
      description: '255 em todas as bases',
      input: { value: '255', from: '10' },
      output: { binary: '11111111', octal: '377', decimal: '255', hexadecimal: 'FF' },
    },
    {
      description: 'Hexadecimal com prefixo',
      input: { value: '0xDEADBEEF', from: '16' },
      output: { binary: '11011110101011011011111011101111', octal: '33653337357', decimal: '3735928559', hexadecimal: 'DEADBEEF' },
    },
  ],
  documentation:
    'Aceita inteiros positivos ou negativos, com ou sem o prefixo da base (0b, 0o, 0x), e ignora espaços e sublinhados como separadores. Usa inteiros de precisão arbitrária, então números muito grandes são convertidos sem perda. Frações não são suportadas.',
});

// ---------- URL encode/decode ----------

export const urlEncodeTool = defineTool({
  id: 'url-encode',
  name: 'Codificador e Decodificador de URL',
  description: 'Codifica e decodifica texto em formato de URL (percent-encoding)',
  category: 'conversores',
  keywords: ['url', 'encode', 'decode', 'percent', 'uri', 'codificar', 'decodificar'],
  icon: '🌐',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(100_000),
    mode: z.enum(['encode', 'decode']).default('encode'),
    scope: z.enum(['component', 'full']).default('component'),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: ({ text, mode, scope }) => {
    try {
      if (mode === 'encode') return { result: scope === 'component' ? encodeURIComponent(text) : encodeURI(text) };
      return { result: scope === 'component' ? decodeURIComponent(text) : decodeURI(text) };
    } catch {
      throw new ToolError('Sequência de escape inválida (por exemplo, "%" sem dois dígitos hexadecimais depois)');
    }
  },
  fields: {
    text: { label: 'Texto', multiline: true },
    mode: { label: 'Operação', optionLabels: { encode: 'Codificar', decode: 'Decodificar' } },
    scope: {
      label: 'Escopo',
      optionLabels: { component: 'Parte da URL (codifica / ? & =)', full: 'URL completa (mantém / ? & =)' },
    },
  },
  outputLabels: { result: 'Resultado' },
  examples: [
    { description: 'Parâmetro de consulta', input: { text: 'ação & café', mode: 'encode', scope: 'component' }, output: { result: 'a%C3%A7%C3%A3o%20%26%20caf%C3%A9' } },
    { description: 'URL completa', input: { text: 'https://site.com/a b?x=1', mode: 'encode', scope: 'full' }, output: { result: 'https://site.com/a%20b?x=1' } },
  ],
  documentation:
    '"Parte da URL" usa encodeURIComponent e serve para valores de parâmetros ou segmentos de caminho: codifica também / ? # & = :. "URL completa" usa encodeURI e preserva a estrutura da URL. Na decodificação, uma sequência % mal formada gera erro em vez de ser ignorada.',
});
