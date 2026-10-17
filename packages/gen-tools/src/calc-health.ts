import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { roundTo } from './calc-math.js';
import { today } from './calc-daily.js';
import { parseIsoDate, type CalendarDate } from './dates.js';

const pos = (max = 1e9) => z.number().finite().positive().max(max);
const sexSchema = z.enum(['female', 'male']);
const SEX_LABELS = { female: 'Feminino', male: 'Masculino' };

const HEALTH_NOTE =
  'Estimativa informativa, que não substitui avaliação, diagnóstico ou orientação de médico ou nutricionista.';

const utcOf = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);
const fromUtc = (ms: number): CalendarDate => {
  const x = new Date(ms);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
};
const pad = (n: number) => String(n).padStart(2, '0');
const br = (d: CalendarDate) => `${pad(d.day)}/${pad(d.month)}/${d.year}`;
const plusDays = (d: CalendarDate, n: number) => fromUtc(utcOf(d) + n * 86_400_000);
const diffDays = (a: CalendarDate, b: CalendarDate) => Math.round((utcOf(b) - utcOf(a)) / 86_400_000);

const isoDateField = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

// ---------- IMC ----------

export function bmiCategory(bmi: number): string {
  if (bmi < 16) return 'Magreza grave';
  if (bmi < 17) return 'Magreza moderada';
  if (bmi < 18.5) return 'Magreza leve';
  if (bmi < 25) return 'Peso normal';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

export const bmiTool = defineTool({
  id: 'imc',
  name: 'Calculadora de IMC',
  description: 'Calcula o Índice de Massa Corporal e a faixa de peso saudável para a sua altura',
  category: 'calculadoras',
  keywords: ['imc', 'índice de massa corporal', 'peso', 'altura', 'obesidade', 'sobrepeso', 'saúde'],
  icon: '⚖️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ weightKg: pos(700).default(70), heightCm: z.number().finite().min(50).max(272).default(170) }),
  outputSchema: z.object({ bmi: z.number(), category: z.string(), healthyRange: z.string(), note: z.string() }),
  execute: ({ weightKg, heightCm }) => {
    const m = heightCm / 100;
    const bmi = weightKg / (m * m);
    return {
      bmi: roundTo(bmi, 1), category: bmiCategory(bmi),
      healthyRange: `${roundTo(18.5 * m * m, 1)} kg a ${roundTo(24.9 * m * m, 1)} kg`,
      note: `A classificação da OMS vale para adultos. O IMC não distingue músculo de gordura. ${HEALTH_NOTE}`,
    };
  },
  fields: { weightKg: { label: 'Peso (kg)' }, heightCm: { label: 'Altura (cm)' } },
  outputLabels: { bmi: 'IMC (kg/m²)', category: 'Classificação (OMS)', healthyRange: 'Peso na faixa normal para sua altura', note: 'Importante' },
  examples: [{ description: '70 kg e 1,70 m', input: { weightKg: 70, heightCm: 170 }, output: { bmi: 24.2, category: 'Peso normal' } }],
  documentation:
    'IMC = peso ÷ altura². Faixas da OMS para adultos: abaixo de 18,5 magreza; 18,5 a 24,9 peso normal; 25 a 29,9 sobrepeso; 30 ou mais obesidade (graus I, II e III a partir de 30, 35 e 40). Não se aplica a crianças, adolescentes, gestantes e idosos da mesma forma, e não mede composição corporal.',
});

// ---------- TMB e gasto calórico ----------

export const ACTIVITY_FACTORS = {
  sedentary: { factor: 1.2, label: 'Sedentário (pouco ou nenhum exercício)' },
  light: { factor: 1.375, label: 'Leve (1 a 3 dias de exercício por semana)' },
  moderate: { factor: 1.55, label: 'Moderado (3 a 5 dias por semana)' },
  intense: { factor: 1.725, label: 'Intenso (6 a 7 dias por semana)' },
  extreme: { factor: 1.9, label: 'Muito intenso (treino pesado diário ou trabalho físico)' },
} as const;
type Activity = keyof typeof ACTIVITY_FACTORS;

export function mifflinStJeor(sex: 'female' | 'male', weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Equação de Harris-Benedict revisada por Roza e Shizgal (1984). */
export function harrisBenedict(sex: 'female' | 'male', weightKg: number, heightCm: number, age: number): number {
  return sex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
}

const bodyInput = {
  sex: sexSchema.default('female'),
  weightKg: pos(700).default(70),
  heightCm: z.number().finite().min(50).max(272).default(170),
  age: z.number().finite().min(10).max(120).default(30),
};
const bodyFields = {
  sex: { label: 'Sexo (para a equação)', optionLabels: SEX_LABELS },
  weightKg: { label: 'Peso (kg)' },
  heightCm: { label: 'Altura (cm)' },
  age: { label: 'Idade (anos)' },
};

export const bmrTool = defineTool({
  id: 'tmb',
  name: 'Calculadora de TMB (Taxa Metabólica Basal)',
  description: 'Calcula a energia que o corpo gasta em repouso e o gasto diário total conforme o nível de atividade',
  category: 'calculadoras',
  keywords: ['tmb', 'metabolismo basal', 'gasto energético', 'calorias', 'mifflin', 'harris-benedict', 'tdee'],
  icon: '🔥',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ ...bodyInput, activity: z.enum(Object.keys(ACTIVITY_FACTORS) as [Activity, ...Activity[]]).default('light') }),
  outputSchema: z.object({ bmrMifflin: z.number(), bmrHarrisBenedict: z.number(), dailyNeed: z.number(), note: z.string() }),
  execute: ({ sex, weightKg, heightCm, age, activity }) => {
    const mifflin = mifflinStJeor(sex, weightKg, heightCm, age);
    return {
      bmrMifflin: Math.round(mifflin), bmrHarrisBenedict: Math.round(harrisBenedict(sex, weightKg, heightCm, age)),
      dailyNeed: Math.round(mifflin * ACTIVITY_FACTORS[activity].factor), note: HEALTH_NOTE,
    };
  },
  fields: { ...bodyFields, activity: { label: 'Nível de atividade', optionLabels: Object.fromEntries(Object.entries(ACTIVITY_FACTORS).map(([k, v]) => [k, v.label])) } },
  outputLabels: { bmrMifflin: 'TMB — Mifflin-St Jeor (kcal/dia)', bmrHarrisBenedict: 'TMB — Harris-Benedict revisada (kcal/dia)', dailyNeed: 'Gasto diário estimado (kcal/dia)', note: 'Importante' },
  examples: [{ description: 'Mulher, 70 kg, 170 cm, 30 anos', input: { sex: 'female', weightKg: 70, heightCm: 170, age: 30, activity: 'sedentary' }, output: { bmrMifflin: 1452, dailyNeed: 1742 } }],
  documentation:
    'A TMB é a energia mínima para manter o corpo em repouso. Mifflin-St Jeor (10 × peso + 6,25 × altura − 5 × idade, +5 para homens ou −161 para mulheres) é a equação considerada mais precisa para a maioria dos adultos; Harris-Benedict revisada (1984) é mostrada para comparação. O gasto diário multiplica a TMB pelo fator de atividade (1,2 a 1,9). Os valores são médias populacionais e podem diferir em 10% ou mais do seu metabolismo real.',
});

