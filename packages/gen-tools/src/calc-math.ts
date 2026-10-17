import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { evaluate, tidy } from './expr.js';

/**
 * Arredonda para `digits` casas com meio para cima, corrigindo a representação binária
 * (1,005 × 100 = 100,49999999999999 em ponto flutuante) antes de arredondar.
 */
export const roundTo = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(Number((n * f).toPrecision(15))) / f;
};
/** Arredonda a 2 casas (valores em reais). */
export const round2 = (n: number): number => roundTo(n, 2);

const num = (min = -1e12, max = 1e12) => z.number().finite().min(min).max(max);

// ---------- calculadora simples e científica ----------

const expressionOutput = z.object({ result: z.number(), formatted: z.string() });

const formatNumber = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 }).format(n);

export const simpleCalculatorTool = defineTool({
  id: 'calculadora-simples',
  name: 'Calculadora Simples',
  description: 'Resolve expressões com soma, subtração, multiplicação, divisão, potência e parênteses',
  category: 'calculadoras',
  keywords: ['calculadora', 'calcular', 'soma', 'multiplicação', 'divisão', 'expressão', 'conta'],
  icon: '🧮',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ expression: z.string().max(500).default('') }),
  outputSchema: expressionOutput,
  execute: ({ expression }) => {
    const result = tidy(evaluate(expression, { angle: 'radians', scientific: false }));
    return { result, formatted: formatNumber(result) };
  },
  fields: { expression: { label: 'Expressão', placeholder: '(12,5 + 7,5) * 3 / 2' } },
  outputLabels: { result: 'Resultado', formatted: 'Formatado (pt-BR)' },
  examples: [
    { description: 'Com parênteses e vírgula decimal', input: { expression: '(12,5 + 7,5) * 3 / 2' }, output: { result: 30 } },
    { description: 'Potência', input: { expression: '2^10 - 24' }, output: { result: 1000 } },
  ],
  documentation:
    'Operadores: + - * / (e × ÷), ^ (potência), % (resto da divisão) e parênteses. A vírgula vale como separador decimal. A precedência é a da matemática: potência antes de multiplicação e divisão, e esta antes de soma e subtração; -2^2 vale -4. A expressão é interpretada por um analisador próprio, nunca executada como código. Os resultados têm 12 algarismos significativos para eliminar ruído de ponto flutuante.',
});

export const scientificCalculatorTool = defineTool({
  id: 'calculadora-cientifica',
  name: 'Calculadora Científica',
  description: 'Funções trigonométricas, logaritmos, raízes, fatorial e constantes, com radianos ou graus',
  category: 'calculadoras',
  keywords: ['calculadora científica', 'seno', 'cosseno', 'tangente', 'logaritmo', 'raiz', 'fatorial', 'pi', 'trigonometria'],
  icon: '🔬',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    expression: z.string().max(500).default(''),
    angle: z.enum(['radians', 'degrees']).default('degrees'),
  }),
  outputSchema: expressionOutput,
  execute: ({ expression, angle }) => {
    const result = tidy(evaluate(expression, { angle, scientific: true }));
    return { result, formatted: formatNumber(result) };
  },
  fields: {
    expression: { label: 'Expressão', placeholder: 'sin(30) + sqrt(16) + 5!' },
    angle: { label: 'Unidade dos ângulos', optionLabels: { degrees: 'Graus', radians: 'Radianos' } },
  },
  outputLabels: { result: 'Resultado', formatted: 'Formatado (pt-BR)' },
  examples: [
    { description: 'Seno de 30 graus', input: { expression: 'sin(30)', angle: 'degrees' }, output: { result: 0.5 } },
    { description: 'Fatorial e raiz', input: { expression: '5! + sqrt(16)', angle: 'degrees' }, output: { result: 124 } },
    { description: 'Logaritmo na base 10', input: { expression: 'log(1000)', angle: 'degrees' }, output: { result: 3 } },
  ],
  documentation:
    'Funções: sin, cos, tan, asin, acos, atan, sqrt (ou raiz), cbrt, ln (natural), log (base 10), log2, exp, abs, floor, ceil, round e fat. Constantes: pi (ou π) e e. O fatorial usa "!" (ou fat(n)) e vai até 170!. Funções recebem um argumento entre parênteses. Valores indefinidos, como raiz de número negativo, geram erro em vez de NaN.',
});

