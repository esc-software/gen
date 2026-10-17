import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { clean } from './converters.js';

interface UnitDef {
  symbol: string;
  name: string;
  /** Quantas unidades-base cabem em uma desta unidade. */
  factor: number;
}

interface Dimension {
  name: string;
  base: string;
  units: UnitDef[];
}

/** Fatores exatos (definições legais) quando existem; demais conforme valores usuais publicados. */
const DIMENSIONS: Dimension[] = [
  {
    name: 'comprimento',
    base: 'm',
    units: [
      { symbol: 'mm', name: 'milímetro', factor: 0.001 },
      { symbol: 'cm', name: 'centímetro', factor: 0.01 },
      { symbol: 'm', name: 'metro', factor: 1 },
      { symbol: 'km', name: 'quilômetro', factor: 1000 },
      { symbol: 'in', name: 'polegada', factor: 0.0254 },
      { symbol: 'ft', name: 'pé', factor: 0.3048 },
      { symbol: 'yd', name: 'jarda', factor: 0.9144 },
      { symbol: 'mi', name: 'milha', factor: 1609.344 },
      { symbol: 'nmi', name: 'milha náutica', factor: 1852 },
    ],
  },
  {
    name: 'massa',
    base: 'kg',
    units: [
      { symbol: 'mg', name: 'miligrama', factor: 1e-6 },
      { symbol: 'g', name: 'grama', factor: 0.001 },
      { symbol: 'kg', name: 'quilograma', factor: 1 },
      { symbol: 't', name: 'tonelada', factor: 1000 },
      { symbol: 'oz', name: 'onça', factor: 0.028349523125 },
      { symbol: 'lb', name: 'libra', factor: 0.45359237 },
      { symbol: 'st', name: 'stone', factor: 6.35029318 },
    ],
  },
  {
    name: 'volume',
    base: 'L',
    units: [
      { symbol: 'mL', name: 'mililitro', factor: 0.001 },
      { symbol: 'L', name: 'litro', factor: 1 },
      { symbol: 'm3', name: 'metro cúbico', factor: 1000 },
      { symbol: 'tsp', name: 'colher de chá (EUA)', factor: 0.00492892159375 },
      { symbol: 'tbsp', name: 'colher de sopa (EUA)', factor: 0.01478676478125 },
      { symbol: 'floz', name: 'onça fluida (EUA)', factor: 0.0295735295625 },
      { symbol: 'cup', name: 'xícara (EUA)', factor: 0.2365882365 },
      { symbol: 'pt', name: 'pinta (EUA)', factor: 0.473176473 },
      { symbol: 'qt', name: 'quarto (EUA)', factor: 0.946352946 },
      { symbol: 'gal', name: 'galão (EUA)', factor: 3.785411784 },
    ],
  },
  {
    name: 'área',
    base: 'm²',
    units: [
      { symbol: 'cm2', name: 'centímetro quadrado', factor: 0.0001 },
      { symbol: 'm2', name: 'metro quadrado', factor: 1 },
      { symbol: 'ha', name: 'hectare', factor: 10_000 },
      { symbol: 'km2', name: 'quilômetro quadrado', factor: 1_000_000 },
      { symbol: 'in2', name: 'polegada quadrada', factor: 0.00064516 },
      { symbol: 'ft2', name: 'pé quadrado', factor: 0.09290304 },
      { symbol: 'ac', name: 'acre', factor: 4046.8564224 },
      { symbol: 'mi2', name: 'milha quadrada', factor: 2_589_988.110336 },
    ],
  },
  {
    name: 'tempo',
    base: 's',
    units: [
      { symbol: 'ms', name: 'milissegundo', factor: 0.001 },
      { symbol: 's', name: 'segundo', factor: 1 },
      { symbol: 'min', name: 'minuto', factor: 60 },
      { symbol: 'h', name: 'hora', factor: 3600 },
      { symbol: 'd', name: 'dia', factor: 86_400 },
      { symbol: 'sem', name: 'semana', factor: 604_800 },
    ],
  },
  {
    name: 'pressão',
    base: 'Pa',
    units: [
      { symbol: 'Pa', name: 'pascal', factor: 1 },
      { symbol: 'kPa', name: 'quilopascal', factor: 1000 },
      { symbol: 'bar', name: 'bar', factor: 100_000 },
      { symbol: 'atm', name: 'atmosfera', factor: 101_325 },
      { symbol: 'psi', name: 'libra-força por polegada quadrada', factor: 6894.757293168361 },
      { symbol: 'mmHg', name: 'milímetro de mercúrio', factor: 133.322387415 },
    ],
  },
  {
    name: 'energia',
    base: 'J',
    units: [
      { symbol: 'J', name: 'joule', factor: 1 },
      { symbol: 'kJ', name: 'quilojoule', factor: 1000 },
      { symbol: 'cal', name: 'caloria', factor: 4.184 },
      { symbol: 'kcal', name: 'quilocaloria', factor: 4184 },
      { symbol: 'Wh', name: 'watt-hora', factor: 3600 },
      { symbol: 'kWh', name: 'quilowatt-hora', factor: 3_600_000 },
      { symbol: 'BTU', name: 'BTU', factor: 1055.05585262 },
    ],
  },
  {
    name: 'potência',
    base: 'W',
    units: [
      { symbol: 'W', name: 'watt', factor: 1 },
      { symbol: 'kW', name: 'quilowatt', factor: 1000 },
      { symbol: 'hp', name: 'cavalo-vapor mecânico (hp)', factor: 745.69987158227 },
      { symbol: 'cv', name: 'cavalo-vapor métrico (cv)', factor: 735.49875 },
    ],
  },
];

