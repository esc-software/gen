import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { round2, roundTo } from './calc-math.js';
import { addMonthsClamped, today } from './calc-daily.js';
import { parseIsoDate, type CalendarDate } from './dates.js';
import { calcInss, calcIrrf } from './payroll.js';
import {
  MINIMUM_WAGE, RETIREMENT, SIMPLES_ANEXO_III, SIMPLES_ANEXO_V, SIMPLES_SOURCE, SUPPORTED_IR_YEARS, inssTable, minimumWage, type SimplesBracket,
} from './payroll-data.js';

const LEGAL_NOTE =
  'Cálculo informativo conforme as regras e tabelas indicadas na vigência escolhida; não substitui o cálculo oficial do contador ou do departamento pessoal nem convenções coletivas.';

const money = (max = 1e9) => z.number().finite().min(0).max(max);
const isoDateField = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });
const latestYear = Math.max(...SUPPORTED_IR_YEARS);
const payrollYear = z.coerce.number().int().refine((y) => SUPPORTED_IR_YEARS.includes(y), { message: `Competências disponíveis: ${SUPPORTED_IR_YEARS.join(', ')}` }).default(latestYear);

const utc = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);
const fromUtc = (ms: number): CalendarDate => {
  const x = new Date(ms);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
};
const plusDays = (d: CalendarDate, n: number) => fromUtc(utc(d) + n * 86_400_000);
const pad = (n: number) => String(n).padStart(2, '0');
const br = (d: CalendarDate) => `${pad(d.day)}/${pad(d.month)}/${d.year}`;
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- rescisão ----------

export type TerminationType = 'without_cause' | 'resignation' | 'cause' | 'agreement' | 'fixed_term';
export type NoticeKind = 'worked' | 'indemnified';

export interface TerminationInput {
  salary: number;
  averageVariable: number;
  admission: CalendarDate;
  termination: CalendarDate;
  type: TerminationType;
  notice: NoticeKind;
  overdueVacationPeriods: number;
  fgtsBalance: number;
  dependents: number;
  deduction: 'auto' | 'legal' | 'simplified';
  year: number;
  domestic: boolean;
  compensatoryFundBalance?: number | undefined;
}

export interface TerminationLine {
  label: string;
  value: number;
  kind: 'earning' | 'deduction';
}

export interface TerminationResult {
  lines: TerminationLine[];
  gross: number;
  deductions: number;
  net: number;
  noticeDays: number;
  fgtsPenalty: number;
  fgtsWithdrawable: number;
  compensatoryFund: number;
}

/** Anos completos de serviço entre duas datas. */
export function fullYears(from: CalendarDate, to: CalendarDate): number {
  let years = to.year - from.year;
  if (to.month < from.month || (to.month === from.month && to.day < from.day)) years--;
  return Math.max(0, years);
}

/** Aviso prévio proporcional: 30 dias + 3 por ano completo, até 90 (Lei 12.506/2011). */
export function noticeDaysFor(years: number): number {
  return Math.min(30 + 3 * years, 90);
}

/** Meses para verbas proporcionais: o mês com 15 dias ou mais de trabalho conta como mês inteiro. */
export function monthsBetweenCounting15(from: CalendarDate, to: CalendarDate): number {
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  let anchor = addMonthsClamped(from, months);
  while (months > 0 && utc(anchor) > utc(to)) {
    months--;
    anchor = addMonthsClamped(from, months);
  }
  const rest = Math.round((utc(to) - utc(anchor)) / 86_400_000) + 1;
  return months + (rest >= 15 ? 1 : 0);
}

