import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

/** Remove ruído de ponto flutuante mantendo 12 algarismos significativos. */
const clean = (n: number): number => Number(n.toPrecision(12));
const fmt = (n: number): string => String(clean(n)).replace('.', ',');

// ---------- equação do 2º grau (Bhaskara) ----------

export interface QuadraticSolution {
  delta: number;
  kind: 'two-real' | 'one-real' | 'complex';
  x1?: number;
  x2?: number;
  realPart?: number;
  imaginaryPart?: number;
  vertex: { x: number; y: number };
}

export function solveQuadratic(a: number, b: number, c: number): QuadraticSolution {
  if (a === 0) throw new ToolError('O coeficiente "a" não pode ser zero: com a = 0 a equação deixa de ser do 2º grau');
  const delta = clean(b * b - 4 * a * c);
  const vertex = { x: clean(-b / (2 * a)), y: clean(-delta / (4 * a)) };
  if (delta > 0) {
    const root = Math.sqrt(delta);
    return { delta, kind: 'two-real', x1: clean((-b + root) / (2 * a)), x2: clean((-b - root) / (2 * a)), vertex };
  }
  if (delta === 0) return { delta, kind: 'one-real', x1: clean(-b / (2 * a)), vertex };
  return { delta, kind: 'complex', realPart: clean(-b / (2 * a)), imaginaryPart: clean(Math.sqrt(-delta) / (2 * Math.abs(a))), vertex };
}

const coefficient = z.number().finite().min(-1e12).max(1e12);

export const quadraticTool = defineTool({
  id: 'equacao-segundo-grau',
  name: 'Calculadora de Equação do 2º Grau (Bhaskara)',
  description: 'Resolve equações do 2º grau pela fórmula de Bhaskara, mostrando o delta, as raízes e o passo a passo',
  category: 'calculadoras',
  keywords: ['bhaskara', 'equação do segundo grau', 'equação do 2 grau', 'delta', 'raízes', 'baskara', 'quadrática', 'vértice', 'parábola', 'matemática'],
  icon: '📐',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ a: coefficient.default(1), b: coefficient.default(-5), c: coefficient.default(6) }),
  outputSchema: z.object({ equation: z.string(), delta: z.string(), roots: z.string(), steps: z.array(z.string()), vertex: z.string(), concavity: z.string() }),
  execute: ({ a, b, c }) => {
    const s = solveQuadratic(a, b, c);
    const sign = (n: number) => (n < 0 ? `− ${fmt(Math.abs(n))}` : `+ ${fmt(n)}`);
    const equation = `${fmt(a)}x² ${sign(b)}x ${sign(c)} = 0`;
    const steps = [
      `Δ = b² − 4ac = (${fmt(b)})² − 4 · (${fmt(a)}) · (${fmt(c)}) = ${fmt(s.delta)}`,
      s.kind === 'complex'
        ? `Como Δ < 0, não há raízes reais. As raízes complexas são x = ${fmt(s.realPart as number)} ± ${fmt(s.imaginaryPart as number)}i`
        : s.kind === 'one-real'
          ? `Como Δ = 0, há uma raiz real dupla: x = −b ÷ 2a = ${fmt(-b)} ÷ ${fmt(2 * a)} = ${fmt(s.x1 as number)}`
          : `Como Δ > 0, há duas raízes reais: x = (−b ± √Δ) ÷ 2a\nx₁ = (${fmt(-b)} + √${fmt(s.delta)}) ÷ ${fmt(2 * a)} = ${fmt(s.x1 as number)}\nx₂ = (${fmt(-b)} − √${fmt(s.delta)}) ÷ ${fmt(2 * a)} = ${fmt(s.x2 as number)}`,
    ];
    return {
      equation,
      delta: fmt(s.delta),
      roots:
        s.kind === 'two-real'
          ? `x₁ = ${fmt(s.x1 as number)} e x₂ = ${fmt(s.x2 as number)}`
          : s.kind === 'one-real'
            ? `x = ${fmt(s.x1 as number)} (raiz dupla)`
            : `sem raízes reais; complexas: ${fmt(s.realPart as number)} ± ${fmt(s.imaginaryPart as number)}i`,
      steps,
      vertex: `(${fmt(s.vertex.x)}; ${fmt(s.vertex.y)})`,
      concavity: a > 0 ? 'para cima (a > 0): o vértice é o ponto de mínimo' : 'para baixo (a < 0): o vértice é o ponto de máximo',
    };
  },
  fields: {
    a: { label: 'Coeficiente a (de x²)' },
    b: { label: 'Coeficiente b (de x)' },
    c: { label: 'Termo c' },
  },
  outputLabels: { equation: 'Equação', delta: 'Delta (Δ)', roots: 'Raízes', steps: 'Passo a passo', vertex: 'Vértice da parábola', concavity: 'Concavidade' },
  examples: [{ description: 'x² − 5x + 6 = 0', input: { a: 1, b: -5, c: 6 }, output: { delta: '1', roots: 'x₁ = 3 e x₂ = 2' } }],
  documentation:
    'Resolve ax² + bx + c = 0 pela fórmula de Bhaskara: Δ = b² − 4ac e x = (−b ± √Δ) ÷ 2a. Se Δ > 0 há duas raízes reais; se Δ = 0, uma raiz real dupla; se Δ < 0, não há raízes reais (a ferramenta mostra as complexas). O vértice da parábola é (−b ÷ 2a; −Δ ÷ 4a). O coeficiente a precisa ser diferente de zero. Os resultados têm 12 algarismos significativos, para eliminar ruído de ponto flutuante.',
});

