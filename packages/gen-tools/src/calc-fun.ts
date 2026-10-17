import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { roundTo } from './calc-math.js';
import { parseIsoDate } from './dates.js';
import { removeDiacritics } from './slug.js';
import { isValidTimeZone, parseLocalDateTime, zonedTimeToUtc } from './time.js';

const ENTERTAINMENT_NOTE = 'Conteúdo de entretenimento e autoconhecimento: não tem comprovação científica e não deve orientar decisões importantes.';

// ---------- numerologia ----------

const PYTHAGOREAN: Record<string, number> = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((letter, i) => {
  PYTHAGOREAN[letter] = (i % 9) + 1;
});

/** Reduz a um dígito, preservando os números mestres 11, 22 e 33 quando pedido. */
export function reduceNumber(n: number, keepMasters = true): number {
  let value = n;
  while (value > 9 && !(keepMasters && (value === 11 || value === 22 || value === 33))) {
    value = [...String(value)].reduce((a, d) => a + Number(d), 0);
  }
  return value;
}

export function nameNumbers(name: string, keepMasters = true) {
  const letters = removeDiacritics(name).toUpperCase().replace(/[^A-Z]/g, '');
  if (letters === '') throw new ToolError('Informe um nome com letras');
  const vowels = letters.replace(/[^AEIOU]/g, '');
  const consonants = letters.replace(/[AEIOU]/g, '');
  const sum = (s: string) => [...s].reduce((a, c) => a + (PYTHAGOREAN[c] as number), 0);
  return {
    expression: reduceNumber(sum(letters), keepMasters),
    soul: vowels ? reduceNumber(sum(vowels), keepMasters) : 0,
    personality: consonants ? reduceNumber(sum(consonants), keepMasters) : 0,
  };
}

export function lifePathNumber(year: number, month: number, day: number, keepMasters = true): number {
  const total = reduceNumber(day, keepMasters) + reduceNumber(month, keepMasters) + reduceNumber(year, keepMasters);
  return reduceNumber(total, keepMasters);
}

const MEANINGS: Record<number, string> = {
  1: 'liderança, iniciativa e independência',
  2: 'cooperação, sensibilidade e diplomacia',
  3: 'comunicação, criatividade e otimismo',
  4: 'organização, disciplina e estabilidade',
  5: 'liberdade, mudança e curiosidade',
  6: 'responsabilidade, cuidado e harmonia',
  7: 'análise, introspecção e busca de conhecimento',
  8: 'ambição, realização e senso prático',
  9: 'humanitarismo, compaixão e encerramento de ciclos',
  11: 'número mestre: intuição e inspiração',
  22: 'número mestre: construção e grandes realizações',
  33: 'número mestre: serviço e acolhimento',
};

export const numerologyTool = defineTool({
  id: 'numerologia',
  name: 'Numerologia do Nome',
  description: 'Calcula os números de expressão, alma e personalidade do nome (tabela pitagórica) e o caminho de vida',
  category: 'calculadoras',
  keywords: ['numerologia', 'nome', 'número da sorte', 'pitagórica', 'expressão', 'caminho de vida', 'significado'],
  icon: '🔮',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    name: z.string().max(200).default(''),
    birthDate: z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: 'Data inválida; use AAAA-MM-DD' }).optional(),
    keepMasterNumbers: z.boolean().default(true),
  }),
  outputSchema: z.object({ expression: z.string(), soul: z.string(), personality: z.string(), lifePath: z.string().optional(), note: z.string() }),
  execute: ({ name, birthDate, keepMasterNumbers }) => {
    const n = nameNumbers(name, keepMasterNumbers);
    const describe = (v: number) => (v === 0 ? 'sem letras para calcular' : `${v} — ${MEANINGS[v]}`);
    const out: { expression: string; soul: string; personality: string; lifePath?: string; note: string } = {
      expression: describe(n.expression), soul: describe(n.soul), personality: describe(n.personality), note: ENTERTAINMENT_NOTE,
    };
    if (birthDate) {
      const d = parseIsoDate(birthDate) as { year: number; month: number; day: number };
      out.lifePath = describe(lifePathNumber(d.year, d.month, d.day, keepMasterNumbers));
    }
    return out;
  },
  fields: {
    name: { label: 'Nome completo', placeholder: 'Maria da Silva' },
    birthDate: { label: 'Data de nascimento (opcional)', inputType: 'date', help: 'Para calcular o número do caminho de vida.' },
    keepMasterNumbers: { label: 'Manter os números mestres (11, 22 e 33)' },
  },
  outputLabels: { expression: 'Expressão (todas as letras)', soul: 'Alma (vogais)', personality: 'Personalidade (consoantes)', lifePath: 'Caminho de vida', note: 'Importante' },
  examples: [{ description: 'Nome simples', input: { name: 'Ana', keepMasterNumbers: true }, output: { expression: '7 — análise, introspecção e busca de conhecimento' } }],
  documentation:
    'Usa a tabela pitagórica (A=1, B=2 … I=9, J=1 …). Acentos são ignorados e o Y conta como consoante. A expressão soma todas as letras, a alma soma as vogais e a personalidade soma as consoantes, cada uma reduzida a um dígito (preservando 11, 22 e 33 se marcado). O caminho de vida soma dia, mês e ano de nascimento. ' + ENTERTAINMENT_NOTE,
});