export function calcTermination(i: TerminationInput): TerminationResult {
  if (utc(i.termination) < utc(i.admission)) throw new ToolError('A data de desligamento é anterior à admissão');
  if (i.domestic && i.type === 'agreement') throw new ToolError('Para empregado doméstico, o cálculo de acordo (art. 484-A) não está coberto; consulte o contador');

  const base = i.salary + i.averageVariable;
  const years = fullYears(i.admission, i.termination);
  const fullNotice = noticeDaysFor(years);
  const indemnifiedNotice = i.notice === 'indemnified';

  let noticeDays = 0;
  let noticePay = 0;
  let noticeDiscount = 0;
  if (i.type === 'without_cause' && indemnifiedNotice) {
    noticeDays = fullNotice;
    noticePay = (base / 30) * noticeDays;
  } else if (i.type === 'agreement' && indemnifiedNotice) {
    noticeDays = Math.round(fullNotice / 2);
    noticePay = (base / 30) * noticeDays;
  } else if (i.type === 'resignation' && indemnifiedNotice) {
    noticeDiscount = i.salary; // 30 dias não trabalhados ficam em débito do empregado
  }
  // O aviso indenizado projeta o contrato e conta como tempo de serviço.
  const projectedEnd = noticeDays > 0 ? plusDays(i.termination, noticeDays) : i.termination;

  const lines: TerminationLine[] = [];
  const earn = (label: string, value: number) => {
    if (value > 0.004) lines.push({ label, value: round2(value), kind: 'earning' });
  };
  const deduct = (label: string, value: number) => {
    if (value > 0.004) lines.push({ label, value: round2(value), kind: 'deduction' });
  };

  const salaryDays = Math.min(i.termination.day, 30);
  const balance = (i.salary / 30) * salaryDays;
  earn(`Saldo de salário (${salaryDays} dias)`, balance);
  earn(`Aviso prévio indenizado (${noticeDays} dias)`, noticePay);

  let thirteenth = 0;
  let vacationProportional = 0;
  if (i.type !== 'cause') {
    const months13 = Math.max(0, projectedEnd.month - 1 + (projectedEnd.day >= 15 ? 1 : 0));
    thirteenth = (base / 12) * Math.min(months13, 12);
    earn(`13º salário proporcional (${Math.min(months13, 12)}/12)`, thirteenth);

    // Período aquisitivo em curso: do último aniversário de admissão até o fim (com projeção).
    let k = Math.max(0, projectedEnd.year - i.admission.year);
    let anniversary = addMonthsClamped(i.admission, k * 12);
    while (k > 0 && utc(anniversary) > utc(projectedEnd)) {
      k--;
      anniversary = addMonthsClamped(i.admission, k * 12);
    }
    const monthsVac = Math.min(monthsBetweenCounting15(anniversary, projectedEnd), 12);
    vacationProportional = (base / 12) * monthsVac;
    earn(`Férias proporcionais (${monthsVac}/12)`, vacationProportional);
    earn('1/3 constitucional sobre as férias proporcionais', vacationProportional / 3);
  }
  const overdue = base * i.overdueVacationPeriods;
  earn(`Férias vencidas (${i.overdueVacationPeriods} período${i.overdueVacationPeriods === 1 ? '' : 's'})`, overdue);
  earn('1/3 constitucional sobre as férias vencidas', overdue / 3);

  // Tributos: aviso e férias indenizadas são isentos; saldo de salário e 13º são tributados separadamente.
  const inssBalance = calcInss(balance, i.year).contribution;
  const irBalance = calcIrrf({ gross: balance, inss: inssBalance, dependents: i.dependents, deduction: i.deduction, year: i.year }).tax;
  const inss13 = thirteenth > 0 ? calcInss(thirteenth, i.year).contribution : 0;
  const ir13 = thirteenth > 0 ? calcIrrf({ gross: thirteenth, inss: inss13, dependents: i.dependents, deduction: i.deduction, year: i.year }).tax : 0;
  deduct('INSS sobre o saldo de salário', inssBalance);
  deduct('Imposto de renda sobre o saldo de salário', irBalance);
  deduct('INSS sobre o 13º', inss13);
  deduct('Imposto de renda sobre o 13º', ir13);
  deduct('Aviso prévio não cumprido (desconto de 30 dias)', noticeDiscount);

  const gross = lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.value, 0);
  const deductions = lines.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.value, 0);

  // FGTS: depósito sobre as verbas rescisórias e multa sobre o saldo total.
  const fgtsOnVerbas = 0.08 * (balance + thirteenth + noticePay);
  const fgtsTotal = i.fgtsBalance + fgtsOnVerbas;
  let penalty = 0;
  let withdrawable = 0;
  let compensatory = 0;
  if (i.domestic) {
    // Doméstico: multa substituída pelo fundo mensal de 3,2%, liberado na dispensa sem justa causa.
    const monthsService = Math.max(0, (i.termination.year - i.admission.year) * 12 + (i.termination.month - i.admission.month));
    compensatory = i.compensatoryFundBalance ?? 0.032 * base * monthsService;
    if (i.type === 'without_cause') {
      withdrawable = fgtsTotal + compensatory;
    } else if (i.type === 'fixed_term') withdrawable = fgtsTotal;
  } else if (i.type === 'without_cause') {
    penalty = fgtsTotal * 0.4;
    withdrawable = fgtsTotal + penalty;
  } else if (i.type === 'agreement') {
    penalty = fgtsTotal * 0.2;
    withdrawable = fgtsTotal * 0.8 + penalty;
  } else if (i.type === 'fixed_term') {
    withdrawable = fgtsTotal;
  }

  return {
    lines, gross: round2(gross), deductions: round2(deductions), net: round2(gross - deductions), noticeDays,
    fgtsPenalty: round2(penalty), fgtsWithdrawable: round2(withdrawable), compensatoryFund: round2(compensatory),
  };
}