// ---------- MMC e MDC ----------

const MAX_NUMBERS = 20;
const MAX_DIGITS = 15;
const FACTOR_LIMIT = 1_000_000_000;

export function parseIntegers(text: string): bigint[] {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length < 2) throw new ToolError('Informe pelo menos dois números inteiros positivos');
  if (tokens.length > MAX_NUMBERS) throw new ToolError(`Informe no máximo ${MAX_NUMBERS} números`);
  return tokens.map((t) => {
    if (!new RegExp(`^\\d{1,${MAX_DIGITS}}$`).test(t)) throw new ToolError(`"${t.slice(0, 30)}" não é um inteiro positivo de até ${MAX_DIGITS} dígitos`);
    const n = BigInt(t);
    if (n === 0n) throw new ToolError('Os números precisam ser maiores que zero');
    return n;
  });
}

export const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
export const lcm = (a: bigint, b: bigint): bigint => (a / gcd(a, b)) * b;

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const power = (n: number) => String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)] as string);

/** Fatoração por divisão sucessiva (até 10^9, no máximo cerca de 31 mil divisões). */
export function primeFactors(n: number): Map<number, number> {
  const factors = new Map<number, number>();
  let rest = n;
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    while (rest % p === 0) {
      factors.set(p, (factors.get(p) ?? 0) + 1);
      rest /= p;
    }
  }
  if (rest > 1) factors.set(rest, (factors.get(rest) ?? 0) + 1);
  return factors;
}