// ---------- ascendente ----------

const SIGNS = ['Áries', 'Touro', 'Gêmeos', 'Câncer', 'Leão', 'Virgem', 'Libra', 'Escorpião', 'Sagitário', 'Capricórnio', 'Aquário', 'Peixes'];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export function julianDay(ms: number): number {
  return ms / 86_400_000 + 2440587.5;
}

/** Tempo sideral médio de Greenwich em graus. */
export function gmstDegrees(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - (t * t * t) / 38710000);
}

/** Longitude eclíptica do Ascendente (zodíaco tropical), em graus. */
export function ascendantLongitude(ms: number, latitude: number, longitudeEast: number): number {
  const jd = julianDay(ms);
  const t = (jd - 2451545.0) / 36525;
  const epsilon = rad(23.439291 - 0.0130042 * t);
  const ramc = rad(norm360(gmstDegrees(jd) + longitudeEast));
  const phi = rad(latitude);
  return norm360(deg(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon)))));
}

/** Longitude eclíptica do Sol (precisão de cerca de 0,01°, suficiente para o signo solar). */
export function sunLongitude(ms: number): number {
  const d = julianDay(ms) - 2451545.0;
  const g = rad(norm360(357.529 + 0.98560028 * d));
  const q = norm360(280.459 + 0.98564736 * d);
  return norm360(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

const describeLongitude = (lon: number) => `${SIGNS[Math.floor(lon / 30)]} ${roundTo(lon % 30, 1)}°`;

export const ascendantTool = defineTool({
  id: 'ascendente',
  name: 'Calculadora de Ascendente',
  description: 'Calcula o signo ascendente e o signo solar a partir da data, hora e local de nascimento',
  category: 'calculadoras',
  keywords: ['ascendente', 'signo', 'astrologia', 'mapa astral', 'signo solar', 'zodíaco', 'nascimento'],
  icon: '♈',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    dateTime: z.string().max(25).default(''),
    timeZone: z.string().max(64).default('America/Sao_Paulo'),
    latitude: z.number().finite().min(-66).max(66).default(-23.55),
    longitude: z.number().finite().min(-180).max(180).default(-46.63),
  }),
  outputSchema: z.object({ ascendant: z.string(), sun: z.string(), utc: z.string(), note: z.string() }),
  execute: ({ dateTime, timeZone, latitude, longitude }) => {
    if (!isValidTimeZone(timeZone)) throw new ToolError('Fuso horário desconhecido; use um nome IANA, como America/Sao_Paulo');
    const local = parseLocalDateTime(dateTime);
    if (!local) throw new ToolError('Informe a data e a hora de nascimento no formato AAAA-MM-DD HH:mm');
    const resolved = zonedTimeToUtc(local, timeZone);
    return {
      ascendant: describeLongitude(ascendantLongitude(resolved.ms, latitude, longitude)),
      sun: describeLongitude(sunLongitude(resolved.ms)),
      utc: new Date(resolved.ms).toISOString(),
      note: `Cálculo do zodíaco tropical com fórmulas astronômicas padrão (precisão de cerca de 1°); o ascendente muda de signo em cerca de 2 horas, então a hora exata importa. ${ENTERTAINMENT_NOTE}`,
    };
  },
  fields: {
    dateTime: { label: 'Data e hora de nascimento', placeholder: '1990-03-10 14:30', help: 'Hora local do nascimento, no fuso do local.' },
    timeZone: { label: 'Fuso horário (IANA)', placeholder: 'America/Sao_Paulo', help: 'O horário de verão da época é considerado automaticamente.' },
    latitude: { label: 'Latitude (graus)', help: 'Sul é negativo. São Paulo: -23,55. Rio de Janeiro: -22,91. Brasília: -15,79.' },
    longitude: { label: 'Longitude (graus)', help: 'Oeste é negativo. São Paulo: -46,63. Rio de Janeiro: -43,17. Brasília: -47,88.' },
  },
  outputLabels: { ascendant: 'Ascendente', sun: 'Signo solar', utc: 'Instante em UTC', note: 'Importante' },
  examples: [{ description: 'São Paulo, 10/03/1990 14:30', input: { dateTime: '1990-03-10 14:30', timeZone: 'America/Sao_Paulo', latitude: -23.55, longitude: -46.63 }, output: { utc: '1990-03-10T17:30:00.000Z' } }],
  documentation:
    'Precisa da hora e do local exatos de nascimento (latitude e longitude). O ascendente é o ponto da eclíptica que nascia no horizonte leste naquele momento; é calculado pelo tempo sideral local e pela obliquidade da eclíptica. Regiões polares (acima de 66° de latitude) não são suportadas. ' + ENTERTAINMENT_NOTE,
});