// ---------- porcentagem ----------

type PercentMode = 'percentOf' | 'whatPercent' | 'change' | 'increase' | 'decrease' | 'original';

export function percentage(mode: PercentMode, a: number, b: number) {
  switch (mode) {
    case 'percentOf':
      return { result: tidy((a / 100) * b), explanation: `${a}% de ${b} = ${b} × ${a} ÷ 100` };
    case 'whatPercent':
      if (b === 0) throw new ToolError('O segundo valor não pode ser zero');
      return { result: tidy((a / b) * 100), explanation: `${a} ÷ ${b} × 100` };
    case 'change':
      if (a === 0) throw new ToolError('A variação a partir de zero não é definida');
      return { result: tidy(((b - a) / Math.abs(a)) * 100), explanation: `(${b} − ${a}) ÷ ${Math.abs(a)} × 100` };
    case 'increase':
      return { result: tidy(b * (1 + a / 100)), explanation: `${b} × (1 + ${a}/100)` };
    case 'decrease':
      return { result: tidy(b * (1 - a / 100)), explanation: `${b} × (1 − ${a}/100)` };
    case 'original':
      if (a === -100) throw new ToolError('Um acréscimo de -100% não tem valor original definido');
      return { result: tidy(b / (1 + a / 100)), explanation: `${b} ÷ (1 + ${a}/100)` };
  }
}

export const percentageTool = defineTool({
  id: 'porcentagem',
  name: 'Calculadora de Porcentagem',
  description: 'Calcula porcentagem de um valor, quanto um valor representa de outro, variação, acréscimo e desconto',
  category: 'calculadoras',
  keywords: ['porcentagem', 'percentual', '%', 'acréscimo', 'desconto', 'variação', 'aumento'],
  icon: '％',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['percentOf', 'whatPercent', 'change', 'increase', 'decrease', 'original']).default('percentOf'),
    a: num().default(10),
    b: num().default(200),
  }),
  outputSchema: z.object({ result: z.number(), explanation: z.string() }),
  execute: ({ mode, a, b }) => percentage(mode, a, b),
  fields: {
    mode: {
      label: 'O que calcular',
      optionLabels: {
        percentOf: 'A% de B',
        whatPercent: 'A é quantos % de B',
        change: 'Variação percentual de A para B',
        increase: 'B com acréscimo de A%',
        decrease: 'B com desconto de A%',
        original: 'Valor original de B, que já inclui acréscimo de A%',
      },
    },
    a: { label: 'Valor A' },
    b: { label: 'Valor B' },
  },
  outputLabels: { result: 'Resultado', explanation: 'Conta feita' },
  examples: [
    { description: '10% de 200', input: { mode: 'percentOf', a: 10, b: 200 }, output: { result: 20 } },
    { description: 'Quanto 30 representa de 120', input: { mode: 'whatPercent', a: 30, b: 120 }, output: { result: 25 } },
    { description: 'Variação de 80 para 100', input: { mode: 'change', a: 80, b: 100 }, output: { result: 25 } },
    { description: 'Preço sem o acréscimo de 20%', input: { mode: 'original', a: 20, b: 120 }, output: { result: 100 } },
  ],
  documentation:
    'Escolha o tipo de conta e preencha A e B conforme o rótulo da opção. A variação percentual usa o módulo do valor inicial, então a direção do sinal indica aumento (positivo) ou queda (negativo).',
});

// ---------- regra de três ----------