const MET_PRESETS: Record<string, { met: number; label: string }> = {
  walking: { met: 3.5, label: 'Caminhada moderada (~5 km/h): 3,5 MET' },
  running8: { met: 8.3, label: 'Corrida a 8 km/h: 8,3 MET' },
  running10: { met: 9.8, label: 'Corrida a 10 km/h: 9,8 MET' },
  cycling: { met: 8, label: 'Bicicleta, ritmo moderado (19–22 km/h): 8,0 MET' },
  swimming: { met: 5.8, label: 'Natação em ritmo leve a moderado: 5,8 MET' },
  weights: { met: 3.5, label: 'Musculação, esforço moderado: 3,5 MET' },
  yoga: { met: 2.5, label: 'Ioga (hatha): 2,5 MET' },
};

export const caloriesTool = defineTool({
  id: 'calorias',
  name: 'Calculadora de Calorias',
  description: 'Estima a meta diária de calorias para o seu objetivo e as calorias gastas em uma atividade física',
  category: 'calculadoras',
  keywords: ['calorias', 'kcal', 'emagrecer', 'ganhar peso', 'exercício', 'met', 'dieta', 'gasto calórico'],
  icon: '🍎',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['daily', 'activity']).default('daily'),
    ...bodyInput,
    activity: z.enum(Object.keys(ACTIVITY_FACTORS) as [Activity, ...Activity[]]).default('light'),
    goal: z.enum(['lose', 'maintain', 'gain']).default('maintain'),
    exercise: z.enum(Object.keys(MET_PRESETS) as [string, ...string[]]).default('walking'),
    minutes: pos(1440).default(30),
  }),
  outputSchema: z.object({
    maintenance: z.number().optional(), target: z.number().optional(), burned: z.number().optional(), warning: z.string().optional(), note: z.string(),
  }),
  execute: ({ mode, sex, weightKg, heightCm, age, activity, goal, exercise, minutes }) => {
    if (mode === 'activity') {
      const met = (MET_PRESETS[exercise] as { met: number }).met;
      return { burned: Math.round(met * weightKg * (minutes / 60)), note: `Calorias = MET × peso (kg) × horas. ${HEALTH_NOTE}` };
    }
    const maintenance = mifflinStJeor(sex, weightKg, heightCm, age) * ACTIVITY_FACTORS[activity].factor;
    const delta = goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0;
    const floor = sex === 'male' ? 1500 : 1200;
    let target = maintenance + delta;
    let warning: string | undefined;
    if (target < floor) {
      warning = `A meta calculada ficaria abaixo de ${floor} kcal, mínimo geralmente considerado seguro sem acompanhamento; o valor foi limitado a ${floor}.`;
      target = floor;
    }
    return { maintenance: Math.round(maintenance), target: Math.round(target), ...(warning ? { warning } : {}), note: HEALTH_NOTE };
  },
  fields: {
    mode: { label: 'Calcular', optionLabels: { daily: 'Meta diária de calorias', activity: 'Calorias gastas em um exercício' } },
    ...bodyFields,
    activity: { label: 'Nível de atividade (meta diária)', optionLabels: Object.fromEntries(Object.entries(ACTIVITY_FACTORS).map(([k, v]) => [k, v.label])) },
    goal: { label: 'Objetivo (meta diária)', optionLabels: { lose: 'Perder peso (−500 kcal, cerca de 0,5 kg por semana)', maintain: 'Manter o peso', gain: 'Ganhar peso (+300 kcal)' } },
    exercise: { label: 'Exercício (calorias gastas)', optionLabels: Object.fromEntries(Object.entries(MET_PRESETS).map(([k, v]) => [k, v.label])) },
    minutes: { label: 'Duração do exercício (minutos)' },
  },
  outputLabels: { maintenance: 'Para manter o peso (kcal/dia)', target: 'Meta para o seu objetivo (kcal/dia)', burned: 'Calorias gastas (kcal)', warning: 'Atenção', note: 'Importante' },
  examples: [{ description: '30 min de corrida a 8 km/h, 70 kg', input: { mode: 'activity', sex: 'female', weightKg: 70, heightCm: 170, age: 30, activity: 'light', goal: 'maintain', exercise: 'running8', minutes: 30 }, output: { burned: 291 } }],
  documentation:
    'A meta diária parte da TMB (Mifflin-St Jeor) multiplicada pelo fator de atividade; para emagrecer subtrai 500 kcal (cerca de 0,5 kg por semana) e para ganhar soma 300 kcal. O gasto por exercício usa valores MET do Compêndio de Atividades Físicas: kcal = MET × peso × horas. São médias, e o gasto real varia com intensidade, condicionamento e composição corporal. Dietas muito restritivas devem ter acompanhamento profissional.',
});

