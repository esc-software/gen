import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const DAY_MS = 86_400_000;

/** Interpreta "AAAA-MM-DD" e rejeita datas que não existem (como 2023-02-30). */
export function parseIsoDate(value: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

const toUtc = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Soma `months` meses, limitando o dia ao último do mês de destino (31/01 + 1 mês = 28 ou 29/02). */
function addMonths(d: CalendarDate, months: number): CalendarDate {
  const total = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

export interface DateDifference {
  days: number;
  weeks: number;
  daysAfterWeeks: number;
  years: number;
  months: number;
  daysAfterMonths: number;
  endBeforeStart: boolean;
}

/**
 * Diferença entre duas datas do calendário (sem horário, logo sem efeito de horário de verão).
 * `includeEnd` conta também o último dia.
 */
export function differenceBetween(start: CalendarDate, end: CalendarDate, includeEnd: boolean): DateDifference {
  const endBeforeStart = toUtc(end) < toUtc(start);
  const [from, to] = endBeforeStart ? [end, start] : [start, end];

  const rawDays = Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
  const days = rawDays + (includeEnd ? 1 : 0);

  let months = (to.year - from.year) * 12 + (to.month - from.month);
  while (months > 0 && toUtc(addMonths(from, months)) > toUtc(to)) months--;
  const anchor = addMonths(from, months);
  const daysAfterMonths = Math.round((toUtc(to) - toUtc(anchor)) / DAY_MS) + (includeEnd ? 1 : 0);

  return {
    days,
    weeks: Math.floor(days / 7),
    daysAfterWeeks: days % 7,
    years: Math.floor(months / 12),
    months: months % 12,
    daysAfterMonths,
    endBeforeStart,
  };
}

const isoDate = (label: string) =>
  z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

export const daysBetweenTool = defineTool({
  id: 'dias-entre-datas',
  name: 'Contador de Dias entre Datas',
  description: 'Calcula quantos dias, semanas, meses e anos existem entre duas datas',
  category: 'contadores',
  keywords: ['dias', 'datas', 'diferença', 'calendário', 'prazo', 'intervalo'],
  icon: '📅',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    start: isoDate('Data inicial'),
    end: isoDate('Data final'),
    includeEnd: z.boolean().default(false),
  }),
  outputSchema: z.object({
    days: z.number().int(),
    weeks: z.number().int(),
    daysAfterWeeks: z.number().int(),
    years: z.number().int(),
    months: z.number().int(),
    daysAfterMonths: z.number().int(),
    endBeforeStart: z.boolean(),
  }),
  execute: ({ start, end, includeEnd }) => {
    const a = parseIsoDate(start);
    const b = parseIsoDate(end);
    if (!a || !b) throw new ToolError('Data inválida');
    return differenceBetween(a, b, includeEnd);
  },
  fields: {
    start: { label: 'Data inicial', inputType: 'date' },
    end: { label: 'Data final', inputType: 'date' },
    includeEnd: { label: 'Contar também o dia final' },
  },
  outputLabels: {
    days: 'Dias',
    weeks: 'Semanas completas',
    daysAfterWeeks: 'Dias além das semanas',
    years: 'Anos completos',
    months: 'Meses além dos anos',
    daysAfterMonths: 'Dias além dos meses',
    endBeforeStart: 'Data final anterior à inicial',
  },
  examples: [
    {
      description: 'Ano bissexto',
      input: { start: '2024-01-31', end: '2024-03-01', includeEnd: false },
      output: {
        days: 30,
        weeks: 4,
        daysAfterWeeks: 2,
        years: 0,
        months: 1,
        daysAfterMonths: 1,
        endBeforeStart: false,
      },
    },
  ],
  documentation:
    'Trabalha com datas de calendário, sem horário, então não sofre com horário de verão nem fuso horário. Se a data final for anterior à inicial, o resultado é o intervalo em valor absoluto, sinalizado em "Data final anterior à inicial". Meses e anos completos são contados a partir da data inicial; quando o dia não existe no mês de destino (31/01 + 1 mês), usa-se o último dia do mês.',
});