export const gcdLcmTool = defineTool({
  id: 'mmc-mdc',
  name: 'Calculadora de MMC e MDC',
  description: 'Calcula o mínimo múltiplo comum (MMC) e o máximo divisor comum (MDC) de dois ou mais números, com a fatoração',
  category: 'calculadoras',
  keywords: ['mmc', 'mdc', 'mínimo múltiplo comum', 'máximo divisor comum', 'múltiplo', 'divisor', 'fatoração', 'matemática', 'frações'],
  icon: '➗',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ numbers: z.string().max(2000).default('12, 18, 30') }),
  outputSchema: z.object({ mdc: z.string(), mmc: z.string(), coprimes: z.boolean(), factorization: z.array(z.string()) }),
  execute: ({ numbers }) => {
    const list = parseIntegers(numbers);
    const mdc = list.reduce(gcd);
    const mmc = list.reduce(lcm);
    const factorization = list.map((n) => {
      if (n > BigInt(FACTOR_LIMIT)) return `${n} (fatoração omitida: acima de 1 bilhão)`;
      const parts = [...primeFactors(Number(n)).entries()].map(([p, e]) => (e > 1 ? `${p}${power(e)}` : String(p)));
      return `${n} = ${parts.length ? parts.join(' × ') : '1'}`;
    });
    return { mdc: String(mdc), mmc: String(mmc), coprimes: mdc === 1n, factorization };
  },
  fields: { numbers: { label: 'Números', multiline: true, placeholder: '12, 18, 30', help: 'De 2 a 20 inteiros positivos (até 15 dígitos), separados por vírgula, espaço ou linha.' } },
  outputLabels: { mdc: 'MDC', mmc: 'MMC', coprimes: 'São primos entre si (MDC = 1)', factorization: 'Fatoração em primos' },
  examples: [{ description: '12, 18 e 30', input: { numbers: '12, 18, 30' }, output: { mdc: '6', mmc: '180', coprimes: false } }],
  documentation:
    'O MDC é o maior número que divide todos os valores; o MMC é o menor número que todos eles dividem. O MDC é calculado pelo algoritmo de Euclides e o MMC por MMC(a, b) = a × b ÷ MDC(a, b), aplicado em sequência. A fatoração em primos (por divisões sucessivas) é mostrada para números de até 1 bilhão. Usa inteiros de precisão arbitrária, então o MMC pode ter muitos dígitos sem perder exatidão.',
});

// ---------- números romanos ----------

const ROMAN_TABLE: readonly [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
const ROMAN_PATTERN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new ToolError('Números romanos comuns vão de 1 a 3999');
  let rest = n;
  let out = '';
  for (const [value, symbol] of ROMAN_TABLE) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

export function fromRoman(text: string): number {
  const roman = text.trim().toUpperCase();
  if (roman === '' || !ROMAN_PATTERN.test(roman)) throw new ToolError(`"${text.trim().slice(0, 30)}" não é um número romano válido (use I, V, X, L, C, D, M na forma padrão, como XLIV)`);
  let total = 0;
  let rest = roman;
  for (const [value, symbol] of ROMAN_TABLE) {
    while (rest.startsWith(symbol)) {
      total += value;
      rest = rest.slice(symbol.length);
    }
  }
  return total;
}

export const romanTool = defineTool({
  id: 'numeros-romanos',
  name: 'Conversor de Números Romanos',
  description: 'Converte números arábicos em romanos e romanos em arábicos, de 1 a 3999',
  category: 'conversores',
  keywords: ['números romanos', 'algarismos romanos', 'romano', 'arábico', 'converter', 'xiv', 'mcmxc', 'século'],
  icon: '🏛️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ value: z.string().max(40).default('1994') }),
  outputSchema: z.object({ roman: z.string(), decimal: z.number() }),
  execute: ({ value }) => {
    const text = value.trim();
    if (text === '') throw new ToolError('Digite um número (como 2024) ou um número romano (como MMXXIV)');
    if (/^\d+$/.test(text)) {
      if (text.length > 6) throw new ToolError('Números romanos comuns vão de 1 a 3999');
      return { roman: toRoman(Number(text)), decimal: Number(text) };
    }
    const decimal = fromRoman(text);
    return { roman: toRoman(decimal), decimal };
  },
  fields: { value: { label: 'Número', placeholder: '2024 ou MMXXIV', help: 'Digite um número de 1 a 3999 ou um número romano.' } },
  outputLabels: { roman: 'Romano', decimal: 'Arábico' },
  examples: [
    { description: 'Arábico para romano', input: { value: '1994' }, output: { roman: 'MCMXCIV', decimal: 1994 } },
    { description: 'Romano para arábico', input: { value: 'XLIV' }, output: { roman: 'XLIV', decimal: 44 } },
  ],
  documentation:
    'Os símbolos são I (1), V (5), X (10), L (50), C (100), D (500) e M (1000). Uma letra menor antes de uma maior subtrai (IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900). A ferramenta usa a forma padrão e recusa sequências irregulares, como IIII ou VX. Sem barras superiores, o maior número é 3999 (MMMCMXCIX).',
});