export const ruleOfThreeTool = defineTool({
  id: 'regra-de-tres',
  name: 'Regra de Três',
  description: 'Resolve regra de três simples, direta ou inversamente proporcional',
  category: 'calculadoras',
  keywords: ['regra de três', 'proporção', 'proporcional', 'grandezas', 'inversamente'],
  icon: '⚖️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    kind: z.enum(['direct', 'inverse']).default('direct'),
    a: num().default(2),
    b: num().default(10),
    c: num().default(5),
  }),
  outputSchema: z.object({ x: z.number(), explanation: z.string() }),
  execute: ({ kind, a, b, c }) => {
    if (kind === 'direct') {
      if (a === 0) throw new ToolError('O valor A não pode ser zero');
      return { x: tidy((b * c) / a), explanation: `x = (${b} × ${c}) ÷ ${a}` };
    }
    if (c === 0) throw new ToolError('O valor C não pode ser zero em uma regra inversa');
    return { x: tidy((a * b) / c), explanation: `x = (${a} × ${b}) ÷ ${c}` };
  },
  fields: {
    kind: { label: 'Tipo', optionLabels: { direct: 'Direta (aumenta junto)', inverse: 'Inversa (um aumenta, o outro diminui)' } },
    a: { label: 'A', help: 'A está para B...' },
    b: { label: 'B' },
    c: { label: 'C', help: '...assim como C está para x.' },
  },
  outputLabels: { x: 'Valor de x', explanation: 'Conta feita' },
  examples: [
    { description: 'Direta: 2 kg custam 10; quanto custam 5 kg?', input: { kind: 'direct', a: 2, b: 10, c: 5 }, output: { x: 25 } },
    { description: 'Inversa: 4 operários levam 6 dias; e 8 operários?', input: { kind: 'inverse', a: 4, b: 6, c: 8 }, output: { x: 3 } },
  ],
  documentation:
    'Direta: A está para B como C está para x, então x = B × C ÷ A. Inversa (quando uma grandeza cresce e a outra diminui, como operários e dias): x = A × B ÷ C.',
});

// ---------- média e estatística ----------

export function parseNumbers(text: string): number[] {
  const parts = text.split(/[\s;]+/).filter(Boolean);
  return parts.map((p) => {
    const n = Number(p.replace(',', '.'));
    if (!Number.isFinite(n) || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(p.replace(',', '.'))) throw new ToolError(`Valor inválido: "${p}"`);
    return n;
  });
}

export function statistics(values: number[], weights?: number[]) {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 ? (sorted[(n - 1) / 2] as number) : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const modes = top === 1 ? [] : [...counts].filter(([, c]) => c === top).map(([v]) => v).sort((a, b) => a - b);

  const sq = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  const result: Record<string, number | string> = {
    count: n,
    sum: tidy(sum),
    arithmeticMean: tidy(mean),
    median: tidy(median),
    mode: modes.length ? modes.join(', ') : 'não há moda',
    min: sorted[0] as number,
    max: sorted[n - 1] as number,
    range: tidy((sorted[n - 1] as number) - (sorted[0] as number)),
    populationStdDev: tidy(Math.sqrt(sq / n)),
  };
  if (n > 1) result.sampleStdDev = tidy(Math.sqrt(sq / (n - 1)));
  if (values.every((v) => v > 0)) {
    result.geometricMean = tidy(Math.exp(values.reduce((a, v) => a + Math.log(v), 0) / n));
    result.harmonicMean = tidy(n / values.reduce((a, v) => a + 1 / v, 0));
  }
  if (weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) throw new ToolError('A soma dos pesos não pode ser zero');
    result.weightedMean = tidy(values.reduce((a, v, i) => a + v * (weights[i] as number), 0) / totalWeight);
  }
  return result;
}

