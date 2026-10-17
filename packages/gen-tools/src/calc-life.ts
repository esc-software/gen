import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { ageBetween, today } from './calc-daily.js';
import { roundTo } from './calc-math.js';
import { parseIsoDate, type CalendarDate } from './dates.js';
import { LIFE_TABLE, LIFE_TABLE_SOURCE, type LifeTableSex } from './life-table-data.js';

const DAYS_PER_YEAR = 365.2425;
const MAX_AGE_YEARS = 130;
const OLDEST_AGE_IN_TABLE = 90;

const utcOf = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);
const brOf = (d: CalendarDate) => `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;

/**
 * Expectativa de vida restante, em anos, para quem tem `ageYears` anos (pode ter parte fracionária).
 * Interpola entre as idades exatas da tábua; a partir de 90 anos vale o valor de "90 ou mais".
 */
export function remainingLifeExpectancy(ageYears: number, sex: LifeTableSex): number {
  const table = LIFE_TABLE[sex];
  if (!Number.isFinite(ageYears) || ageYears < 0) throw new ToolError('Idade inválida');
  if (ageYears >= OLDEST_AGE_IN_TABLE) return table[OLDEST_AGE_IN_TABLE] as number;
  const whole = Math.floor(ageYears);
  const fraction = ageYears - whole;
  const here = table[whole] as number;
  const next = table[whole + 1] as number;
  return here + fraction * (next - here);
}

const isoDate = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

const NOTE =
  'Média da população brasileira, não uma previsão para você: a vida de cada pessoa depende de saúde, hábitos, genética e acaso. Não use este número para decisões médicas, financeiras ou de seguro.';

export const lifeExpectancyTool = defineTool({
  id: 'expectativa-vida',
  name: 'Calculadora de Expectativa de Vida',
  description: 'Mostra quantos dias você já viveu e a expectativa de vida restante, pela média da população brasileira (IBGE)',
  category: 'calculadoras',
  keywords: ['expectativa de vida', 'dias vividos', 'quanto tempo de vida', 'longevidade', 'ibge', 'tábua de mortalidade', 'idade', 'anos restantes'],
  icon: '⏳',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    birthDate: isoDate('Data de nascimento'),
    sex: z.enum(['ambos', 'homens', 'mulheres']).default('ambos'),
    referenceDate: isoDate('Data de referência').optional(),
  }),
  outputSchema: z.object({
    age: z.string(),
    daysLived: z.number(),
    expectancyAtBirth: z.string(),
    remaining: z.string(),
    remainingDays: z.number(),
    expectedAge: z.string(),
    lifeLivedPercent: z.number(),
    source: z.string(),
    note: z.string(),
  }),
  execute: ({ birthDate, sex, referenceDate }) => {
    const birth = parseIsoDate(birthDate) as CalendarDate;
    const ref = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    if (utcOf(ref) < utcOf(birth)) throw new ToolError('A data de referência é anterior ao nascimento');
    const a = ageBetween(birth, ref);
    if (a.years > MAX_AGE_YEARS) throw new ToolError(`A idade calculada passa de ${MAX_AGE_YEARS} anos; confira a data de nascimento`);

    const ageYears = a.totalDays / DAYS_PER_YEAR;
    const remainingYears = remainingLifeExpectancy(ageYears, sex);
    const atBirth = (LIFE_TABLE[sex][0] as number);
    const wholeRemaining = Math.floor(remainingYears);
    const remainingMonths = Math.round((remainingYears - wholeRemaining) * 12);
    const [yearsPart, monthsPart] = remainingMonths === 12 ? [wholeRemaining + 1, 0] : [wholeRemaining, remainingMonths];
    const expectedTotal = ageYears + remainingYears;

    return {
      age: `${a.years} anos, ${a.months} meses e ${a.days} dias`,
      daysLived: a.totalDays,
      expectancyAtBirth: `${roundTo(atBirth, 1)} anos`,
      remaining: `cerca de ${yearsPart} anos e ${monthsPart} meses`,
      remainingDays: Math.round(remainingYears * DAYS_PER_YEAR),
      expectedAge: `${roundTo(expectedTotal, 1)} anos`,
      lifeLivedPercent: roundTo((ageYears / expectedTotal) * 100, 1),
      source: `${LIFE_TABLE_SOURCE.name}, divulgada em ${LIFE_TABLE_SOURCE.published}. Cálculo feito em ${brOf(ref)}.`,
      note: NOTE,
    };
  },
  fields: {
    birthDate: { label: 'Data de nascimento', inputType: 'date' },
    sex: { label: 'Tábua a usar', optionLabels: { ambos: 'Ambos os sexos', homens: 'Homens', mulheres: 'Mulheres' }, help: 'O IBGE publica uma tábua para cada grupo.' },
    referenceDate: { label: 'Calcular em (opcional)', inputType: 'date', help: 'Se vazio, usa a data de hoje do seu dispositivo.' },
  },
  outputLabels: {
    age: 'Idade',
    daysLived: 'Dias vividos',
    expectancyAtBirth: 'Expectativa ao nascer (média)',
    remaining: 'Expectativa de vida restante (média)',
    remainingDays: 'Dias restantes (média)',
    expectedAge: 'Idade média esperada ao morrer',
    lifeLivedPercent: 'Percentual já vivido (%)',
    source: 'Fonte',
    note: 'Importante',
  },
  examples: [
    {
      description: 'Nascida em 01/01/2000, mulher, em 01/01/2025',
      input: { birthDate: '2000-01-01', sex: 'mulheres', referenceDate: '2025-01-01' },
      output: { age: '25 anos, 0 meses e 0 dias', expectancyAtBirth: '79.9 anos' },
    },
  ],
  documentation:
    `Usa a coluna E(x), a expectativa de vida à idade x, das ${LIFE_TABLE_SOURCE.name}, divulgadas pelo IBGE em ${LIFE_TABLE_SOURCE.published}. O valor mostrado é a média de anos que ainda viveriam as pessoas que chegam à sua idade, mantidas as taxas de mortalidade de ${LIFE_TABLE_SOURCE.year}. Entre duas idades exatas o cálculo interpola linearmente; a partir de 90 anos vale o valor de "90 anos ou mais". A tábua muda a cada ano e não considera seu estado de saúde nem seus hábitos. ${NOTE}`,
});
