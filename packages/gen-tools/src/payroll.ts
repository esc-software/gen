import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { round2, roundTo } from './calc-math.js';
import { inssTable, irTable, minimumWage, SUPPORTED_INSS_YEARS, SUPPORTED_IR_YEARS } from './payroll-data.js';

const LEGAL_NOTE =
  'Cálculo informativo conforme as regras e tabelas indicadas na vigência escolhida; não substitui o cálculo oficial do contador ou do departamento pessoal nem convenções coletivas. Sistemas de folha podem diferir em até 1 centavo por critério de arredondamento.';

const money = (max = 1e9) => z.number().finite().min(0).max(max);
const salaryField = money().default(3000);
const inssYear = z.coerce.number().int().refine((y) => SUPPORTED_INSS_YEARS.includes(y), { message: `Competências disponíveis: ${SUPPORTED_INSS_YEARS.join(', ')}` }).default(Math.max(...SUPPORTED_INSS_YEARS));
const irYear = z.coerce.number().int().refine((y) => SUPPORTED_IR_YEARS.includes(y), { message: `Competências disponíveis: ${SUPPORTED_IR_YEARS.join(', ')}` }).default(Math.max(...SUPPORTED_IR_YEARS));

const competenceHint = (years: number[]) => ({
  label: 'Competência (ano das tabelas)',
  help: `Tabelas cadastradas: ${years.join(', ')}. Para outras competências, consulte a legislação da época.`,
});

// ---------- INSS ----------

export interface InssResult {
  base: number;
  contribution: number;
  effectiveRate: number;
  ceiling: number;
  atCeiling: boolean;
}

/** Contribuição do empregado (alíquotas progressivas com parcela a deduzir). */
export function calcInss(gross: number, year: number): InssResult {
  const table = inssTable(year);
  const base = Math.min(gross, table.ceiling);
  const bracket = table.brackets.find((b) => base <= b.upTo) ?? table.brackets[table.brackets.length - 1];
  const raw = bracket ? base * bracket.rate - bracket.deduction : 0;
  const contribution = round2(Math.max(0, raw));
  return { base: round2(base), contribution, effectiveRate: gross > 0 ? roundTo((contribution / gross) * 100, 2) : 0, ceiling: table.ceiling, atCeiling: gross >= table.ceiling };
}

export type InssCategory = 'employee' | 'autonomous' | 'simplified' | 'mei';

export const inssTool = defineTool({
  id: 'inss',
  name: 'Calculadora de INSS',
  description: 'Calcula a contribuição ao INSS do empregado, do autônomo, do plano simplificado e do MEI',
  category: 'calculadoras',
  keywords: ['inss', 'previdência', 'contribuição', 'desconto', 'teto', 'alíquota progressiva', 'autônomo', 'mei', 'salário'],
  icon: '🏛️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    gross: money().default(3000),
    category: z.enum(['employee', 'autonomous', 'simplified', 'mei']).default('employee'),
    year: inssYear,
  }),
  outputSchema: z.object({ contribution: z.number(), effectiveRate: z.number().optional(), base: z.number(), ceiling: z.number(), explanation: z.string(), source: z.string() }),
  execute: ({ gross, category, year }) => {
    const table = inssTable(year);
    const wage = minimumWage(year);
    if (category === 'employee') {
      const r = calcInss(gross, year);
      return { contribution: r.contribution, effectiveRate: r.effectiveRate, base: r.base, ceiling: r.ceiling, source: table.source, explanation: r.atCeiling ? 'Salário acima do teto: a contribuição é a máxima do ano.' : 'Alíquotas de 7,5% a 14% aplicadas por faixa, com parcela a deduzir.' };
    }
    if (category === 'autonomous') {
      const base = Math.min(Math.max(gross, wage), table.ceiling);
      return { contribution: round2(base * 0.2), effectiveRate: 20, base: round2(base), ceiling: table.ceiling, source: table.source, explanation: `20% sobre o salário de contribuição, entre o salário mínimo (R$ ${wage}) e o teto.` };
    }
    if (category === 'simplified') {
      return { contribution: round2(wage * 0.11), base: wage, ceiling: table.ceiling, source: table.source, explanation: '11% do salário mínimo (plano simplificado): não conta tempo para aposentadoria por tempo de contribuição.' };
    }
    return { contribution: round2(wage * 0.05), base: wage, ceiling: table.ceiling, source: table.source, explanation: '5% do salário mínimo (MEI): parte do DAS mensal; não conta tempo para aposentadoria por tempo de contribuição.' };
  },
  fields: {
    gross: { label: 'Salário ou remuneração bruta (R$)' },
    category: { label: 'Categoria', optionLabels: { employee: 'Empregado, doméstico ou avulso (alíquotas progressivas)', autonomous: 'Contribuinte individual / autônomo (20%)', simplified: 'Plano simplificado (11% do salário mínimo)', mei: 'MEI (5% do salário mínimo)' } },
    year: competenceHint(SUPPORTED_INSS_YEARS),
  },
  outputLabels: { contribution: 'Contribuição (R$)', effectiveRate: 'Alíquota efetiva (%)', base: 'Base de cálculo (R$)', ceiling: 'Teto do INSS (R$)', explanation: 'Como foi calculado', source: 'Fonte da tabela' },
  examples: [
    { description: 'Empregado no teto de 2026', input: { gross: 10000, category: 'employee', year: 2026 }, output: { contribution: 988.09, ceiling: 8475.55 } },
    { description: 'Salário mínimo de 2026', input: { gross: 1621, category: 'employee', year: 2026 }, output: { contribution: 121.58 } },
  ],
  documentation:
    `${LEGAL_NOTE} A alíquota do empregado é progressiva: cada faixa tem sua alíquota, e o cálculo usa a parcela a deduzir publicada na portaria interministerial do ano. A remuneração acima do teto não paga contribuição adicional.`,
});