export const averageTool = defineTool({
  id: 'media',
  name: 'Calculadora de Média',
  description: 'Média aritmética, ponderada, geométrica e harmônica, com mediana, moda e desvio padrão',
  category: 'calculadoras',
  keywords: ['média', 'mediana', 'moda', 'desvio padrão', 'estatística', 'notas', 'ponderada'],
  icon: '📊',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    values: z.string().max(20_000).default(''),
    weights: z.string().max(20_000).optional(),
  }),
  outputSchema: z
    .object({ count: z.number(), mode: z.string() })
    .catchall(z.union([z.number(), z.string()])),
  execute: ({ values, weights }) => {
    const list = parseNumbers(values);
    if (list.length === 0) throw new ToolError('Informe ao menos um número');
    if (list.length > 10_000) throw new ToolError('Use no máximo 10.000 valores');
    let w: number[] | undefined;
    if (weights && weights.trim() !== '') {
      w = parseNumbers(weights);
      if (w.length !== list.length) throw new ToolError(`São ${list.length} valores e ${w.length} pesos; as quantidades devem ser iguais`);
      if (w.some((x) => x < 0)) throw new ToolError('Os pesos não podem ser negativos');
    }
    return statistics(list, w) as { count: number; mode: string };
  },
  fields: {
    values: { label: 'Valores', multiline: true, placeholder: '7,5  8  6,5  9', help: 'Separe por espaço, ponto e vírgula ou quebra de linha. A vírgula é o separador decimal.' },
    weights: { label: 'Pesos (opcional)', placeholder: '1 2 2 3', help: 'Mesma quantidade de valores; calcula a média ponderada.' },
  },
  outputLabels: {
    count: 'Quantidade', sum: 'Soma', arithmeticMean: 'Média aritmética', weightedMean: 'Média ponderada',
    geometricMean: 'Média geométrica', harmonicMean: 'Média harmônica', median: 'Mediana', mode: 'Moda',
    min: 'Mínimo', max: 'Máximo', range: 'Amplitude', populationStdDev: 'Desvio padrão (populacional)',
    sampleStdDev: 'Desvio padrão (amostral)',
  },
  examples: [
    { description: 'Quatro notas', input: { values: '7 8 6 9' }, output: { arithmeticMean: 7.5, median: 7.5, count: 4 } },
    { description: 'Média ponderada', input: { values: '6 8 10', weights: '1 2 3' }, output: { weightedMean: 8.66666666667 } },
  ],
  documentation:
    'Calcula as medidas a partir da lista informada. Médias geométrica e harmônica só existem para valores positivos. O desvio padrão populacional divide por n (use quando a lista é todo o conjunto) e o amostral divide por n−1 (use quando é uma amostra).',
});

// ---------- desconto ----------

export const discountTool = defineTool({
  id: 'desconto',
  name: 'Calculadora de Desconto',
  description: 'Calcula o preço final, a economia e o percentual de um desconto',
  category: 'calculadoras',
  keywords: ['desconto', 'promoção', 'preço', 'economia', 'liquidação', 'percentual'],
  icon: '🏷️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    price: num(0).default(100),
    kind: z.enum(['percent', 'value']).default('percent'),
    discount: num(0).default(10),
  }),
  outputSchema: z.object({ finalPrice: z.number(), saved: z.number(), percent: z.number() }),
  execute: ({ price, kind, discount }) => {
    const saved = kind === 'percent' ? (price * discount) / 100 : discount;
    if (saved > price) throw new ToolError('O desconto não pode ser maior que o preço');
    return { finalPrice: round2(price - saved), saved: round2(saved), percent: price === 0 ? 0 : roundTo((saved / price) * 100, 2) };
  },
  fields: {
    price: { label: 'Preço original (R$)' },
    kind: { label: 'O desconto é em', optionLabels: { percent: 'Porcentagem (%)', value: 'Valor (R$)' } },
    discount: { label: 'Desconto' },
  },
  outputLabels: { finalPrice: 'Preço final (R$)', saved: 'Você economiza (R$)', percent: 'Desconto equivalente (%)' },
  examples: [
    { description: '15% sobre R$ 200', input: { price: 200, kind: 'percent', discount: 15 }, output: { finalPrice: 170, saved: 30, percent: 15 } },
    { description: 'R$ 30 de desconto em R$ 120', input: { price: 120, kind: 'value', discount: 30 }, output: { finalPrice: 90, percent: 25 } },
  ],
  documentation:
    'Informe o preço e o desconto em porcentagem ou em reais; a ferramenta mostra o valor final, a economia e o percentual equivalente. Valores são arredondados ao centavo.',
});

