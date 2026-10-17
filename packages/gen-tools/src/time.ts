import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** Relógio de parede de um instante (ms desde 1970 UTC) em um fuso. */
export function wallClock(ms: number, tz: string): LocalDateTime {
  const parts = Object.fromEntries(
    formatterFor(tz)
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const toUtcMs = (t: LocalDateTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);

/** Deslocamento do fuso em minutos em relação ao UTC, em um instante (positivo a leste). */
export function offsetMinutes(ms: number, tz: string): number {
  const flooredToSecond = Math.floor(ms / 1000) * 1000;
  return Math.round((toUtcMs(wallClock(flooredToSecond, tz)) - flooredToSecond) / 60_000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export type Resolution = 'ok' | 'gap' | 'ambiguous';

export interface ZonedResolution {
  /** Instante escolhido (ms desde 1970 UTC). */
  ms: number;
  status: Resolution;
  /** Todos os instantes possíveis para o relógio de parede informado. */
  candidates: number[];
}

/**
 * Converte um relógio de parede em um fuso para um instante UTC, tratando o horário de verão:
 * - horário inexistente (adiantamento do relógio): `gap`, resolvido com o deslocamento anterior;
 * - horário repetido (atraso do relógio): `ambiguous`, resolvido pela primeira ocorrência.
 */
export function zonedTimeToUtc(local: LocalDateTime, tz: string): ZonedResolution {
  const asUtc = toUtcMs(local);
  const day = 86_400_000;
  const offsets = new Set([offsetMinutes(asUtc - day, tz), offsetMinutes(asUtc + day, tz), offsetMinutes(asUtc, tz)]);
  const candidates = [...offsets]
    .map((o) => asUtc - o * 60_000)
    .filter((ms) => offsetMinutes(ms, tz) === (asUtc - ms) / 60_000)
    .sort((a, b) => a - b);

  if (candidates.length === 1) return { ms: candidates[0] as number, status: 'ok', candidates };
  if (candidates.length > 1) return { ms: candidates[0] as number, status: 'ambiguous', candidates };
  // Lacuna: usa o deslocamento vigente antes da transição (o relógio salta para frente).
  const before = offsetMinutes(asUtc - day, tz);
  return { ms: asUtc - before * 60_000, status: 'gap', candidates: [] };
}

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Lê "AAAA-MM-DD", "AAAA-MM-DD HH:mm" ou "AAAA-MM-DDTHH:mm:ss" e valida o calendário. */
export function parseLocalDateTime(text: string): LocalDateTime | null {
  const m = DATE_TIME.exec(text.trim());
  if (!m) return null;
  const t: LocalDateTime = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
    second: Number(m[6] ?? 0),
  };
  const d = new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second));
  const same =
    d.getUTCFullYear() === t.year && d.getUTCMonth() === t.month - 1 && d.getUTCDate() === t.day &&
    d.getUTCHours() === t.hour && d.getUTCMinutes() === t.minute && d.getUTCSeconds() === t.second;
  return same && t.hour < 24 ? t : null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatLocal(t: LocalDateTime): string {
  return `${pad(t.year, 4)}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`;
}

export function describeInstant(ms: number, tz: string): string {
  return `${formatLocal(wallClock(ms, tz))} (${tz}, ${formatOffset(offsetMinutes(ms, tz))})`;
}

const MAX_MS = 8.64e15;

const tzSchema = z.string().min(1).max(64).refine(isValidTimeZone, { message: 'Fuso horário desconhecido; use um nome IANA, como America/Sao_Paulo' });

// ---------- ferramenta: data e timestamp ----------

export const timestampTool = defineTool({
  id: 'timestamp',
  name: 'Conversor de Data e Timestamp',
  description: 'Converte timestamp Unix em data e hora, e data e hora em timestamp, com fuso horário e horário de verão',
  category: 'conversores',
  keywords: ['timestamp', 'unix', 'epoch', 'data', 'hora', 'utc', 'fuso', 'conversor'],
  icon: '⏱️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    direction: z.enum(['toDate', 'toTimestamp']).default('toDate'),
    value: z.string().max(40).default(''),
    unit: z.enum(['seconds', 'milliseconds']).default('seconds'),
    timeZone: tzSchema.default('America/Sao_Paulo'),
  }),
  outputSchema: z.object({
    utc: z.string(),
    local: z.string(),
    timestampSeconds: z.number(),
    timestampMilliseconds: z.number(),
    note: z.string().optional(),
  }),
  execute: ({ direction, value, unit, timeZone }) => {
    const text = value.trim();
    if (text === '') throw new ToolError(direction === 'toDate' ? 'Informe o timestamp' : 'Informe a data e hora');

    let ms: number;
    let note: string | undefined;
    if (direction === 'toDate') {
      if (!/^-?\d+(\.\d+)?$/.test(text)) throw new ToolError('O timestamp deve ser um número');
      ms = unit === 'seconds' ? Math.round(Number(text) * 1000) : Math.round(Number(text));
    } else {
      const local = parseLocalDateTime(text);
      if (!local) throw new ToolError('Data inválida. Use AAAA-MM-DD ou AAAA-MM-DD HH:mm:ss');
      const resolved = zonedTimeToUtc(local, timeZone);
      ms = resolved.ms;
      if (resolved.status === 'gap') note = `Esse horário não existe em ${timeZone} (adiantamento do relógio por horário de verão); foi usado o deslocamento anterior à mudança.`;
      if (resolved.status === 'ambiguous') note = `Esse horário ocorre duas vezes em ${timeZone} (fim do horário de verão); foi usada a primeira ocorrência. A outra é ${new Date(resolved.candidates[1] as number).toISOString()}.`;
    }
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) throw new ToolError('Valor fora do intervalo de datas suportado');

    return {
      utc: new Date(ms).toISOString(),
      local: describeInstant(ms, timeZone),
      timestampSeconds: Math.floor(ms / 1000),
      timestampMilliseconds: ms,
      ...(note ? { note } : {}),
    };
  },
  fields: {
    direction: { label: 'Conversão', optionLabels: { toDate: 'Timestamp → data', toTimestamp: 'Data → timestamp' } },
    value: { label: 'Valor', placeholder: '1700000000  ou  2024-03-10 14:30:00', help: 'Para data, use AAAA-MM-DD HH:mm:ss no fuso escolhido abaixo.' },
    unit: { label: 'Unidade do timestamp', optionLabels: { seconds: 'Segundos', milliseconds: 'Milissegundos' } },
    timeZone: { label: 'Fuso horário (IANA)', placeholder: 'America/Sao_Paulo' },
  },
  outputLabels: {
    utc: 'UTC (ISO 8601)',
    local: 'No fuso escolhido',
    timestampSeconds: 'Timestamp (segundos)',
    timestampMilliseconds: 'Timestamp (milissegundos)',
    note: 'Observação',
  },
  examples: [
    {
      description: 'Timestamp para data',
      input: { direction: 'toDate', value: '1700000000', unit: 'seconds', timeZone: 'UTC' },
      output: { utc: '2023-11-14T22:13:20.000Z', timestampSeconds: 1700000000 },
    },
    {
      description: 'Data em São Paulo para timestamp',
      input: { direction: 'toTimestamp', value: '2024-01-01 00:00:00', unit: 'seconds', timeZone: 'America/Sao_Paulo' },
      output: { utc: '2024-01-01T03:00:00.000Z', timestampSeconds: 1704078000 },
    },
  ],
  documentation:
    'Um timestamp Unix conta segundos (ou milissegundos) desde 1970-01-01T00:00:00Z e não depende de fuso. Para converter uma data local em timestamp é preciso informar o fuso horário, usando nomes IANA (America/Sao_Paulo, Europe/Lisbon, UTC...). A ferramenta usa a base de fusos do seu sistema, inclusive o histórico de horário de verão, e avisa quando um horário não existe ou se repete na mudança do relógio.',
});