// ---------- imposto de renda na fonte ----------

export interface IrrfInput {
  gross: number;
  inss: number;
  dependents?: number;
  pension?: number;
  deduction?: 'auto' | 'legal' | 'simplified';
  year: number;
}

export interface IrrfResult {
  taxableBase: number;
  deductionUsed: number;
  deductionKind: 'legal' | 'simplified';
  tableTax: number;
  reducer: number;
  tax: number;
}

/**
 * IRRF mensal. Calcula o imposto pela tabela progressiva sobre a base (rendimento menos
 * deduções) e subtrai a redução da Lei 15.270/2025, que usa o rendimento bruto.
 */
export function calcIrrf({ gross, inss, dependents = 0, pension = 0, deduction = 'auto', year }: IrrfInput): IrrfResult {
  const t = irTable(year);
  const legal = inss + dependents * t.dependentDeduction + pension;
  const simplified = t.simplifiedDeduction;
  const useSimplified = deduction === 'simplified' || (deduction === 'auto' && simplified > legal);
  const deductionUsed = useSimplified ? simplified : legal;
  const base = Math.max(0, gross - deductionUsed);
  const bracket = t.brackets.find((b) => base <= b.upTo) ?? t.brackets[t.brackets.length - 1];
  const tableTax = bracket ? Math.max(0, base * bracket.rate - bracket.deduction) : 0;
  const r = t.reducer;
  const reducer = gross <= r.fullUpTo ? r.fullAmount : gross <= r.phaseOutUpTo ? Math.max(0, r.constant - r.factor * gross) : 0;
  return {
    taxableBase: round2(base), deductionUsed: round2(deductionUsed), deductionKind: useSimplified ? 'simplified' : 'legal',
    tableTax: round2(tableTax), reducer: round2(reducer), tax: round2(Math.max(0, tableTax - reducer)),
  };
}

const deductionLabels = { auto: 'Automático (usa o maior entre as deduções legais e o desconto simplificado)', legal: 'Somente deduções legais (INSS, dependentes, pensão)', simplified: 'Somente desconto simplificado' };