// ---------- gorjeta ----------

export const tipTool = defineTool({
  id: 'gorjeta',
  name: 'Calculadora de Gorjeta',
  description: 'Calcula a gorjeta, o total da conta e a divisão por pessoa',
  category: 'calculadoras',
  keywords: ['gorjeta', 'taxa de serviço', 'conta', 'restaurante', 'dividir', '10%'],
  icon: '🍽️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    bill: num(0).default(100),
    tipPercent: num(0, 100).default(10),
    people: z.number().int().min(1).max(1000).default(1),
  }),
  outputSchema: z.object({ tip: z.number(), total: z.number(), perPerson: z.number() }),
  execute: ({ bill, tipPercent, people }) => {
    const tip = round2((bill * tipPercent) / 100);
    const total = round2(bill + tip);
    return { tip, total, perPerson: round2(total / people) };
  },
  fields: {
    bill: { label: 'Valor da conta (R$)' },
    tipPercent: { label: 'Gorjeta (%)', help: 'A taxa de serviço usual no Brasil é de 10%.' },
    people: { label: 'Número de pessoas' },
  },
  outputLabels: { tip: 'Gorjeta (R$)', total: 'Total (R$)', perPerson: 'Por pessoa (R$)' },
  examples: [{ description: 'Conta de R$ 240 para 4 pessoas', input: { bill: 240, tipPercent: 10, people: 4 }, output: { tip: 24, total: 264, perPerson: 66 } }],
  documentation:
    'A gorjeta é calculada sobre o valor da conta; o total é dividido igualmente entre as pessoas e arredondado ao centavo, então a soma das partes pode diferir do total em até alguns centavos.',
});

// ---------- área ----------

export type AreaShape = 'rectangle' | 'square' | 'triangle' | 'triangleSides' | 'circle' | 'trapezoid' | 'parallelogram' | 'rhombus' | 'ellipse' | 'sector';

const AREA_SPEC: Record<AreaShape, { label: string; needs: ('a' | 'b' | 'c')[]; help: string }> = {
  rectangle: { label: 'Retângulo', needs: ['a', 'b'], help: 'a = largura, b = altura' },
  square: { label: 'Quadrado', needs: ['a'], help: 'a = lado' },
  triangle: { label: 'Triângulo (base e altura)', needs: ['a', 'b'], help: 'a = base, b = altura' },
  triangleSides: { label: 'Triângulo (três lados)', needs: ['a', 'b', 'c'], help: 'a, b, c = lados (fórmula de Herão)' },
  circle: { label: 'Círculo', needs: ['a'], help: 'a = raio' },
  trapezoid: { label: 'Trapézio', needs: ['a', 'b', 'c'], help: 'a = base maior, b = base menor, c = altura' },
  parallelogram: { label: 'Paralelogramo', needs: ['a', 'b'], help: 'a = base, b = altura' },
  rhombus: { label: 'Losango', needs: ['a', 'b'], help: 'a = diagonal maior, b = diagonal menor' },
  ellipse: { label: 'Elipse', needs: ['a', 'b'], help: 'a, b = semieixos' },
  sector: { label: 'Setor circular', needs: ['a', 'b'], help: 'a = raio, b = ângulo em graus' },
};