// ---------- peso ideal ----------

export function idealWeights(sex: 'female' | 'male', heightCm: number) {
  const inchesOver60 = heightCm / 2.54 - 60;
  const f = sex === 'male';
  return {
    devine: (f ? 50 : 45.5) + 2.3 * inchesOver60,
    robinson: (f ? 52 : 49) + (f ? 1.9 : 1.7) * inchesOver60,
    miller: (f ? 56.2 : 53.1) + (f ? 1.41 : 1.36) * inchesOver60,
    hamwi: (f ? 48 : 45.5) + (f ? 2.7 : 2.2) * inchesOver60,
  };
}

export const idealWeightTool = defineTool({
  id: 'peso-ideal',
  name: 'Calculadora de Peso Ideal',
  description: 'Estima o peso ideal por quatro fórmulas clássicas e pela faixa de IMC saudável',
  category: 'calculadoras',
  keywords: ['peso ideal', 'devine', 'robinson', 'miller', 'hamwi', 'altura', 'faixa saudável'],
  icon: '🎯',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ sex: sexSchema.default('female'), heightCm: z.number().finite().min(120).max(250).default(170) }),
  outputSchema: z.object({ devine: z.number(), robinson: z.number(), miller: z.number(), hamwi: z.number(), average: z.number(), bmiRange: z.string(), note: z.string() }),
  execute: ({ sex, heightCm }) => {
    const w = idealWeights(sex, heightCm);
    const avg = (w.devine + w.robinson + w.miller + w.hamwi) / 4;
    const m = heightCm / 100;
    return {
      devine: roundTo(w.devine, 1), robinson: roundTo(w.robinson, 1), miller: roundTo(w.miller, 1), hamwi: roundTo(w.hamwi, 1), average: roundTo(avg, 1),
      bmiRange: `${roundTo(18.5 * m * m, 1)} a ${roundTo(24.9 * m * m, 1)} kg`,
      note: heightCm < 152.4 ? `As fórmulas foram criadas para altura a partir de 1,52 m (5 pés); abaixo disso o resultado é menos confiável. ${HEALTH_NOTE}` : HEALTH_NOTE,
    };
  },
  fields: { sex: { label: 'Sexo (para a fórmula)', optionLabels: SEX_LABELS }, heightCm: { label: 'Altura (cm)' } },
  outputLabels: { devine: 'Fórmula de Devine (kg)', robinson: 'Fórmula de Robinson (kg)', miller: 'Fórmula de Miller (kg)', hamwi: 'Fórmula de Hamwi (kg)', average: 'Média das fórmulas (kg)', bmiRange: 'Faixa de IMC 18,5–24,9 (kg)', note: 'Importante' },
  examples: [{ description: 'Homem de 1,80 m', input: { sex: 'male', heightCm: 180 }, output: { devine: 75 } }],
  documentation:
    'Cada fórmula soma um valor por polegada acima de 5 pés (152,4 cm). Foram desenvolvidas para estimar doses de medicamentos e dão resultados diferentes entre si, por isso a faixa de IMC saudável é uma referência mais útil. "Peso ideal" é um conceito aproximado: não considera idade, massa muscular nem estrutura óssea.',
});