export const incomeTaxTool = defineTool({
  id: 'imposto-renda',
  name: 'Calculadora de Imposto de Renda (mensal, na fonte)',
  description: 'Calcula o imposto de renda retido na fonte sobre salário, com dependentes, pensão e a redução da Lei 15.270/2025',
  category: 'calculadoras',
  keywords: ['imposto de renda', 'irrf', 'ir', 'retido na fonte', 'tabela progressiva', 'dependentes', 'isenção', 'salário', 'redutor'],
  icon: '🧾',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    gross: money().default(6000),
    inss: money().optional(),
    dependents: z.number().int().min(0).max(30).default(0),
    pension: money().default(0),
    deduction: z.enum(['auto', 'legal', 'simplified']).default('auto'),
    year: irYear,
  }),
  outputSchema: z.object({ tax: z.number(), taxableBase: z.number(), deductionUsed: z.number(), deductionKind: z.string(), tableTax: z.number(), reducer: z.number(), inssUsed: z.number(), source: z.string(), note: z.string() }),
  execute: ({ gross, inss, dependents, pension, deduction, year }) => {
    const inssYearUsed = Math.min(year, Math.max(...SUPPORTED_INSS_YEARS));
    const inssValue = inss ?? calcInss(gross, inssYearUsed).contribution;
    const r = calcIrrf({ gross, inss: inssValue, dependents, pension, deduction, year });
    return {
      tax: r.tax, taxableBase: r.taxableBase, deductionUsed: r.deductionUsed, deductionKind: r.deductionKind === 'simplified' ? 'desconto simplificado' : 'deduções legais',
      tableTax: r.tableTax, reducer: r.reducer, inssUsed: round2(inssValue), source: irTable(year).source,
      note: `Este é o imposto retido mensalmente na fonte; a declaração anual (IRPF) usa tabela e regras próprias. ${LEGAL_NOTE}`,
    };
  },
  fields: {
    gross: { label: 'Rendimento tributável bruto do mês (R$)' },
    inss: { label: 'INSS do mês (R$)', help: 'Opcional. Se vazio, é calculado pela tabela do INSS.' },
    dependents: { label: 'Dependentes' },
    pension: { label: 'Pensão alimentícia paga (R$)' },
    deduction: { label: 'Tipo de dedução', optionLabels: deductionLabels },
    year: competenceHint(SUPPORTED_IR_YEARS),
  },
  outputLabels: { tax: 'Imposto retido (R$)', taxableBase: 'Base de cálculo (R$)', deductionUsed: 'Dedução usada (R$)', deductionKind: 'Tipo de dedução', tableTax: 'Imposto pela tabela (R$)', reducer: 'Redução da Lei 15.270 (R$)', inssUsed: 'INSS considerado (R$)', source: 'Fonte', note: 'Importante' },
  examples: [
    { description: 'Salário de R$ 5.000 (isento pela redução)', input: { gross: 5000, dependents: 0, pension: 0, deduction: 'auto', year: 2026 }, output: { tax: 0 } },
    { description: 'Exemplo com INSS informado', input: { gross: 5892.33, inss: 634.53, dependents: 0, pension: 0, deduction: 'auto', year: 2026 }, output: { tax: 343.08, taxableBase: 5257.8 } },
  ],
  documentation:
    `Passos: (1) base = rendimento − deduções (INSS, R$ 189,59 por dependente, pensão alimentícia) ou o desconto simplificado de R$ 607,20, o que for maior no modo automático; (2) imposto pela tabela progressiva mensal (isento até R$ 2.428,80; alíquotas de 7,5% a 27,5%); (3) subtrai a redução da Lei 15.270/2025: R$ 312,89 até R$ 5.000 de rendimento bruto, decrescente por 978,62 − 0,133145 × rendimento até R$ 7.350, e nula acima disso. ${LEGAL_NOTE}`,
});

// ---------- vale-transporte ----------

export const transportVoucherTool = defineTool({
  id: 'vale-transporte',
  name: 'Calculadora de Vale-Transporte',
  description: 'Calcula o custo do vale-transporte e o desconto de até 6% do salário do empregado',
  category: 'calculadoras',
  keywords: ['vale-transporte', 'vt', 'transporte', 'desconto 6%', 'empregado', 'empregador', 'passagem'],
  icon: '🚌',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    baseSalary: money().default(3000),
    dailyCost: money(1000).default(12),
    workDays: z.number().int().min(0).max(31).default(22),
  }),
  outputSchema: z.object({ monthlyCost: z.number(), employeeDiscount: z.number(), employerCost: z.number(), maxDiscount: z.number() }),
  execute: ({ baseSalary, dailyCost, workDays }) => {
    const monthlyCost = dailyCost * workDays;
    const maxDiscount = baseSalary * 0.06;
    const employeeDiscount = Math.min(monthlyCost, maxDiscount);
    return { monthlyCost: round2(monthlyCost), employeeDiscount: round2(employeeDiscount), employerCost: round2(monthlyCost - employeeDiscount), maxDiscount: round2(maxDiscount) };
  },
  fields: {
    baseSalary: { label: 'Salário básico (R$)', help: 'Sem horas extras, adicionais ou comissões.' },
    dailyCost: { label: 'Custo de ida e volta por dia (R$)' },
    workDays: { label: 'Dias de trabalho no mês' },
  },
  outputLabels: { monthlyCost: 'Custo mensal do vale-transporte (R$)', employeeDiscount: 'Desconto do empregado (R$)', employerCost: 'Parte da empresa (R$)', maxDiscount: 'Limite de 6% do salário (R$)' },
  examples: [{ description: 'Salário de R$ 3.000 e R$ 12 por dia', input: { baseSalary: 3000, dailyCost: 12, workDays: 22 }, output: { monthlyCost: 264, employeeDiscount: 180, employerCost: 84 } }],
  documentation:
    `O empregador pode descontar até 6% do salário básico do empregado; o que exceder esse valor é custeado pela empresa (Lei 7.418/1985 e Decreto 95.247/1987). Se o custo do vale for menor que 6%, desconta-se apenas o custo. O desconto usa o salário básico, sem adicionais. ${LEGAL_NOTE}`,
});

// ---------- horas extras ----------

