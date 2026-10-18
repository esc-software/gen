import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DOW_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};
const SEARCH_DAYS = 366 * 8;

export interface CronField {
  raw: string;
  values: number[];
  /** Começa com "*": o campo não restringe (regra do cron para dia do mês e dia da semana). */
  star: boolean;
}

export interface ParsedCron {
  expression: string;
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

function parseNumber(token: string, names: string[] | undefined, nameBase: number, label: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const idx = names ? names.indexOf(token.toUpperCase()) : -1;
  if (idx >= 0) return idx + nameBase;
  throw new ToolError(`Valor inválido em ${label}: "${token}"`);
}

function parseField(raw: string, min: number, max: number, label: string, names?: string[], nameBase = 0): CronField {
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    if (part === '') throw new ToolError(`Campo de ${label} com vírgula sobrando`);
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined || rangePart === undefined) throw new ToolError(`Campo de ${label} inválido: "${part}"`);
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) throw new ToolError(`O passo de ${label} precisa ser um número maior que zero ("${part}")`);
      step = Number(stepPart);
    }
    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b, more] = rangePart.split('-');
      if (more !== undefined || !a || !b) throw new ToolError(`Intervalo inválido em ${label}: "${part}"`);
      lo = parseNumber(a, names, nameBase, label);
      hi = parseNumber(b, names, nameBase, label);
      if (lo > hi) throw new ToolError(`Intervalo invertido em ${label}: "${part}"`);
    } else {
      lo = parseNumber(rangePart, names, nameBase, label);
      hi = stepPart !== undefined ? max : lo;
    }
    if (lo < min || hi > max) throw new ToolError(`Em ${label}, use valores de ${min} a ${max} ("${part}")`);
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { raw, values: [...values].sort((x, y) => x - y), star: raw.startsWith('*') };
}

export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim().replace(/\s+/g, ' ');
  if (trimmed === '') throw new ToolError('Digite uma expressão cron, como */15 * * * *');
  const expanded = trimmed.startsWith('@') ? (MACROS[trimmed.toLowerCase()] ?? '') : trimmed;
  if (expanded === '') throw new ToolError(`Atalho desconhecido: ${trimmed}. Use @hourly, @daily, @weekly, @monthly ou @yearly`);
  const fields = expanded.split(' ');
  if (fields.length !== 5) throw new ToolError(`Uma expressão cron tem 5 campos (minuto hora dia-do-mês mês dia-da-semana) e esta tem ${fields.length}`);
  const [m, h, d, mo, w] = fields as [string, string, string, string, string];
  const dow = parseField(w, 0, 7, 'dia da semana', DOW_NAMES, 0);
  // 7 também é domingo.
  const dowValues = [...new Set(dow.values.map((v) => v % 7))].sort((x, y) => x - y);
  return {
    expression: expanded,
    minute: parseField(m, 0, 59, 'minuto'),
    hour: parseField(h, 0, 23, 'hora'),
    dom: parseField(d, 1, 31, 'dia do mês'),
    month: parseField(mo, 1, 12, 'mês', MONTH_NAMES, 1),
    dow: { ...dow, values: dowValues },
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Próximas execuções, estritamente depois de `from`, em horário "de parede" (sem fuso e sem horário de verão). */
export function nextRuns(cron: ParsedCron, from: Date, count: number): Date[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes()) + 60_000;
  const first = new Date(start);
  const dayZero = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const out: Date[] = [];
  const bothRestricted = !cron.dom.star && !cron.dow.star;
  for (let i = 0; i < SEARCH_DAYS && out.length < count; i++) {
    const day = new Date(dayZero + i * 86_400_000);
    if (!cron.month.values.includes(day.getUTCMonth() + 1)) continue;
    const domOk = cron.dom.values.includes(day.getUTCDate());
    const dowOk = cron.dow.values.includes(day.getUTCDay());
    if (!(bothRestricted ? domOk || dowOk : domOk && dowOk)) continue;
    for (const h of cron.hour.values) {
      for (const m of cron.minute.values) {
        const t = day.getTime() + h * 3_600_000 + m * 60_000;
        if (t >= start) {
          out.push(new Date(t));
          if (out.length >= count) return out;
        }
      }
    }
  }
  return out;
}