// ---------- macronutrientes ----------

const MACRO_PRESETS = {
  balanced: { carbs: 50, protein: 20, fat: 30, label: 'Equilibrada (50% carboidratos, 20% proteínas, 30% gorduras)' },
  lowCarb: { carbs: 25, protein: 35, fat: 40, label: 'Baixo carboidrato (25 / 35 / 40)' },
  highProtein: { carbs: 40, protein: 30, fat: 30, label: 'Alta proteína (40 / 30 / 30)' },
  endurance: { carbs: 60, protein: 15, fat: 25, label: 'Resistência (60 / 15 / 25)' },
  custom: { carbs: 0, protein: 0, fat: 0, label: 'Personalizada (informe os percentuais abaixo)' },
} as const;

export const macrosTool = defineTool({
  id: 'macronutrientes',
  name: 'Calculadora de Macronutrientes',
  description: 'Distribui as calorias do dia em gramas de carboidratos, proteínas e gorduras',
  category: 'calculadoras',
  keywords: ['macronutrientes', 'macros', 'proteína', 'carboidrato', 'gordura', 'dieta', 'calorias', 'gramas'],
  icon: '🥗',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    calories: pos(20000).default(2000),
    preset: z.enum(Object.keys(MACRO_PRESETS) as [keyof typeof MACRO_PRESETS, ...(keyof typeof MACRO_PRESETS)[]]).default('balanced'),
    carbsPercent: z.number().min(0).max(100).default(50),
    proteinPercent: z.number().min(0).max(100).default(20),
    fatPercent: z.number().min(0).max(100).default(30),
  }),
  outputSchema: z.object({ carbsGrams: z.number(), proteinGrams: z.number(), fatGrams: z.number(), split: z.string() }),
  execute: ({ calories, preset, carbsPercent, proteinPercent, fatPercent }) => {
    const p = preset === 'custom' ? { carbs: carbsPercent, protein: proteinPercent, fat: fatPercent } : MACRO_PRESETS[preset];
    if (Math.abs(p.carbs + p.protein + p.fat - 100) > 0.01) throw new ToolError(`Os percentuais somam ${p.carbs + p.protein + p.fat}%; devem somar 100%`);
    return {
      carbsGrams: Math.round((calories * p.carbs) / 100 / 4), proteinGrams: Math.round((calories * p.protein) / 100 / 4), fatGrams: Math.round((calories * p.fat) / 100 / 9),
      split: `${p.carbs}% carboidratos, ${p.protein}% proteínas, ${p.fat}% gorduras`,
    };
  },
  fields: {
    calories: { label: 'Calorias do dia (kcal)' },
    preset: { label: 'Distribuição', optionLabels: Object.fromEntries(Object.entries(MACRO_PRESETS).map(([k, v]) => [k, v.label])) },
    carbsPercent: { label: 'Carboidratos (%) — personalizada' }, proteinPercent: { label: 'Proteínas (%) — personalizada' }, fatPercent: { label: 'Gorduras (%) — personalizada' },
  },
  outputLabels: { carbsGrams: 'Carboidratos (g)', proteinGrams: 'Proteínas (g)', fatGrams: 'Gorduras (g)', split: 'Distribuição' },
  examples: [{ description: '2.000 kcal, distribuição equilibrada', input: { calories: 2000, preset: 'balanced', carbsPercent: 50, proteinPercent: 20, fatPercent: 30 }, output: { carbsGrams: 250, proteinGrams: 100, fatGrams: 67 } }],
  documentation:
    'Usa os valores energéticos de Atwater: 4 kcal por grama de carboidrato e de proteína e 9 kcal por grama de gordura. As distribuições são exemplos de referência, não prescrição: necessidades variam com objetivo, saúde e rotina. Consulte nutricionista para um plano individual.',
});