export const overtimeTool = defineTool({
  id: 'horas-extras',
  name: 'Calculadora de Horas Extras',
  description: 'Calcula o valor das horas extras a 50% e a 100% e o reflexo no descanso semanal remunerado',
  category: 'calculadoras',
  keywords: ['horas extras', 'hora extra', '50%', '100%', 'dsr', 'jornada', 'adicional', 'salário'],
  icon: '⏱️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: money().default(3000),
    monthlyHours: z.number().finite().positive().max(744).default(220),
    hours50: money(300).default(10),
    hours100: money(300).default(0),
    percent50: z.number().min(50).max(300).default(50),
    percent100: z.number().min(100).max(300).default(100),
    workingDays: z.number().int().min(0).max(31).optional(),
    restDays: z.number().int().min(0).max(31).optional(),
  }),
  outputSchema: z.object({ hourlyRate: z.number(), overtime50: z.number(), overtime100: z.number(), overtimeTotal: z.number(), dsr: z.number().optional(), totalWithDsr: z.number() }),
  execute: ({ salary, monthlyHours, hours50, hours100, percent50, percent100, workingDays, restDays }) => {
    const rate = salary / monthlyHours;
    const o50 = hours50 * rate * (1 + percent50 / 100);
    const o100 = hours100 * rate * (1 + percent100 / 100);
    const total = o50 + o100;
    const out: { hourlyRate: number; overtime50: number; overtime100: number; overtimeTotal: number; dsr?: number; totalWithDsr: number } = {
      hourlyRate: round2(rate), overtime50: round2(o50), overtime100: round2(o100), overtimeTotal: round2(total), totalWithDsr: round2(total),
    };
    if (workingDays !== undefined && restDays !== undefined) {
      if (workingDays === 0) throw new ToolError('Informe os dias úteis do mês');
      const dsr = (total / workingDays) * restDays;
      out.dsr = round2(dsr);
      out.totalWithDsr = round2(total + dsr);
    }
    return out;
  },
  fields: {
    salary: { label: 'Salário mensal (R$)' },
    monthlyHours: { label: 'Horas mensais do contrato', help: '220 para jornada de 44 horas por semana; 180 para 36 h; 200 para 40 h.' },
    hours50: { label: 'Horas extras com adicional de 50%', help: 'Dias úteis e sábados.' },
    hours100: { label: 'Horas extras com adicional de 100%', help: 'Domingos e feriados, salvo se a convenção coletiva fixar outro valor.' },
    percent50: { label: 'Adicional das horas de 50% (%)', help: 'O mínimo constitucional é 50%; convenções coletivas costumam pagar mais.' },
    percent100: { label: 'Adicional das horas de 100% (%)' },
    workingDays: { label: 'Dias úteis do mês', help: 'Opcional. Para calcular o DSR sobre as horas extras.' },
    restDays: { label: 'Domingos e feriados do mês', help: 'Opcional. Para calcular o DSR.' },
  },
  outputLabels: { hourlyRate: 'Valor da hora normal (R$)', overtime50: 'Horas extras a 50% (R$)', overtime100: 'Horas extras a 100% (R$)', overtimeTotal: 'Total das horas extras (R$)', dsr: 'DSR sobre as horas extras (R$)', totalWithDsr: 'Total a receber (R$)' },
  examples: [{ description: '10 horas extras a 50% com salário de R$ 2.200', input: { salary: 2200, monthlyHours: 220, hours50: 10, hours100: 0, percent50: 50, percent100: 100, workingDays: 25, restDays: 5 }, output: { hourlyRate: 10, overtime50: 150, dsr: 30, totalWithDsr: 180 } }],
  documentation:
    `Valor da hora = salário ÷ horas mensais; a hora extra paga o valor da hora com o adicional (mínimo de 50%, Constituição, art. 7º, XVI). O DSR sobre horas extras segue a Súmula 172 do TST: total das extras ÷ dias úteis × domingos e feriados. Não inclui adicional noturno, médias de outras variáveis nem o desconto de INSS e IR sobre o total. ${LEGAL_NOTE}`,
});

// ---------- adicional noturno ----------

/** A hora noturna urbana tem 52 minutos e 30 segundos (CLT, art. 73, §1º). */
export const NIGHT_HOUR_FACTOR = 60 / 52.5;