const TYPE_LABELS: Record<TerminationType, string> = {
  without_cause: 'Dispensa sem justa causa',
  resignation: 'Pedido de demissão',
  cause: 'Dispensa por justa causa',
  agreement: 'Acordo entre as partes (CLT, art. 484-A)',
  fixed_term: 'Término de contrato por prazo determinado',
};

const terminationInput = {
  salary: money().default(3000),
  averageVariable: money().default(0),
  admission: isoDateField('Data de admissão'),
  termination: isoDateField('Data de desligamento'),
  type: z.enum(['without_cause', 'resignation', 'cause', 'agreement', 'fixed_term']).default('without_cause'),
  notice: z.enum(['worked', 'indemnified']).default('indemnified'),
  overdueVacationPeriods: z.number().int().min(0).max(5).default(0),
  fgtsBalance: money().default(0),
  dependents: z.number().int().min(0).max(30).default(0),
  deduction: z.enum(['auto', 'legal', 'simplified']).default('auto'),
  year: payrollYear,
};

const terminationFields = {
  salary: { label: 'Último salário mensal (R$)' },
  averageVariable: { label: 'Média mensal de variáveis (R$)', help: 'Horas extras, comissões e adicionais habituais.' },
  admission: { label: 'Data de admissão', inputType: 'date' as const },
  termination: { label: 'Data de desligamento (último dia trabalhado)', inputType: 'date' as const },
  type: { label: 'Tipo de rescisão', optionLabels: TYPE_LABELS },
  notice: { label: 'Aviso prévio', optionLabels: { worked: 'Trabalhado', indemnified: 'Indenizado (não trabalhado)' } },
  overdueVacationPeriods: { label: 'Períodos de férias vencidas não gozadas', help: 'Férias já completas e ainda não tiradas.' },
  fgtsBalance: { label: 'Saldo do FGTS (R$)', help: 'Do extrato do FGTS; base da multa.' },
  dependents: { label: 'Dependentes (para o imposto de renda)' },
  deduction: { label: 'Tipo de dedução do IR', optionLabels: { auto: 'Automático', legal: 'Somente deduções legais', simplified: 'Somente desconto simplificado' } },
  year: { label: 'Competência (ano das tabelas)', help: `Tabelas cadastradas: ${SUPPORTED_IR_YEARS.join(', ')}.` },
};

const terminationOutput = z.object({
  net: z.number(), gross: z.number(), deductions: z.number(), noticeDays: z.number(), breakdown: z.array(z.string()),
  fgtsPenalty: z.number(), fgtsWithdrawable: z.number(), note: z.string(),
});

const terminationLabels = {
  net: 'Total líquido da rescisão (R$)', gross: 'Total bruto (R$)', deductions: 'Descontos (R$)', noticeDays: 'Dias de aviso prévio',
  breakdown: 'Verbas e descontos', fgtsPenalty: 'Multa do FGTS (R$)', fgtsWithdrawable: 'FGTS sacável, com a multa (R$)', note: 'Importante',
};

function terminationOutputFor(r: TerminationResult, domestic: boolean, type: TerminationType) {
  const extra =
    type === 'cause' ? ' Na justa causa há direito apenas ao saldo de salário e às férias vencidas.' : type === 'without_cause' ? ' Há direito ao seguro-desemprego, se cumpridos os requisitos.' : '';
  return {
    net: r.net, gross: r.gross, deductions: r.deductions, noticeDays: r.noticeDays,
    breakdown: r.lines.map((l) => `${l.kind === 'earning' ? '+' : '−'} ${l.label}: ${reais(l.value)}`),
    fgtsPenalty: r.fgtsPenalty, fgtsWithdrawable: r.fgtsWithdrawable,
    note: `${domestic ? `Para doméstico, o fundo de 3,2% estimado em ${reais(r.compensatoryFund)} substitui a multa do FGTS. ` : ''}Não inclui reflexos de médias além da informada, multas por atraso (CLT, art. 477), saldo negativo nem benefícios previstos em convenção coletiva.${extra} ${LEGAL_NOTE}`,
  };
}