// ---------- gravidez ----------

export const pregnancyTool = defineTool({
  id: 'gravidez',
  name: 'Calculadora de Gravidez',
  description: 'Estima a data provável do parto e a idade gestacional a partir da data da última menstruação',
  category: 'calculadoras',
  keywords: ['gravidez', 'gestação', 'dpp', 'data provável do parto', 'semanas', 'trimestre', 'naegele', 'dum'],
  icon: '🤰',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    lastPeriod: isoDateField('Data da última menstruação'),
    cycleLength: z.number().int().min(21).max(45).default(28),
    referenceDate: isoDateField('Data de referência').optional(),
  }),
  outputSchema: z.object({ dueDate: z.string(), gestationalAge: z.string(), trimester: z.string(), daysUntilDue: z.number(), firstTrimesterEnds: z.string(), note: z.string() }),
  execute: ({ lastPeriod, cycleLength, referenceDate }) => {
    const dum = parseIsoDate(lastPeriod) as CalendarDate;
    const ref = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    const due = plusDays(dum, 280 + (cycleLength - 28));
    const days = diffDays(dum, ref);
    if (days < 0) throw new ToolError('A data de referência é anterior à última menstruação');
    if (days > 310) throw new ToolError('Mais de 44 semanas desde a última menstruação; confira as datas');
    const effective = days - (cycleLength - 28);
    const weeks = Math.floor(effective / 7);
    return {
      dueDate: br(due),
      gestationalAge: effective < 0 ? 'ainda sem gestação estimada' : `${weeks} semanas e ${effective % 7} dias`,
      trimester: effective < 0 ? '—' : weeks < 14 ? '1º trimestre (até a 13ª semana e 6 dias)' : weeks < 28 ? '2º trimestre (14ª a 27ª semana)' : '3º trimestre (a partir da 28ª semana)',
      daysUntilDue: diffDays(ref, due),
      firstTrimesterEnds: br(plusDays(dum, 14 * 7 - 1 + (cycleLength - 28))),
      note: `Regra de Naegele: DUM + 280 dias, ajustada pelo tamanho do seu ciclo. A data provável do parto é uma estimativa (poucos bebês nascem exatamente nela). A ultrassonografia do primeiro trimestre é mais precisa. ${HEALTH_NOTE}`,
    };
  },
  fields: {
    lastPeriod: { label: 'Primeiro dia da última menstruação', inputType: 'date' },
    cycleLength: { label: 'Duração média do ciclo (dias)', help: '28 é o padrão; ciclos mais longos ou curtos deslocam a data.' },
    referenceDate: { label: 'Calcular a idade gestacional em (opcional)', inputType: 'date', help: 'Se vazio, usa a data de hoje.' },
  },
  outputLabels: { dueDate: 'Data provável do parto', gestationalAge: 'Idade gestacional', trimester: 'Trimestre', daysUntilDue: 'Dias até a data provável', firstTrimesterEnds: 'Fim do 1º trimestre (aprox.)', note: 'Importante' },
  examples: [{ description: 'DUM em 01/01/2024, ciclo de 28 dias', input: { lastPeriod: '2024-01-01', cycleLength: 28, referenceDate: '2024-03-11' }, output: { dueDate: '07/10/2024', gestationalAge: '10 semanas e 0 dias' } }],
  documentation:
    'Idade gestacional é contada a partir do primeiro dia da última menstruação (DUM), com 40 semanas (280 dias) de duração. Para ciclos diferentes de 28 dias, a data é deslocada pela diferença. Serve como referência; o acompanhamento pré-natal define as datas clínicas.',
});