export function computeArea(shape: AreaShape, p: { a?: number | undefined; b?: number | undefined; c?: number | undefined }) {
  const spec = AREA_SPEC[shape];
  for (const key of spec.needs) {
    if (p[key] === undefined) throw new ToolError(`Informe ${key.toUpperCase()}: ${spec.help}`);
  }
  const [a, b, c] = [p.a as number, p.b as number, p.c as number];
  switch (shape) {
    case 'rectangle': return { area: tidy(a * b), perimeter: tidy(2 * (a + b)) };
    case 'square': return { area: tidy(a * a), perimeter: tidy(4 * a) };
    case 'triangle': return { area: tidy((a * b) / 2) };
    case 'triangleSides': {
      if (a + b <= c || a + c <= b || b + c <= a) throw new ToolError('Esses lados não formam um triângulo (cada lado deve ser menor que a soma dos outros dois)');
      const s = (a + b + c) / 2;
      return { area: tidy(Math.sqrt(s * (s - a) * (s - b) * (s - c))), perimeter: tidy(a + b + c) };
    }
    case 'circle': return { area: tidy(Math.PI * a * a), perimeter: tidy(2 * Math.PI * a) };
    case 'trapezoid': return { area: tidy(((a + b) * c) / 2) };
    case 'parallelogram': return { area: tidy(a * b) };
    case 'rhombus': return { area: tidy((a * b) / 2) };
    case 'ellipse': {
      // Perímetro: aproximação de Ramanujan (erro muito pequeno).
      const h = ((a - b) / (a + b)) ** 2;
      return { area: tidy(Math.PI * a * b), perimeter: tidy(Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))) };
    }
    case 'sector': {
      if (b > 360) throw new ToolError('O ângulo deve ser de até 360 graus');
      return { area: tidy((b / 360) * Math.PI * a * a), perimeter: tidy(2 * a + (b / 360) * 2 * Math.PI * a) };
    }
  }
}

const optionalDim = z.number().finite().positive().max(1e9).optional();

export const areaTool = defineTool({
  id: 'area',
  name: 'Calculadora de Área',
  description: 'Calcula a área e o perímetro de retângulos, triângulos, círculos, trapézios e outras figuras planas',
  category: 'calculadoras',
  keywords: ['área', 'perímetro', 'geometria', 'retângulo', 'triângulo', 'círculo', 'trapézio', 'metros quadrados'],
  icon: '📏',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    shape: z.enum(Object.keys(AREA_SPEC) as [AreaShape, ...AreaShape[]]).default('rectangle'),
    a: optionalDim.default(5),
    b: optionalDim.default(3),
    c: optionalDim,
  }),
  outputSchema: z.object({ area: z.number(), perimeter: z.number().optional() }),
  execute: ({ shape, a, b, c }) => computeArea(shape, { a, b, c }),
  fields: {
    shape: { label: 'Figura', optionLabels: Object.fromEntries(Object.entries(AREA_SPEC).map(([k, v]) => [k, `${v.label} — ${v.help}`])) },
    a: { label: 'Medida a' },
    b: { label: 'Medida b' },
    c: { label: 'Medida c', help: 'Só para figuras que usam três medidas.' },
  },
  outputLabels: { area: 'Área (unidade²)', perimeter: 'Perímetro (unidade)' },
  examples: [
    { description: 'Retângulo 5 × 3', input: { shape: 'rectangle', a: 5, b: 3 }, output: { area: 15, perimeter: 16 } },
    { description: 'Triângulo 3-4-5', input: { shape: 'triangleSides', a: 3, b: 4, c: 5 }, output: { area: 6, perimeter: 12 } },
    { description: 'Círculo de raio 1', input: { shape: 'circle', a: 1 }, output: { area: 3.14159265359 } },
  ],
  documentation:
    'Use a mesma unidade em todas as medidas: o resultado sai em unidade quadrada (metros dão m²) e o perímetro em unidade. As medidas a, b e c mudam de significado conforme a figura, como indicado na lista. O perímetro da elipse é uma aproximação de Ramanujan.',
});

// ---------- volume ----------

export type VolumeShape = 'cube' | 'box' | 'cylinder' | 'cone' | 'sphere' | 'pyramid' | 'triangularPrism';