export function formatRun(date: Date): string {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} (${DOW_PT[date.getUTCDay()]})`;
}

const list = (items: string[]): string => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);
const stepOf = (raw: string): number | undefined => {
  const match = /^\*\/(\d+)$/.exec(raw);
  return match ? Number(match[1]) : undefined;
};

export function describeCron(c: ParsedCron): string {
  const minutes = c.minute.values;
  const hours = c.hour.values;
  let time: string;
  const minuteStep = stepOf(c.minute.raw);
  const hourStep = stepOf(c.hour.raw);
  if (c.minute.raw === '*' && c.hour.raw === '*') time = 'A cada minuto';
  else if (minuteStep !== undefined && c.hour.raw === '*') time = minuteStep === 1 ? 'A cada minuto' : `A cada ${minuteStep} minutos`;
  else if (c.hour.raw === '*' && minutes.length === 1) time = minutes[0] === 0 ? 'No início de cada hora' : `No minuto ${minutes[0]} de cada hora`;
  else if (c.hour.raw === '*') time = `Nos minutos ${list(minutes.map(String))} de cada hora`;
  else if (minuteStep !== undefined && hours.length > 1 && hours.every((h, i) => i === 0 || h === (hours[i - 1] as number) + 1)) time = `A cada ${minuteStep} minutos, entre ${pad(hours[0] as number)}:00 e ${pad(hours[hours.length - 1] as number)}:59`;
  else if (hourStep !== undefined && minutes.length === 1) time = `No minuto ${minutes[0]}, a cada ${hourStep} ${hourStep === 1 ? 'hora' : 'horas'}`;
  else if (minutes.length * hours.length <= 6) time = `Às ${list(hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`)))}`;
  else time = `Nos minutos ${list(minutes.map(String))} das horas ${list(hours.map(String))}`;

  const parts: string[] = [];
  const domText = `${c.dom.values.length === 1 ? 'no dia' : 'nos dias'} ${list(c.dom.values.map(String))} do mês`;
  const days = c.dow.values;
  const contiguous = days.length > 2 && days.every((d, i) => i === 0 || d === (days[i - 1] as number) + 1);
  const dowText = contiguous ? `de ${DOW_PT[days[0] as number]} a ${DOW_PT[days[days.length - 1] as number]}` : `em ${list(days.map((d) => DOW_PT[d] as string))}`;
  if (!c.dom.star && !c.dow.star) parts.push(`${domText} ou ${dowText}`);
  else if (!c.dom.star) parts.push(domText);
  else if (!c.dow.star) parts.push(dowText);
  if (!c.month.star) parts.push(`em ${list(c.month.values.map((m) => MONTH_PT[m - 1] as string))}`);
  if (parts.length === 0 && c.dom.star && c.dow.star && c.month.star && !(c.minute.raw === '*' || minuteStep !== undefined) && c.hour.raw !== '*' && hourStep === undefined) parts.push('todos os dias');
  return [time, ...parts].join(', ');
}

function fieldLines(c: ParsedCron): string[] {
  const show = (f: CronField, label: string, name?: (n: number) => string) => `${label}: ${f.raw} → ${f.star && f.raw === '*' ? 'qualquer valor' : f.values.map((v) => (name ? name(v) : String(v))).join(', ')}`;
  return [
    show(c.minute, 'Minuto'),
    show(c.hour, 'Hora'),
    show(c.dom, 'Dia do mês'),
    show(c.month, 'Mês', (v) => MONTH_PT[v - 1] as string),
    show(c.dow, 'Dia da semana', (v) => DOW_PT[v] as string),
  ];
}

function parseWallClock(text: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!m) throw new ToolError('Use a data inicial no formato AAAA-MM-DD ou AAAA-MM-DDThh:mm');
  const [year, month, day, hour, minute] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)] as [number, number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) throw new ToolError('Data inicial inexistente');
  return date;
}

export const cronTool = defineTool({
  id: 'cron',
  name: 'Explicador de Expressão Cron',
  description: 'Entende uma expressão cron de 5 campos em português e mostra as próximas execuções, com suporte a intervalos, listas, passos, nomes e atalhos como @daily',
  category: 'conversores',
  keywords: ['cron', 'crontab', 'expressão cron', 'agendador', 'cron job', 'cron expression', '*/5 * * * *', 'agendamento linux', 'próxima execução'],
  icon: '⏰',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    expression: z.string().max(200).default('*/15 9-17 * * 1-5'),
    count: z.number().int().min(1).max(20).default(5),
    from: z.string().max(20).default(''),
  }),
  outputSchema: z.object({ summary: z.string(), fields: z.string(), nextRuns: z.string(), expression: z.string() }),
  execute: ({ expression, count, from }) => {
    const cron = parseCron(expression);
    const now = new Date();
    const start = from.trim() === '' ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())) : parseWallClock(from);
    const runs = nextRuns(cron, start, count);
    return {
      summary: describeCron(cron),
      fields: fieldLines(cron).join('\n'),
      nextRuns: runs.length ? runs.map(formatRun).join('\n') : 'Nenhuma execução nos próximos 8 anos (por exemplo, 31 de fevereiro nunca existe).',
      expression: cron.expression,
    };
  },
  fields: {
    expression: { label: 'Expressão cron', help: 'Cinco campos: minuto hora dia-do-mês mês dia-da-semana. Também aceita @hourly, @daily, @weekly, @monthly e @yearly.', placeholder: '*/15 9-17 * * 1-5' },
    count: { label: 'Quantas execuções mostrar' },
    from: { label: 'A partir de (opcional)', help: 'AAAA-MM-DD ou AAAA-MM-DDThh:mm. Se vazio, usa agora. Os horários são os do relógio local, sem fuso.' },
  },
  outputLabels: { summary: 'Em português', fields: 'Campos', nextRuns: 'Próximas execuções', expression: 'Expressão' },
  examples: [{ description: 'Todo dia às 3h', input: { expression: '0 3 * * *', count: 2, from: '2026-01-01T00:00' }, output: { summary: 'Às 03:00, todos os dias', nextRuns: '01/01/2026 03:00 (quinta-feira)\n02/01/2026 03:00 (sexta-feira)' } }],
  documentation:
    'Os cinco campos são minuto (0-59), hora (0-23), dia do mês (1-31), mês (1-12 ou JAN-DEC) e dia da semana (0-7 ou SUN-SAT; 0 e 7 são domingo). Símbolos: * (qualquer), , (lista), - (intervalo), / (passo, como */15). Regra clássica do cron: se o dia do mês e o dia da semana forem ambos restritos, a tarefa roda quando QUALQUER um dos dois combina. As próximas execuções são calculadas em horário de relógio, sem fuso e sem horário de verão; o seu servidor pode usar UTC. Variações como segundos (6 campos) ou Quartz (?, L, W, #) não são suportadas.',
});