const sampleTermination = { salary: 3000, averageVariable: 0, admission: '2022-03-01', termination: '2026-06-15', type: 'without_cause' as const, notice: 'indemnified' as const, overdueVacationPeriods: 0, fgtsBalance: 10000, dependents: 0, deduction: 'auto' as const, year: 2026 };

export const terminationTool = defineTool({
  id: 'rescisao',
  name: 'Calculadora de Rescisão Trabalhista (CLT)',
  description: 'Calcula as verbas rescisórias: saldo de salário, aviso prévio, 13º e férias proporcionais, multa do FGTS e descontos',
  category: 'calculadoras',
  keywords: ['rescisão', 'demissão', 'verbas rescisórias', 'aviso prévio', 'multa 40%', 'férias proporcionais', 'acordo', 'justa causa', 'clt'],
  icon: '📄',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object(terminationInput),
  outputSchema: terminationOutput,
  execute: (v) => {
    const r = calcTermination({ ...v, admission: parseIsoDate(v.admission) as CalendarDate, termination: parseIsoDate(v.termination) as CalendarDate, domestic: false });
    return terminationOutputFor(r, false, v.type);
  },
  fields: terminationFields,
  outputLabels: terminationLabels,
  examples: [{ description: 'Dispensa sem justa causa após 4 anos', input: sampleTermination, output: { noticeDays: 42 } }],
  documentation:
    `Calcula por tipo de rescisão: saldo de salário (dias do mês ÷ 30), aviso prévio proporcional (30 dias + 3 por ano completo, até 90; Lei 12.506/2011) que projeta o contrato, 13º e férias proporcionais com 1/3 (mês com 15 dias ou mais conta inteiro), férias vencidas com 1/3 e multa do FGTS de 40% (sem justa causa) ou 20% (acordo). INSS e IR incidem sobre o saldo de salário e o 13º; aviso indenizado e férias indenizadas são isentos. Casos não cobertos: estabilidades, reflexos de médias de variáveis além da informada, férias em dobro, descontos de empréstimos e convenções coletivas. ${LEGAL_NOTE}`,
});

export const domesticTerminationTool = defineTool({
  id: 'rescisao-domestica',
  name: 'Calculadora de Rescisão de Empregada Doméstica',
  description: 'Calcula as verbas rescisórias da empregada doméstica, com o fundo de 3,2% no lugar da multa do FGTS',
  category: 'calculadoras',
  keywords: ['rescisão doméstica', 'empregada doméstica', 'diarista', 'esocial', 'lc 150', 'aviso prévio', 'fgts 3,2%', 'verbas'],
  icon: '🧹',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ ...terminationInput, compensatoryFundBalance: money().optional() }),
  outputSchema: terminationOutput,
  execute: ({ compensatoryFundBalance, ...v }) => {
    const r = calcTermination({ ...v, admission: parseIsoDate(v.admission) as CalendarDate, termination: parseIsoDate(v.termination) as CalendarDate, domestic: true, compensatoryFundBalance });
    return terminationOutputFor(r, true, v.type);
  },
  fields: { ...terminationFields, compensatoryFundBalance: { label: 'Saldo do fundo de 3,2% (R$)', help: 'Opcional. Se vazio, é estimado por 3,2% do salário a cada mês de serviço.' } },
  outputLabels: terminationLabels,
  examples: [{ description: 'Sem justa causa após 3 anos', input: { ...sampleTermination, admission: '2023-01-10', termination: '2026-06-20' }, output: { noticeDays: 39 } }],
  documentation:
    `O contrato doméstico segue a Lei Complementar 150/2015: aviso prévio proporcional, 13º e férias proporcionais com 1/3 e, na dispensa sem justa causa, a liberação do fundo de 3,2% que o empregador recolhe todo mês (no lugar da multa de 40%). O desconto do INSS usa a tabela progressiva. O cálculo de acordo (art. 484-A) não está coberto para doméstico. ${LEGAL_NOTE}`,
});

// ---------- aposentadoria ----------

export interface RetirementInput {
  sex: 'female' | 'male';
  birth: CalendarDate;
  contributionMonths: number;
  reference: CalendarDate;
  insuredBeforeReform: boolean;
}

export interface RuleStatus {
  rule: string;
  eligible: boolean;
  missing: string;
}

export function pointsRequired(sex: 'female' | 'male', year: number): number {
  const p = RETIREMENT.points[sex];
  return Math.min(p.start + (year - 2019), p.cap);
}

export function progressiveAgeRequired(sex: 'female' | 'male', year: number): number {
  const a = RETIREMENT.progressiveAge[sex];
  return Math.min(a.start + 0.5 * (year - 2019), a.cap);
}