const VOLUME_SPEC: Record<VolumeShape, { label: string; needs: ('a' | 'b' | 'c')[]; help: string }> = {
  cube: { label: 'Cubo', needs: ['a'], help: 'a = aresta' },
  box: { label: 'Paralelepípedo', needs: ['a', 'b', 'c'], help: 'a = comprimento, b = largura, c = altura' },
  cylinder: { label: 'Cilindro', needs: ['a', 'b'], help: 'a = raio da base, b = altura' },
  cone: { label: 'Cone', needs: ['a', 'b'], help: 'a = raio da base, b = altura' },
  sphere: { label: 'Esfera', needs: ['a'], help: 'a = raio' },
  pyramid: { label: 'Pirâmide de base retangular', needs: ['a', 'b', 'c'], help: 'a, b = lados da base, c = altura' },
  triangularPrism: { label: 'Prisma triangular', needs: ['a', 'b', 'c'], help: 'a = base do triângulo, b = altura do triângulo, c = comprimento do prisma' },
};

const LITERS_PER_CUBIC_UNIT = { mm: 1e-6, cm: 1e-3, dm: 1, m: 1000 } as const;

export function computeVolume(shape: VolumeShape, unit: keyof typeof LITERS_PER_CUBIC_UNIT, p: { a?: number | undefined; b?: number | undefined; c?: number | undefined }) {
  const spec = VOLUME_SPEC[shape];
  for (const key of spec.needs) {
    if (p[key] === undefined) throw new ToolError(`Informe ${key.toUpperCase()}: ${spec.help}`);
  }
  const [a, b, c] = [p.a as number, p.b as number, p.c as number];
  const volume = {
    cube: () => a ** 3,
    box: () => a * b * c,
    cylinder: () => Math.PI * a * a * b,
    cone: () => (Math.PI * a * a * b) / 3,
    sphere: () => (4 / 3) * Math.PI * a ** 3,
    pyramid: () => (a * b * c) / 3,
    triangularPrism: () => ((a * b) / 2) * c,
  }[shape]();
  return { volume: tidy(volume), liters: tidy(volume * LITERS_PER_CUBIC_UNIT[unit]) };
}

export const volumeTool = defineTool({
  id: 'volume',
  name: 'Calculadora de Volume',
  description: 'Calcula o volume de cubos, caixas, cilindros, cones, esferas e pirâmides, com a capacidade em litros',
  category: 'calculadoras',
  keywords: ['volume', 'litros', 'capacidade', 'cilindro', 'esfera', 'cubo', 'caixa d\'água', 'metros cúbicos'],
  icon: '🧊',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    shape: z.enum(Object.keys(VOLUME_SPEC) as [VolumeShape, ...VolumeShape[]]).default('box'),
    unit: z.enum(['mm', 'cm', 'dm', 'm']).default('m'),
    a: optionalDim.default(2),
    b: optionalDim.default(1.5),
    c: optionalDim.default(1),
  }),
  outputSchema: z.object({ volume: z.number(), liters: z.number() }),
  execute: ({ shape, unit, a, b, c }) => computeVolume(shape, unit, { a, b, c }),
  fields: {
    shape: { label: 'Sólido', optionLabels: Object.fromEntries(Object.entries(VOLUME_SPEC).map(([k, v]) => [k, `${v.label} — ${v.help}`])) },
    unit: { label: 'Unidade das medidas', optionLabels: { mm: 'Milímetros', cm: 'Centímetros', dm: 'Decímetros', m: 'Metros' } },
    a: { label: 'Medida a' },
    b: { label: 'Medida b' },
    c: { label: 'Medida c', help: 'Só para sólidos que usam três medidas.' },
  },
  outputLabels: { volume: 'Volume (unidade³)', liters: 'Capacidade (litros)' },
  examples: [
    { description: 'Caixa de 2 × 1,5 × 1 m', input: { shape: 'box', unit: 'm', a: 2, b: 1.5, c: 1 }, output: { volume: 3, liters: 3000 } },
    { description: 'Cubo de 10 cm', input: { shape: 'cube', unit: 'cm', a: 10 }, output: { volume: 1000, liters: 1 } },
  ],
  documentation:
    'Use a mesma unidade em todas as medidas: o volume sai em unidade cúbica e a capacidade é convertida para litros (1 dm³ = 1 litro; 1 m³ = 1000 litros). As medidas a, b e c mudam de significado conforme o sólido.',
});