export const nightShiftTool = defineTool({
  id: 'adicional-noturno',
  name: 'Calculadora de Adicional Noturno',
  description: 'Calcula o adicional noturno de 20% e a hora noturna reduzida (52min30s) para trabalho entre 22h e 5h',
  category: 'calculadoras',
  keywords: ['adicional noturno', 'noturno', '22h às 5h', 'hora reduzida', '20%', 'trabalho noturno', 'clt'],
  icon: '🌙',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: money().default(3000),
    monthlyHours: z.number().finite().positive().max(744).default(220),
    nightHours: money(744).default(40),
    percent: z.number().min(20).max(200).default(20),
    workingDays: z.number().int().min(0).max(31).optional(),
    restDays: z.number().int().min(0).max(31).optional(),
  }),
  outputSchema: z.object({ hourlyRate: z.number(), paidNightHours: z.number(), additional: z.number(), reducedHourPay: z.number(), total: z.number(), dsr: z.number().optional(), totalWithDsr: z.number() }),
  execute: ({ salary, monthlyHours, nightHours, percent, workingDays, restDays }) => {
    const rate = salary / monthlyHours;
    const paidHours = nightHours * NIGHT_HOUR_FACTOR;
    const additional = paidHours * rate * (percent / 100);
    const reduced = (paidHours - nightHours) * rate;
    const total = additional + reduced;
    const out: { hourlyRate: number; paidNightHours: number; additional: number; reducedHourPay: number; total: number; dsr?: number; totalWithDsr: number } = {
      hourlyRate: round2(rate), paidNightHours: roundTo(paidHours, 2), additional: round2(additional), reducedHourPay: round2(reduced), total: round2(total), totalWithDsr: round2(total),
    };
    if (workingDays !== undefined && restDays !== undefined) {
      if (workingDays === 0) throw new ToolError('Informe os dias úteis do mês');
      out.dsr = round2((total / workingDays) * restDays);
      out.totalWithDsr = round2(total + (total / workingDays) * restDays);
    }
    return out;
  },
  fields: {
    salary: { label: 'Salário mensal (R$)' },
    monthlyHours: { label: 'Horas mensais do contrato', help: '220 para 44 horas semanais.' },
    nightHours: { label: 'Horas de relógio trabalhadas entre 22h e 5h no mês' },
    percent: { label: 'Adicional noturno (%)', help: 'O mínimo legal é 20% (trabalhador urbano). Convenções podem pagar mais.' },
    workingDays: { label: 'Dias úteis do mês', help: 'Opcional, para o DSR.' },
    restDays: { label: 'Domingos e feriados do mês', help: 'Opcional, para o DSR.' },
  },
  outputLabels: { hourlyRate: 'Valor da hora normal (R$)', paidNightHours: 'Horas noturnas pagas (hora reduzida)', additional: 'Adicional noturno (R$)', reducedHourPay: 'Pagamento da hora reduzida (R$)', total: 'Total a mais no mês (R$)', dsr: 'DSR sobre o adicional (R$)', totalWithDsr: 'Total a receber a mais (R$)' },
  examples: [{ description: '40 horas noturnas com salário de R$ 2.200', input: { salary: 2200, monthlyHours: 220, nightHours: 42, percent: 20 }, output: { hourlyRate: 10, paidNightHours: 48 } }],
  documentation:
    `Para o trabalhador urbano, a hora noturna (22h às 5h) é computada como 52 minutos e 30 segundos, então cada hora de relógio vale 60 ÷ 52,5 ≈ 1,143 hora paga, além do adicional de no mínimo 20% (CLT, art. 73). O salário mensal já remunera as horas de relógio; o valor mostrado é o acréscimo: 20% sobre as horas noturnas computadas mais o pagamento da diferença da hora reduzida. Trabalhadores rurais têm regras diferentes (Lei 5.889/1973) e não são cobertos. ${LEGAL_NOTE}`,
});

// ---------- salário líquido ----------

export interface NetSalary {
  gross: number;
  inss: number;
  irrf: number;
  transport: number;
  other: number;
  net: number;
  fgts: number;
  irrfDetail: IrrfResult;
}

export function calcNetSalary(opts: { gross: number; dependents: number; pension: number; transportDiscount: number; other: number; deduction: 'auto' | 'legal' | 'simplified'; year: number }): NetSalary {
  const inss = calcInss(opts.gross, opts.year).contribution;
  const irrfDetail = calcIrrf({ gross: opts.gross, inss, dependents: opts.dependents, pension: opts.pension, deduction: opts.deduction, year: opts.year });
  const net = opts.gross - inss - irrfDetail.tax - opts.transportDiscount - opts.other - opts.pension;
  return { gross: opts.gross, inss, irrf: irrfDetail.tax, transport: opts.transportDiscount, other: opts.other, net: round2(net), fgts: round2(opts.gross * 0.08), irrfDetail };
}

const netYear = z.coerce.number().int().refine((y) => SUPPORTED_IR_YEARS.includes(y) && SUPPORTED_INSS_YEARS.includes(y), { message: `Competências disponíveis: ${SUPPORTED_IR_YEARS.join(', ')}` }).default(Math.max(...SUPPORTED_IR_YEARS));