// ---------- ovulação e ciclo menstrual ----------

const cycleInput = {
  lastPeriod: isoDateField('Data da última menstruação'),
  cycleLength: z.number().int().min(21).max(45).default(28),
  lutealPhase: z.number().int().min(10).max(16).default(14),
  referenceDate: isoDateField('Data de referência').optional(),
};
const cycleFields = {
  lastPeriod: { label: 'Primeiro dia da última menstruação', inputType: 'date' as const },
  cycleLength: { label: 'Duração média do ciclo (dias)', help: 'Conte do primeiro dia de uma menstruação ao dia anterior à próxima.' },
  lutealPhase: { label: 'Fase lútea (dias)', help: 'Do fim da ovulação à menstruação; costuma ser 14 dias.' },
  referenceDate: { label: 'Considerar a partir de (opcional)', inputType: 'date' as const, help: 'Se vazio, usa a data de hoje.' },
};

export function cyclePrediction(lastPeriod: CalendarDate, cycleLength: number, lutealPhase: number, cycle = 0) {
  const start = plusDays(lastPeriod, cycleLength * cycle);
  const ovulation = plusDays(start, cycleLength - lutealPhase);
  return { start, ovulation, fertileStart: plusDays(ovulation, -5), fertileEnd: plusDays(ovulation, 1), nextStart: plusDays(start, cycleLength) };
}