// ---------- ferramenta: fuso horário ----------

export const timeZoneTool = defineTool({
  id: 'fuso-horario',
  name: 'Conversor de Fuso Horário',
  description: 'Converte uma data e hora de um fuso horário para outro, considerando o horário de verão',
  category: 'conversores',
  keywords: ['fuso', 'horário', 'timezone', 'utc', 'gmt', 'horário de verão', 'reunião'],
  icon: '🌍',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    dateTime: z.string().max(25),
    fromZone: tzSchema.default('America/Sao_Paulo'),
    toZone: tzSchema.default('Europe/Lisbon'),
  }),
  outputSchema: z.object({
    source: z.string(),
    target: z.string(),
    utc: z.string(),
    differenceHours: z.number(),
    note: z.string().optional(),
  }),
  execute: ({ dateTime, fromZone, toZone }) => {
    const local = parseLocalDateTime(dateTime);
    if (!local) throw new ToolError('Data inválida. Use AAAA-MM-DD HH:mm (ex.: 2024-06-15 14:30)');
    const resolved = zonedTimeToUtc(local, fromZone);
    const note =
      resolved.status === 'gap'
        ? `Esse horário não existe em ${fromZone} (adiantamento do relógio); foi usado o deslocamento anterior à mudança.`
        : resolved.status === 'ambiguous'
          ? `Esse horário ocorre duas vezes em ${fromZone}; foi usada a primeira ocorrência.`
          : undefined;
    return {
      source: describeInstant(resolved.ms, fromZone),
      target: describeInstant(resolved.ms, toZone),
      utc: new Date(resolved.ms).toISOString(),
      differenceHours: (offsetMinutes(resolved.ms, toZone) - offsetMinutes(resolved.ms, fromZone)) / 60,
      ...(note ? { note } : {}),
    };
  },
  fields: {
    dateTime: { label: 'Data e hora de origem', placeholder: '2024-06-15 14:30' },
    fromZone: { label: 'Fuso de origem (IANA)', placeholder: 'America/Sao_Paulo' },
    toZone: { label: 'Fuso de destino (IANA)', placeholder: 'Europe/Lisbon' },
  },
  outputLabels: {
    source: 'Origem',
    target: 'Destino',
    utc: 'UTC',
    differenceHours: 'Diferença (horas)',
    note: 'Observação',
  },
  examples: [
    {
      description: 'São Paulo para Nova York no verão americano (Nova York fica 1 hora atrás)',
      input: { dateTime: '2024-07-01 12:00', fromZone: 'America/Sao_Paulo', toZone: 'America/New_York' },
      output: { utc: '2024-07-01T15:00:00.000Z', differenceHours: -1 },
    },
  ],
  documentation:
    'Informe a data e hora no fuso de origem e o nome IANA dos fusos (por exemplo America/Sao_Paulo, Europe/London, Asia/Tokyo, UTC). O resultado considera as regras de horário de verão vigentes na data informada, inclusive as já extintas (o Brasil aboliu o horário de verão em 2019). Horários que não existem ou se repetem na mudança do relógio são sinalizados.',
});