const SPEED: Dimension = {
  name: 'velocidade',
  base: 'm/s',
  units: [
    { symbol: 'm/s', name: 'metro por segundo', factor: 1 },
    { symbol: 'km/h', name: 'quilômetro por hora', factor: 1 / 3.6 },
    { symbol: 'mph', name: 'milha por hora', factor: 0.44704 },
    { symbol: 'kn', name: 'nó', factor: 1852 / 3600 },
    { symbol: 'ft/s', name: 'pé por segundo', factor: 0.3048 },
  ],
};

const lookup = (dims: Dimension[]) => {
  const map = new Map<string, { dim: Dimension; unit: UnitDef }>();
  for (const dim of dims) for (const unit of dim.units) map.set(unit.symbol, { dim, unit });
  return map;
};

const UNIT_MAP = lookup(DIMENSIONS);
const SPEED_MAP = lookup([SPEED]);

const numberText = (n: number) => String(clean(n));

export function convertUnit(value: number, from: string, to: string, map = UNIT_MAP) {
  const source = map.get(from);
  const target = map.get(to);
  if (!source) throw new ToolError(`Unidade desconhecida: "${from}"`);
  if (!target) throw new ToolError(`Unidade desconhecida: "${to}"`);
  if (source.dim !== target.dim) {
    throw new ToolError(`Não é possível converter ${source.dim.name} (${from}) para ${target.dim.name} (${to})`);
  }
  const base = value * source.unit.factor;
  const result = base / target.unit.factor;
  return {
    result: clean(result),
    summary: `${numberText(value)} ${from} = ${numberText(result)} ${to}`,
    dimension: source.dim.name,
    all: source.dim.units.map((u) => `${numberText(base / u.factor)} ${u.symbol} (${u.name})`),
  };
}

const unitOptions = (dims: Dimension[]) => dims.flatMap((d) => d.units.map((u) => u.symbol)) as [string, ...string[]];

const labelsFor = (dims: Dimension[]) =>
  Object.fromEntries(dims.flatMap((d) => d.units.map((u) => [u.symbol, `${u.symbol} — ${u.name} (${d.name})`])));

const outputSchema = z.object({ result: z.number(), summary: z.string(), dimension: z.string(), all: z.array(z.string()) });
const outputLabels = { result: 'Resultado', summary: 'Conversão', dimension: 'Grandeza', all: 'Em todas as unidades' };

export const unitsTool = defineTool({
  id: 'unidades',
  name: 'Conversor de Unidades',
  description: 'Converte comprimento, massa, volume, área, tempo, pressão, energia e potência',
  category: 'conversores',
  keywords: ['unidades', 'medidas', 'converter', 'comprimento', 'massa', 'volume', 'área', 'energia', 'pressão', 'potência', 'polegada', 'libra'],
  icon: '📐',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.number().finite().min(-1e15).max(1e15).default(1),
    from: z.enum(unitOptions(DIMENSIONS)).default('km'),
    to: z.enum(unitOptions(DIMENSIONS)).default('mi'),
  }),
  outputSchema,
  execute: ({ value, from, to }) => convertUnit(value, from, to),
  fields: {
    value: { label: 'Valor' },
    from: { label: 'De', optionLabels: labelsFor(DIMENSIONS) },
    to: { label: 'Para', optionLabels: labelsFor(DIMENSIONS) },
  },
  outputLabels,
  examples: [
    { description: 'Quilômetros para milhas', input: { value: 1, from: 'km', to: 'mi' }, output: { dimension: 'comprimento', result: 0.621371192237 } },
    { description: 'Libras para quilogramas', input: { value: 150, from: 'lb', to: 'kg' }, output: { result: 68.0388555 } },
  ],
  documentation:
    'Converte apenas entre unidades da mesma grandeza e avisa quando a combinação não faz sentido (por exemplo, metros para quilogramas). As unidades usam as definições legais exatas quando elas existem (polegada = 25,4 mm, libra = 0,45359237 kg). Galão, quarto e xícara seguem o padrão dos Estados Unidos. Os resultados têm 12 algarismos significativos. Para temperatura e tamanho de arquivo, use os conversores específicos.',
});

export const speedTool = defineTool({
  id: 'velocidade',
  name: 'Conversor de Velocidade',
  description: 'Converte entre m/s, km/h, mph, nós e pés por segundo',
  category: 'conversores',
  keywords: ['velocidade', 'km/h', 'mph', 'm/s', 'nós', 'converter'],
  icon: '🏎️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.number().finite().min(-1e12).max(1e12).default(100),
    from: z.enum(unitOptions([SPEED])).default('km/h'),
    to: z.enum(unitOptions([SPEED])).default('mph'),
  }),
  outputSchema,
  execute: ({ value, from, to }) => convertUnit(value, from, to, SPEED_MAP),
  fields: {
    value: { label: 'Valor' },
    from: { label: 'De', optionLabels: labelsFor([SPEED]) },
    to: { label: 'Para', optionLabels: labelsFor([SPEED]) },
  },
  outputLabels,
  examples: [
    { description: '100 km/h em milhas por hora', input: { value: 100, from: 'km/h', to: 'mph' }, output: { result: 62.1371192237 } },
    { description: '1 nó em km/h', input: { value: 1, from: 'kn', to: 'km/h' }, output: { result: 1.852 } },
  ],
  documentation:
    'Usa as definições exatas: 1 mph = 0,44704 m/s, 1 nó = 1852 m/h e 1 pé = 0,3048 m. Valores negativos são aceitos para representar sentido contrário.',
});