export const ovulationTool = defineTool({
  id: 'ovulacao',
  name: 'Calculadora de Ovulação e Período Fértil',
  description: 'Estima o dia da ovulação e a janela fértil dos próximos ciclos',
  category: 'calculadoras',
  keywords: ['ovulação', 'período fértil', 'janela fértil', 'engravidar', 'ciclo', 'menstruação', 'fertilidade'],
  icon: '🌸',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object(cycleInput),
  outputSchema: z.object({ nextOvulation: z.string(), fertileWindow: z.string(), nextPeriod: z.string(), upcoming: z.array(z.string()), note: z.string() }),
  execute: ({ lastPeriod, cycleLength, lutealPhase, referenceDate }) => {
    const start = parseIsoDate(lastPeriod) as CalendarDate;
    // Primeiro ciclo cuja janela fértil ainda não terminou na data de referência.
    const now = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    let c = 0;
    while (utcOf(cyclePrediction(start, cycleLength, lutealPhase, c).fertileEnd) < utcOf(now) && c < 200) c++;
    const p = cyclePrediction(start, cycleLength, lutealPhase, c);
    const upcoming = [0, 1, 2].map((i) => {
      const q = cyclePrediction(start, cycleLength, lutealPhase, c + i);
      return `Ovulação em ${br(q.ovulation)} (janela fértil de ${br(q.fertileStart)} a ${br(q.fertileEnd)})`;
    });
    return {
      nextOvulation: br(p.ovulation), fertileWindow: `${br(p.fertileStart)} a ${br(p.fertileEnd)}`, nextPeriod: br(p.nextStart), upcoming,
      note: `Estimativa por calendário, que assume ciclos regulares. Não é método contraceptivo nem garante gravidez. ${HEALTH_NOTE}`,
    };
  },
  fields: cycleFields,
  outputLabels: { nextOvulation: 'Próxima ovulação estimada', fertileWindow: 'Janela fértil', nextPeriod: 'Próxima menstruação', upcoming: 'Próximos ciclos', note: 'Importante' },
  examples: [{ description: 'Ciclo de 28 dias iniciado em 01/01/2024', input: { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, referenceDate: '2024-01-02' }, output: { nextOvulation: '15/01/2024', fertileWindow: '10/01/2024 a 16/01/2024', nextPeriod: '29/01/2024' } }],
  documentation:
    'A ovulação costuma ocorrer cerca de 14 dias antes da próxima menstruação (fase lútea). A janela fértil vai de 5 dias antes a 1 dia depois da ovulação, pois os espermatozoides sobrevivem alguns dias. Ciclos irregulares, amamentação, estresse e condições de saúde tornam o cálculo impreciso; o método do calendário não deve ser usado como contracepção.',
});

export const menstrualCycleTool = defineTool({
  id: 'ciclo-menstrual',
  name: 'Calculadora de Ciclo Menstrual',
  description: 'Prevê as próximas menstruações e mostra as fases do ciclo atual',
  category: 'calculadoras',
  keywords: ['ciclo menstrual', 'menstruação', 'período', 'tpm', 'fases do ciclo', 'previsão', 'calendário'],
  icon: '📅',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ ...cycleInput, periodLength: z.number().int().min(1).max(14).default(5), cycles: z.number().int().min(1).max(12).default(6) }),
  outputSchema: z.object({ nextPeriod: z.string(), phases: z.array(z.string()), upcomingPeriods: z.array(z.string()), note: z.string() }),
  execute: ({ lastPeriod, cycleLength, lutealPhase, periodLength, cycles, referenceDate }) => {
    const start = parseIsoDate(lastPeriod) as CalendarDate;
    const now = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    let c = 0;
    while (utcOf(plusDays(start, cycleLength * (c + 1))) <= utcOf(now) && c < 400) c++;
    const cur = cyclePrediction(start, cycleLength, lutealPhase, c);
    const phases = [
      `Menstrual: ${br(cur.start)} a ${br(plusDays(cur.start, periodLength - 1))}`,
      `Folicular: ${br(plusDays(cur.start, periodLength))} a ${br(plusDays(cur.ovulation, -1))}`,
      `Ovulação (estimada): ${br(cur.ovulation)}`,
      `Lútea: ${br(plusDays(cur.ovulation, 1))} a ${br(plusDays(cur.nextStart, -1))}`,
    ];
    const upcoming = Array.from({ length: cycles }, (_, i) => {
      const s = plusDays(cur.nextStart, cycleLength * i);
      return `${br(s)} a ${br(plusDays(s, periodLength - 1))}`;
    });
    return { nextPeriod: br(cur.nextStart), phases, upcomingPeriods: upcoming, note: `Previsão por média, válida para ciclos regulares. ${HEALTH_NOTE}` };
  },
  fields: { ...cycleFields, periodLength: { label: 'Duração da menstruação (dias)' }, cycles: { label: 'Quantos ciclos prever' } },
  outputLabels: { nextPeriod: 'Próxima menstruação', phases: 'Fases do ciclo atual', upcomingPeriods: 'Próximas menstruações', note: 'Importante' },
  examples: [{ description: 'Ciclo de 28 dias', input: { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, periodLength: 5, cycles: 3, referenceDate: '2024-01-10' }, output: { nextPeriod: '29/01/2024' } }],
  documentation:
    'Projeta as próximas menstruações somando a duração média do ciclo e divide o ciclo atual em fases (menstrual, folicular, ovulação e lútea). Ciclos variam de mês a mês; se estiverem frequentemente irregulares, muito longos, muito curtos ou dolorosos, procure um profissional de saúde.',
});