// ---------- nota do ENEM ----------

const AREAS = ['languages', 'humanities', 'nature', 'math', 'essay'] as const;
const AREA_LABELS = { languages: 'Linguagens e Códigos', humanities: 'Ciências Humanas', nature: 'Ciências da Natureza', math: 'Matemática', essay: 'Redação' };

export const enemTool = defineTool({
  id: 'nota-enem',
  name: 'Calculadora de Nota do ENEM',
  description: 'Calcula a média simples e a média ponderada das cinco notas do ENEM com os pesos do curso',
  category: 'calculadoras',
  keywords: ['enem', 'nota', 'média', 'sisu', 'peso', 'curso', 'redação', 'vestibular'],
  icon: '🎓',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    languages: z.number().min(0).max(1000).default(600),
    humanities: z.number().min(0).max(1000).default(600),
    nature: z.number().min(0).max(1000).default(600),
    math: z.number().min(0).max(1000).default(600),
    essay: z.number().min(0).max(1000).default(600),
    weightLanguages: z.number().min(0).max(10).default(1),
    weightHumanities: z.number().min(0).max(10).default(1),
    weightNature: z.number().min(0).max(10).default(1),
    weightMath: z.number().min(0).max(10).default(1),
    weightEssay: z.number().min(0).max(10).default(1),
  }),
  outputSchema: z.object({ simpleAverage: z.number(), weightedAverage: z.number(), note: z.string() }),
  execute: (v) => {
    const grades = AREAS.map((a) => v[a]);
    const weights = [v.weightLanguages, v.weightHumanities, v.weightNature, v.weightMath, v.weightEssay];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) throw new ToolError('A soma dos pesos não pode ser zero');
    return {
      simpleAverage: roundTo(grades.reduce((a, b) => a + b, 0) / 5, 2),
      weightedAverage: roundTo(grades.reduce((a, g, i) => a + g * (weights[i] as number), 0) / totalWeight, 2),
      note: 'Esta ferramenta calcula as médias a partir das notas que você já recebeu. Ela não calcula a nota por TRI (Teoria de Resposta ao Item) a partir dos acertos, pois isso depende dos parâmetros dos itens, que só o INEP conhece.',
    };
  },
  fields: {
    ...Object.fromEntries(AREAS.map((a) => [a, { label: `${AREA_LABELS[a]} (nota)` }])),
    weightLanguages: { label: 'Peso de Linguagens', help: 'Os pesos estão no edital do curso e da instituição (SiSU, por exemplo).' },
    weightHumanities: { label: 'Peso de Ciências Humanas' }, weightNature: { label: 'Peso de Ciências da Natureza' },
    weightMath: { label: 'Peso de Matemática' }, weightEssay: { label: 'Peso de Redação' },
  },
  outputLabels: { simpleAverage: 'Média simples', weightedAverage: 'Média ponderada pelos pesos do curso', note: 'Importante' },
  examples: [{ description: 'Notas com pesos de curso', input: { languages: 600, humanities: 650, nature: 700, math: 800, essay: 900, weightLanguages: 2, weightHumanities: 1, weightNature: 1, weightMath: 3, weightEssay: 3 }, output: { simpleAverage: 730, weightedAverage: 765 } }],
  documentation:
    'Média simples = soma das cinco notas ÷ 5. Média ponderada = soma de cada nota × seu peso ÷ soma dos pesos. As notas vão de 0 a 1000. A nota de corte e as regras de classificação mudam por edital; confira no processo seletivo desejado.',
});