export const netSalaryTool = defineTool({
  id: 'salario-liquido',
  name: 'Calculadora de Salário Líquido (CLT)',
  description: 'Calcula o salário líquido a partir do bruto, descontando INSS, imposto de renda, vale-transporte e outros descontos',
  category: 'calculadoras',
  keywords: ['salário líquido', 'salário bruto', 'clt', 'inss', 'irrf', 'desconto', 'holerite', 'contracheque', 'quanto vou receber'],
  icon: '💰',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    gross: salaryField,
    dependents: z.number().int().min(0).max(30).default(0),
    pension: money().default(0),
    transportVoucher: z.boolean().default(false),
    transportCost: money().default(0),
    otherDiscounts: money().default(0),
    deduction: z.enum(['auto', 'legal', 'simplified']).default('auto'),
    year: netYear,
  }),
  outputSchema: z.object({ net: z.number(), inss: z.number(), irrf: z.number(), transportDiscount: z.number(), totalDiscounts: z.number(), fgtsDeposit: z.number(), note: z.string() }),
  execute: ({ gross, dependents, pension, transportVoucher, transportCost, otherDiscounts, deduction, year }) => {
    const transport = transportVoucher ? Math.min(gross * 0.06, transportCost > 0 ? transportCost : gross * 0.06) : 0;
    const r = calcNetSalary({ gross, dependents, pension, transportDiscount: transport, other: otherDiscounts, deduction, year });
    return {
      net: r.net, inss: r.inss, irrf: r.irrf, transportDiscount: round2(transport),
      totalDiscounts: round2(r.inss + r.irrf + transport + otherDiscounts + pension),
      fgtsDeposit: r.fgts,
      note: `O FGTS (8%) é depositado pela empresa e não é descontado do salário. ${LEGAL_NOTE}`,
    };
  },
  fields: {
    gross: { label: 'Salário bruto (R$)' },
    dependents: { label: 'Dependentes (para o imposto de renda)' },
    pension: { label: 'Pensão alimentícia (R$)' },
    transportVoucher: { label: 'Recebo vale-transporte (desconto de até 6%)' },
    transportCost: { label: 'Custo mensal do vale-transporte (R$)', help: 'Se vazio ou 0, desconta os 6% integrais.' },
    otherDiscounts: { label: 'Outros descontos (R$)', help: 'Plano de saúde, vale-refeição, sindicato etc.' },
    deduction: { label: 'Tipo de dedução do IR', optionLabels: deductionLabels },
    year: competenceHint(SUPPORTED_IR_YEARS),
  },
  outputLabels: { net: 'Salário líquido (R$)', inss: 'INSS (R$)', irrf: 'Imposto de renda (R$)', transportDiscount: 'Vale-transporte (R$)', totalDiscounts: 'Total de descontos (R$)', fgtsDeposit: 'FGTS depositado pela empresa (R$)', note: 'Importante' },
  examples: [
    { description: 'Salário bruto de R$ 3.000 (2026)', input: { gross: 3000, dependents: 0, pension: 0, transportVoucher: false, transportCost: 0, otherDiscounts: 0, deduction: 'auto', year: 2026 }, output: { inss: 248.6, irrf: 0, net: 2751.4 } },
    { description: 'Salário bruto de R$ 10.000 (2026)', input: { gross: 10000, dependents: 0, pension: 0, transportVoucher: false, transportCost: 0, otherDiscounts: 0, deduction: 'auto', year: 2026 }, output: { inss: 988.09 } },
  ],
  documentation:
    `Líquido = bruto − INSS − imposto de renda − vale-transporte − pensão − outros descontos. O INSS é progressivo por faixa e o imposto de renda segue as regras de 2026 (isenção efetiva até R$ 5.000 pela redução da Lei 15.270/2025, com redução gradual até R$ 7.350). ${LEGAL_NOTE}`,
});

// ---------- décimo terceiro ----------

export const thirteenthTool = defineTool({
  id: 'decimo-terceiro',
  name: 'Calculadora de Décimo Terceiro Salário',
  description: 'Calcula o 13º proporcional, a primeira parcela, a segunda parcela e os descontos de INSS e imposto de renda',
  category: 'calculadoras',
  keywords: ['décimo terceiro', '13º salário', 'gratificação natalina', 'parcela', 'proporcional', 'inss', 'irrf'],
  icon: '🎄',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: salaryField,
    averageVariable: money().default(0),
    months: z.number().int().min(1).max(12).default(12),
    dependents: z.number().int().min(0).max(30).default(0),
    deduction: z.enum(['auto', 'legal', 'simplified']).default('auto'),
    year: netYear,
  }),
  outputSchema: z.object({ gross: z.number(), firstInstallment: z.number(), inss: z.number(), irrf: z.number(), secondInstallment: z.number(), net: z.number(), note: z.string() }),
  execute: ({ salary, averageVariable, months, dependents, deduction, year }) => {
    const gross = ((salary + averageVariable) / 12) * months;
    const first = gross / 2;
    const inss = calcInss(gross, year).contribution;
    const ir = calcIrrf({ gross, inss, dependents, deduction, year });
    const second = gross - first - inss - ir.tax;
    return {
      gross: round2(gross), firstInstallment: round2(first), inss, irrf: ir.tax, secondInstallment: round2(second), net: round2(first + second),
      note: `A 1ª parcela (50% do valor bruto) é paga até 30/11 sem descontos; a 2ª parcela, até 20/12, leva o INSS e o IR calculados sobre o 13º inteiro, abatida a 1ª. O 13º é tributado separadamente do salário do mês. ${LEGAL_NOTE}`,
    };
  },
  fields: {
    salary: { label: 'Salário mensal (R$)' },
    averageVariable: { label: 'Média mensal de variáveis (R$)', help: 'Horas extras, comissões e adicionais habituais.' },
    months: { label: 'Meses trabalhados no ano', help: 'Conta o mês em que trabalhou 15 dias ou mais.' },
    dependents: { label: 'Dependentes' },
    deduction: { label: 'Tipo de dedução do IR', optionLabels: deductionLabels },
    year: competenceHint(SUPPORTED_IR_YEARS),
  },
  outputLabels: { gross: '13º bruto (R$)', firstInstallment: '1ª parcela, sem descontos (R$)', inss: 'INSS sobre o 13º (R$)', irrf: 'Imposto de renda sobre o 13º (R$)', secondInstallment: '2ª parcela líquida (R$)', net: 'Total líquido (R$)', note: 'Importante' },
  examples: [{ description: '13º integral de R$ 3.000 (2026)', input: { salary: 3000, averageVariable: 0, months: 12, dependents: 0, deduction: 'auto', year: 2026 }, output: { gross: 3000, firstInstallment: 1500, inss: 248.6, irrf: 0 } }],
  documentation:
    `13º = (salário + média das variáveis) ÷ 12 × meses trabalhados. Descontos incidem sobre o valor total na segunda parcela (Lei 4.090/1962 e Lei 4.749/1965). O 13º não entra na base do imposto do salário mensal. ${LEGAL_NOTE}`,
});