// ---------- idade do cachorro ----------

export function dogAgeInHumanYears(dogYears: number, method: 'epigenetic' | 'size', size: 'small' | 'medium' | 'large'): number {
  if (method === 'epigenetic') return 16 * Math.log(dogYears) + 31;
  const perYear = { small: 4, medium: 5, large: 6 }[size];
  if (dogYears <= 1) return 15 * dogYears;
  if (dogYears <= 2) return 15 + 9 * (dogYears - 1);
  return 24 + perYear * (dogYears - 2);
}

export const dogAgeTool = defineTool({
  id: 'idade-cachorro',
  name: 'Calculadora de Idade do Cachorro',
  description: 'Converte a idade do cachorro em idade humana pela regra por porte e pela fórmula do relógio epigenético',
  category: 'calculadoras',
  keywords: ['idade do cachorro', 'idade canina', 'anos de cachorro', 'cão', 'pet', 'idade humana', 'veterinário'],
  icon: '🐕',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    dogYears: z.number().finite().min(0.2).max(30).default(5),
    size: z.enum(['small', 'medium', 'large']).default('medium'),
  }),
  outputSchema: z.object({ bySize: z.number(), epigenetic: z.number(), lifeStage: z.string(), note: z.string() }),
  execute: ({ dogYears, size }) => ({
    bySize: roundTo(dogAgeInHumanYears(dogYears, 'size', size), 1),
    epigenetic: roundTo(dogAgeInHumanYears(dogYears, 'epigenetic', size), 1),
    lifeStage: dogYears < 1 ? 'Filhote' : dogYears < 2 ? 'Jovem' : dogYears < (size === 'large' ? 6 : 7) ? 'Adulto' : dogYears < (size === 'large' ? 9 : 11) ? 'Maduro/sênior' : 'Idoso',
    note: 'Conversões são aproximações; a expectativa de vida e o envelhecimento variam por raça e saúde. Fale com o veterinário sobre os cuidados adequados à idade do seu cão.',
  }),
  fields: {
    dogYears: { label: 'Idade do cachorro (anos)', help: 'Use decimais para meses: 0,5 = 6 meses. Mínimo 0,2 (cerca de 2,5 meses).' },
    size: { label: 'Porte', optionLabels: { small: 'Pequeno (até 9 kg)', medium: 'Médio (9 a 23 kg)', large: 'Grande (acima de 23 kg)' } },
  },
  outputLabels: { bySize: 'Idade humana — regra por porte', epigenetic: 'Idade humana — relógio epigenético', lifeStage: 'Fase da vida', note: 'Importante' },
  examples: [{ description: 'Cão médio de 5 anos', input: { dogYears: 5, size: 'medium' }, output: { bySize: 39, epigenetic: 56.8 } }],
  documentation:
    'A regra tradicional por porte considera 15 anos humanos no primeiro ano, mais 9 no segundo e depois 4, 5 ou 6 por ano (cães pequenos, médios e grandes). A fórmula do relógio epigenético (Wang et al., 2020, Cell Systems), idade humana = 16 × ln(idade canina) + 31, compara padrões de metilação do DNA de cães labradores e humanos; vale melhor para cães adultos e foi derivada de uma raça. A idade "de cachorro" não é um fato biológico exato.',
});