const ageInYears = (birth: CalendarDate, on: CalendarDate) => (utc(on) - utc(birth)) / (365.25 * 86_400_000);
const yearsText = (years: number) => {
  const months = Math.ceil(years * 12 - 1e-9);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y > 0 ? `${y} ano${y === 1 ? '' : 's'}` : ''}${y > 0 && m > 0 ? ' e ' : ''}${m > 0 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : y === 0 ? '0 meses' : ''}`;
};

export function evaluateRetirement(i: RetirementInput, onMonthsAhead = 0): { rules: RuleStatus[]; age: number; contribution: number; points: number; on: CalendarDate } {
  const on = addMonthsClamped(i.reference, onMonthsAhead);
  const age = ageInYears(i.birth, on);
  const contribution = (i.contributionMonths + onMonthsAhead) / 12;
  const points = age + contribution;
  const year = on.year;
  const sex = i.sex;
  const need = RETIREMENT.contributionYears[sex];

  const rules: RuleStatus[] = [];
  const permAge = RETIREMENT.permanentAge[sex];
  const permContribution = i.insuredBeforeReform && sex === 'male' ? 15 : RETIREMENT.permanentMinContribution[sex];
  const okPerm = age >= permAge && contribution >= permContribution;
  rules.push({
    rule: `Regra permanente (idade mínima de ${permAge} anos e ${permContribution} anos de contribuição)`,
    eligible: okPerm,
    missing: okPerm ? '' : [age < permAge ? `faltam ${yearsText(permAge - age)} de idade` : '', contribution < permContribution ? `faltam ${yearsText(permContribution - contribution)} de contribuição` : ''].filter(Boolean).join('; '),
  });

  if (i.insuredBeforeReform) {
    const pts = pointsRequired(sex, year);
    const okPts = points >= pts && contribution >= need;
    rules.push({
      rule: `Transição por pontos (${pts} pontos em ${year} e ${need} anos de contribuição)`,
      eligible: okPts,
      missing: okPts ? '' : [points < pts ? `faltam ${roundTo(pts - points, 1)} pontos (você tem ${roundTo(points, 1)})` : '', contribution < need ? `faltam ${yearsText(need - contribution)} de contribuição` : ''].filter(Boolean).join('; '),
    });
    const minAge = progressiveAgeRequired(sex, year);
    const okAge = age >= minAge && contribution >= need;
    rules.push({
      rule: `Transição por idade mínima progressiva (${yearsText(minAge)} em ${year} e ${need} anos de contribuição)`,
      eligible: okAge,
      missing: okAge ? '' : [age < minAge ? `faltam ${yearsText(minAge - age)} de idade` : '', contribution < need ? `faltam ${yearsText(need - contribution)} de contribuição` : ''].filter(Boolean).join('; '),
    });
  }
  return { rules, age, contribution, points, on };
}

/** Primeiro mês (a partir da referência, contribuindo sem interrupção) em que alguma regra é atendida. */
export function earliestRetirement(i: RetirementInput, maxMonths = 600): { monthsAhead: number; date: CalendarDate; rule: string } | null {
  for (let m = 0; m <= maxMonths; m++) {
    const r = evaluateRetirement(i, m);
    const hit = r.rules.find((x) => x.eligible);
    if (hit) return { monthsAhead: m, date: r.on, rule: hit.rule };
  }
  return null;
}

export const retirementTool = defineTool({
  id: 'aposentadoria',
  name: 'Calculadora de Aposentadoria (INSS)',
  description: 'Verifica a elegibilidade pelas regras permanente e de transição por pontos e idade mínima da Reforma da Previdência e estima a data e o valor',
  category: 'calculadoras',
  keywords: ['aposentadoria', 'inss', 'reforma da previdência', 'regra de transição', 'pontos', 'idade mínima', 'tempo de contribuição', 'ec 103'],
  icon: '🏖️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    sex: z.enum(['female', 'male']).default('female'),
    birthDate: isoDateField('Data de nascimento'),
    contributionYears: z.number().int().min(0).max(60).default(20),
    contributionMonths: z.number().int().min(0).max(11).default(0),
    insuredBeforeReform: z.boolean().default(true),
    averageSalary: money().optional(),
    referenceDate: isoDateField('Data de referência').optional(),
  }),
  outputSchema: z.object({
    age: z.string(), contribution: z.string(), points: z.number(), rules: z.array(z.string()), earliest: z.string(), estimatedBenefit: z.string().optional(), note: z.string(),
  }),
  execute: ({ sex, birthDate, contributionYears, contributionMonths, insuredBeforeReform, averageSalary, referenceDate }) => {
    const birth = parseIsoDate(birthDate) as CalendarDate;
    const reference = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    if (utc(birth) >= utc(reference)) throw new ToolError('A data de nascimento deve ser anterior à data de referência');
    const input: RetirementInput = { sex, birth, contributionMonths: contributionYears * 12 + contributionMonths, reference, insuredBeforeReform };
    const now = evaluateRetirement(input);
    const earliest = earliestRetirement(input);
    const rules = now.rules.map((r) => `${r.eligible ? 'Atende' : 'Não atende'}: ${r.rule}${r.eligible ? ' (requisitos atendidos)' : ` (${r.missing})`}`);

    let benefit: string | undefined;
    if (averageSalary !== undefined) {
      const minYears = sex === 'male' ? 20 : 15;
      const at = earliest ? evaluateRetirement(input, earliest.monthsAhead).contribution : now.contribution;
      const coefficient = Math.min(100, 60 + 2 * Math.max(0, Math.floor(at) - minYears));
      const wage = minimumWage(Math.min(reference.year, Math.max(...Object.keys(MINIMUM_WAGE).map(Number))));
      const ceiling = inssTable(Math.max(...Object.keys(MINIMUM_WAGE).map(Number))).ceiling;
      const value = Math.min(Math.max((averageSalary * coefficient) / 100, wage), ceiling);
      benefit = `${coefficient}% da média salarial de ${reais(averageSalary)} = ${reais(round2(value))} (limitado entre o salário mínimo e o teto do INSS)`;
    }

    return {
      age: yearsText(now.age), contribution: yearsText(now.contribution), points: roundTo(now.points, 2), rules,
      earliest: earliest ? `${br(earliest.date)} (em ${earliest.monthsAhead === 0 ? 'agora' : yearsText(earliest.monthsAhead / 12)}), pela regra: ${earliest.rule}` : 'Nenhuma regra é atendida nos próximos 50 anos com os dados informados',
      ...(benefit ? { estimatedBenefit: benefit } : {}),
      note: `Estimativa simplificada: considera contribuição ininterrupta e não inclui os pedágios de 50% e 100%, aposentadoria especial, rural, da pessoa com deficiência, de professor, nem o cálculo da média de todos os salários desde 07/1994. Base: ${RETIREMENT.source} (conferida em ${RETIREMENT.verifiedOn}). Confirme no Meu INSS antes de decidir.`,
    };
  },
  fields: {
    sex: { label: 'Sexo (para as regras)', optionLabels: { female: 'Feminino', male: 'Masculino' } },
    birthDate: { label: 'Data de nascimento', inputType: 'date' },
    contributionYears: { label: 'Tempo de contribuição: anos' },
    contributionMonths: { label: 'Tempo de contribuição: meses adicionais' },
    insuredBeforeReform: { label: 'Já era filiado(a) ao INSS antes de 13/11/2019' },
    averageSalary: { label: 'Média salarial (R$)', help: 'Opcional. A média dos seus salários de contribuição, para estimar o valor.' },
    referenceDate: { label: 'Considerar na data (opcional)', inputType: 'date', help: 'Se vazio, usa hoje.' },
  },
  outputLabels: { age: 'Idade', contribution: 'Tempo de contribuição', points: 'Pontos (idade + contribuição)', rules: 'Regras', earliest: 'Primeira data possível', estimatedBenefit: 'Valor estimado do benefício', note: 'Importante' },
  examples: [{ description: 'Homem de 66 anos com 36 anos de contribuição', input: { sex: 'male', birthDate: '1960-01-01', contributionYears: 36, contributionMonths: 0, insuredBeforeReform: true, referenceDate: '2026-06-01' }, output: {} }],
  documentation:
    `Compara a situação informada com as regras da EC 103/2019: a regra permanente (62 anos mulheres e 65 homens, com 15 anos de contribuição mínima para mulheres e homens já filiados, e 20 para homens filiados depois da reforma); a transição por pontos (soma de idade e contribuição, que sobe 1 ponto por ano até 100 para mulheres e 105 para homens, com 30 e 35 anos de contribuição); e a transição por idade mínima progressiva (sobe 6 meses por ano até 62 e 65 anos, com os mesmos tempos de contribuição). ${LEGAL_NOTE}`,
});

// ---------- salário PJ / pró-labore ----------

function simplesRate(revenue12: number, brackets: SimplesBracket[]): number {
  const bracket = brackets.find((b) => revenue12 <= b.upTo);
  if (!bracket) throw new ToolError('A receita bruta dos últimos 12 meses ultrapassa o limite de R$ 4,8 milhões do Simples Nacional');
  return (revenue12 * bracket.rate - bracket.deduction) / revenue12;
}

export type PjRegime = 'mei_services' | 'mei_commerce' | 'mei_both' | 'simples_iii' | 'simples_v' | 'simples_factor_r';

export const MEI_ANNUAL_LIMIT = 81_000;

export interface PjInput {
  monthlyRevenue: number;
  revenue12?: number | undefined;
  proLabore: number;
  expenses: number;
  regime: PjRegime;
  dependents: number;
  year: number;
}

export function calcPj(i: PjInput) {
  const revenue12 = i.revenue12 ?? i.monthlyRevenue * 12;
  const wage = minimumWage(i.year);
  const notes: string[] = [];

  if (i.regime.startsWith('mei')) {
    const inss = round2(wage * 0.05);
    const extra = i.regime === 'mei_services' ? 5 : i.regime === 'mei_commerce' ? 1 : 6;
    const das = round2(inss + extra);
    if (revenue12 > MEI_ANNUAL_LIMIT) notes.push(`A receita anual de ${reais(revenue12)} passa do limite de ${reais(MEI_ANNUAL_LIMIT)} do MEI (LC 123/2006, art. 18-A); confira o enquadramento.`);
    const profit = i.monthlyRevenue - das - i.expenses;
    return { regime: 'MEI', taxLabel: 'DAS-MEI (valor fixo)', tax: das, effectiveRate: i.monthlyRevenue > 0 ? roundTo((das / i.monthlyRevenue) * 100, 2) : 0, proLabore: 0, inss: 0, irrf: 0, distribution: 0, personalNet: round2(profit), companyLeft: 0, notes, factorR: undefined as number | undefined, annex: 'MEI' };
  }

  let annex: 'III' | 'V';
  let factorR: number | undefined;
  if (i.regime === 'simples_iii') annex = 'III';
  else if (i.regime === 'simples_v') annex = 'V';
  else {
    factorR = revenue12 > 0 ? (i.proLabore * 12) / revenue12 : 0;
    annex = factorR >= 0.28 ? 'III' : 'V';
  }
  if (revenue12 <= 0) throw new ToolError('Informe o faturamento');
  const rate = simplesRate(revenue12, annex === 'III' ? SIMPLES_ANEXO_III : SIMPLES_ANEXO_V);
  const das = round2(i.monthlyRevenue * rate);
  const inss = round2(Math.min(i.proLabore, inssTable(i.year).ceiling) * 0.11);
  const ir = calcIrrf({ gross: i.proLabore, inss, dependents: i.dependents, deduction: 'auto', year: i.year });
  const retained = i.proLabore - inss - ir.tax;
  const distribution = Math.max(0, i.monthlyRevenue - das - i.proLabore - i.expenses);
  if (i.proLabore < wage) notes.push(`O pró-labore informado está abaixo do salário mínimo (${reais(wage)}), referência usual para a contribuição previdenciária do sócio.`);
  if (i.monthlyRevenue - das - i.proLabore - i.expenses < 0) notes.push('As despesas e o pró-labore superam a receita líquida do mês: não há lucro a distribuir.');
  if (factorR !== undefined) notes.push(`Fator R = folha de 12 meses ÷ receita de 12 meses = ${roundTo(factorR * 100, 2)}%: ${annex === 'III' ? 'igual ou acima de 28%, então Anexo III' : 'abaixo de 28%, então Anexo V'}.`);

  return {
    regime: `Simples Nacional, Anexo ${annex}`, taxLabel: 'DAS (Simples Nacional)', tax: das, effectiveRate: roundTo(rate * 100, 2), proLabore: round2(i.proLabore), inss, irrf: ir.tax,
    distribution: round2(distribution), personalNet: round2(retained + distribution), companyLeft: 0, notes, factorR: factorR === undefined ? undefined : roundTo(factorR * 100, 2), annex,
  };
}

export const pjSalaryTool = defineTool({
  id: 'salario-pj',
  name: 'Calculadora de Salário Líquido PJ e Pró-labore',
  description: 'Estima impostos e o ganho líquido de quem fatura como MEI ou como empresa no Simples Nacional, com pró-labore e distribuição de lucros',
  category: 'calculadoras',
  keywords: ['pj', 'pró-labore', 'simples nacional', 'mei', 'fator r', 'das', 'distribuição de lucros', 'prestador de serviço', 'cnpj'],
  icon: '💼',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    monthlyRevenue: money().default(10000),
    revenue12: money().optional(),
    proLabore: money().default(1621),
    expenses: money().default(0),
    regime: z.enum(['simples_factor_r', 'simples_iii', 'simples_v', 'mei_services', 'mei_commerce', 'mei_both']).default('simples_factor_r'),
    dependents: z.number().int().min(0).max(30).default(0),
    year: payrollYear,
  }),
  outputSchema: z.object({
    regime: z.string(), tax: z.number(), effectiveRate: z.number(), proLabore: z.number(), inss: z.number(), irrf: z.number(), distribution: z.number(), personalNet: z.number(), factorR: z.number().optional(), notes: z.string(), source: z.string(),
  }),
  execute: (v) => {
    const r = calcPj(v);
    return {
      regime: r.regime, tax: r.tax, effectiveRate: r.effectiveRate, proLabore: r.proLabore, inss: r.inss, irrf: r.irrf, distribution: r.distribution, personalNet: r.personalNet,
      ...(r.factorR === undefined ? {} : { factorR: r.factorR }),
      notes: `${r.notes.join(' ')} Não inclui contador, ISS fora do DAS, retenções na nota, nem outras obrigações. ${LEGAL_NOTE}`.trim(),
      source: v.regime.startsWith('mei') ? `DAS-MEI de ${v.year}: 5% do salário mínimo de ${reais(minimumWage(v.year))} + ICMS/ISS` : `${SIMPLES_SOURCE}; INSS e IR conforme tabelas de ${v.year}`,
    };
  },
  fields: {
    monthlyRevenue: { label: 'Faturamento do mês (R$)' },
    revenue12: { label: 'Faturamento dos últimos 12 meses (R$)', help: 'Opcional. Define a faixa do Simples. Se vazio, assume o faturamento do mês × 12.' },
    proLabore: { label: 'Pró-labore mensal (R$)', help: 'O salário do sócio. Sobre ele há INSS (11%) e imposto de renda.' },
    expenses: { label: 'Despesas da empresa no mês (R$)', help: 'Contador, ferramentas, aluguel etc., que reduzem o lucro distribuível.' },
    regime: { label: 'Regime', optionLabels: { simples_factor_r: 'Simples Nacional com Fator R automático (serviços)', simples_iii: 'Simples Nacional, Anexo III', simples_v: 'Simples Nacional, Anexo V', mei_services: 'MEI — serviços', mei_commerce: 'MEI — comércio e indústria', mei_both: 'MEI — comércio e serviços' } },
    dependents: { label: 'Dependentes (IR do pró-labore)' },
    year: { label: 'Competência (ano das tabelas)', help: `Tabelas cadastradas: ${SUPPORTED_IR_YEARS.join(', ')}.` },
  },
  outputLabels: { regime: 'Enquadramento', tax: 'Imposto da empresa — DAS (R$)', effectiveRate: 'Alíquota efetiva (%)', proLabore: 'Pró-labore bruto (R$)', inss: 'INSS do pró-labore (R$)', irrf: 'IR do pró-labore (R$)', distribution: 'Distribuição de lucros (R$)', personalNet: 'Ganho líquido da pessoa no mês (R$)', factorR: 'Fator R (%)', notes: 'Observações', source: 'Fonte' },
  examples: [{ description: 'Serviços com R$ 10.000 por mês, Anexo III', input: { monthlyRevenue: 10000, proLabore: 3000, expenses: 0, regime: 'simples_iii', dependents: 0, year: 2026 }, output: { effectiveRate: 6, tax: 600 } }],
  documentation:
    `Simples Nacional: a alíquota efetiva = (receita dos 12 meses × alíquota da faixa − parcela a deduzir) ÷ receita dos 12 meses. O Fator R (folha de 12 meses ÷ receita de 12 meses) de 28% ou mais enquadra serviços no Anexo III (mais barato); abaixo disso, no Anexo V. O pró-labore sofre INSS de 11% e imposto de renda; a distribuição de lucros que sobra, quando há contabilidade que a comprove, é isenta para a pessoa física. MEI paga o DAS fixo (5% do salário mínimo mais ICMS e/ou ISS). Atividades de outros anexos (comércio, indústria, Anexo IV) não são calculadas pelo Simples aqui. Esta é uma simulação: o tributo real depende da atividade (CNAE), do município e do contador. ${LEGAL_NOTE}`,
});