// ---------- férias ----------

/** Dias de férias conforme as faltas injustificadas no período aquisitivo (CLT, art. 130). */
export function vacationDaysForAbsences(absences: number): number {
  if (absences <= 5) return 30;
  if (absences <= 14) return 24;
  if (absences <= 23) return 18;
  if (absences <= 32) return 12;
  return 0;
}

export const vacationTool = defineTool({
  id: 'ferias',
  name: 'Calculadora de Férias',
  description: 'Calcula o valor das férias com o terço constitucional, o abono pecuniário e os descontos',
  category: 'calculadoras',
  keywords: ['férias', '1/3 de férias', 'abono pecuniário', 'vender férias', 'terço constitucional', 'inss', 'irrf', 'faltas'],
  icon: '🏖️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: salaryField,
    averageVariable: money().default(0),
    absences: z.number().int().min(0).max(365).default(0),
    sellDays: z.boolean().default(false),
    dependents: z.number().int().min(0).max(30).default(0),
    deduction: z.enum(['auto', 'legal', 'simplified']).default('auto'),
    year: netYear,
  }),
  outputSchema: z.object({ daysEntitled: z.number(), daysEnjoyed: z.number(), vacationPay: z.number(), constitutionalThird: z.number(), soldDaysPay: z.number(), gross: z.number(), inss: z.number(), irrf: z.number(), net: z.number(), note: z.string() }),
  execute: ({ salary, averageVariable, absences, sellDays, dependents, deduction, year }) => {
    const entitled = vacationDaysForAbsences(absences);
    if (entitled === 0) throw new ToolError('Com mais de 32 faltas injustificadas no período aquisitivo, o empregado perde o direito às férias (CLT, art. 130)');
    const base = salary + averageVariable;
    const sold = sellDays ? Math.min(10, Math.floor(entitled / 3)) : 0;
    const enjoyed = entitled - sold;
    const pay = (base / 30) * enjoyed;
    const third = pay / 3;
    const soldPay = ((base / 30) * sold) * (4 / 3); // abono + 1/3 sobre o abono (isento de INSS e IR)
    const taxable = pay + third;
    const inss = calcInss(taxable, year).contribution;
    const ir = calcIrrf({ gross: taxable, inss, dependents, deduction, year });
    return {
      daysEntitled: entitled, daysEnjoyed: enjoyed, vacationPay: round2(pay), constitutionalThird: round2(third), soldDaysPay: round2(soldPay),
      gross: round2(taxable + soldPay), inss, irrf: ir.tax, net: round2(taxable + soldPay - inss - ir.tax),
      note: `O abono pecuniário (venda de até 1/3 das férias) e seu terço são isentos de INSS e de imposto de renda. As férias devem ser pagas até 2 dias antes do início. ${LEGAL_NOTE}`,
    };
  },
  fields: {
    salary: { label: 'Salário mensal (R$)' },
    averageVariable: { label: 'Média mensal de variáveis (R$)', help: 'Horas extras, comissões e adicionais habituais.' },
    absences: { label: 'Faltas injustificadas no período aquisitivo', help: 'Até 5 faltas: 30 dias; 6 a 14: 24 dias; 15 a 23: 18 dias; 24 a 32: 12 dias.' },
    sellDays: { label: 'Vender 10 dias (abono pecuniário)' },
    dependents: { label: 'Dependentes' },
    deduction: { label: 'Tipo de dedução do IR', optionLabels: deductionLabels },
    year: competenceHint(SUPPORTED_IR_YEARS),
  },
  outputLabels: { daysEntitled: 'Dias de direito', daysEnjoyed: 'Dias a gozar', vacationPay: 'Férias (R$)', constitutionalThird: '1/3 constitucional (R$)', soldDaysPay: 'Abono pecuniário + 1/3 (R$)', gross: 'Total bruto (R$)', inss: 'INSS (R$)', irrf: 'Imposto de renda (R$)', net: 'Líquido a receber (R$)', note: 'Importante' },
  examples: [{ description: '30 dias com salário de R$ 3.000 (2026)', input: { salary: 3000, averageVariable: 0, absences: 0, sellDays: false, dependents: 0, deduction: 'auto', year: 2026 }, output: { daysEntitled: 30, vacationPay: 3000, constitutionalThird: 1000, gross: 4000 } }],
  documentation:
    `Férias = salário ÷ 30 × dias gozados, mais 1/3 constitucional (CF, art. 7º, XVII). O número de dias depende das faltas injustificadas (CLT, art. 130). Os descontos de INSS e IR incidem sobre as férias gozadas e o terço, calculados isoladamente; se parte das férias cair no mês seguinte ou houver outros rendimentos no mês, o desconto real pode diferir. ${LEGAL_NOTE}`,
});

// ---------- FGTS ----------

export const fgtsTool = defineTool({
  id: 'fgts',
  name: 'Calculadora de FGTS',
  description: 'Projeta o saldo do FGTS com os depósitos mensais de 8% e calcula a multa de 40% ou 20% na demissão',
  category: 'calculadoras',
  keywords: ['fgts', 'fundo de garantia', 'multa 40%', 'saldo', 'depósito', 'rescisão', 'saque'],
  icon: '🏦',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: salaryField,
    currentBalance: money().default(0),
    months: z.number().int().min(0).max(600).default(12),
    depositPercent: z.number().min(0).max(20).default(8),
    yearlyRate: z.number().min(0).max(50).default(3),
    dismissal: z.enum(['without_cause', 'agreement', 'other']).default('without_cause'),
  }),
  outputSchema: z.object({ monthlyDeposit: z.number(), projectedBalance: z.number(), penalty: z.number(), withdrawable: z.number(), note: z.string() }),
  execute: ({ salary, currentBalance, months, depositPercent, yearlyRate, dismissal }) => {
    const deposit = (salary * depositPercent) / 100;
    const monthly = (1 + yearlyRate / 100) ** (1 / 12) - 1;
    let balance = currentBalance;
    for (let m = 0; m < months; m++) balance = balance * (1 + monthly) + deposit;
    const penaltyRate = dismissal === 'without_cause' ? 0.4 : dismissal === 'agreement' ? 0.2 : 0;
    const withdrawRate = dismissal === 'without_cause' ? 1 : dismissal === 'agreement' ? 0.8 : 0;
    return {
      monthlyDeposit: round2(deposit), projectedBalance: round2(balance), penalty: round2(balance * penaltyRate), withdrawable: round2(balance * withdrawRate + balance * penaltyRate),
      note: `O FGTS rende 3% ao ano mais a TR (aqui, apenas os 3%; informe uma taxa maior para incluir a TR). A multa é paga pelo empregador sobre o saldo e é depositada na conta, além do valor sacável. ${LEGAL_NOTE}`,
    };
  },
  fields: {
    salary: { label: 'Salário mensal (R$)', help: 'Base dos depósitos: o FGTS incide também sobre horas extras, comissões, 13º e férias.' },
    currentBalance: { label: 'Saldo atual do FGTS (R$)' },
    months: { label: 'Meses de depósitos futuros' },
    depositPercent: { label: 'Percentual do depósito (%)', help: '8% para empregados em geral; 2% para aprendizes.' },
    yearlyRate: { label: 'Rendimento anual (%)', help: '3% ao ano mais a TR (que tem sido próxima de zero).' },
    dismissal: { label: 'Tipo de demissão', optionLabels: { without_cause: 'Sem justa causa (multa de 40%, saque de 100%)', agreement: 'Acordo (multa de 20%, saque de 80%)', other: 'Pedido de demissão ou justa causa (sem multa, sem saque)' } },
  },
  outputLabels: { monthlyDeposit: 'Depósito mensal (R$)', projectedBalance: 'Saldo projetado (R$)', penalty: 'Multa rescisória (R$)', withdrawable: 'Valor sacável na demissão (R$)', note: 'Importante' },
  examples: [{ description: '12 depósitos de R$ 3.000 sem rendimento', input: { salary: 3000, currentBalance: 0, months: 12, depositPercent: 8, yearlyRate: 0, dismissal: 'without_cause' }, output: { monthlyDeposit: 240, projectedBalance: 2880, penalty: 1152 } }],
  documentation:
    `O empregador deposita 8% da remuneração por mês na conta do trabalhador (Lei 8.036/1990). Na dispensa sem justa causa paga multa de 40% sobre o saldo; no acordo (CLT, art. 484-A), 20% e saque de 80%. A contribuição social adicional de 10% foi extinta em 2020. ${LEGAL_NOTE}`,
});
