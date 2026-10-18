import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { round2, roundTo } from './calc-math.js';
import { calcNetSalary } from './payroll.js';
import { MEI_ANNUAL_LIMIT, calcPj, type PjRegime } from './payroll2.js';
import { MINIMUM_WAGE, SUPPORTED_INSS_YEARS, SUPPORTED_IR_YEARS, minimumWage } from './payroll-data.js';

const NOTE =
  'Estimativa informativa com as regras e tabelas indicadas; não substitui o cálculo do contador ou do departamento pessoal nem convenções coletivas.';

const money = (max = 1e9) => z.number().finite().min(0).max(max);
const percent = (max = 100) => z.number().finite().min(0).max(max);
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FOLHA_YEARS = SUPPORTED_IR_YEARS.filter((y) => SUPPORTED_INSS_YEARS.includes(y));
const latestFolhaYear = Math.max(...FOLHA_YEARS);
const folhaYear = z.coerce.number().int().refine((y) => FOLHA_YEARS.includes(y), { message: `Competências disponíveis: ${FOLHA_YEARS.join(', ')}` }).default(latestFolhaYear);

// ---------- CLT x PJ ----------

export interface CltPackage {
  monthlyNet: number;
  vacationNet: number;
  thirteenthNet: number;
  annualNet: number;
  fgtsAnnual: number;
  benefitsAnnual: number;
  total: number;
}

/**
 * Ano de um CLT: 11 meses normais, 1 mês com férias (salário + 1/3) e 13º, cada um tributado à parte,
 * mais os depósitos do FGTS (que a empresa paga em cima do salário, férias com 1/3 e 13º) e os benefícios.
 */
export function cltYear(gross: number, benefitsMonthly: number, dependents: number, year: number): CltPackage {
  const net = (g: number) => calcNetSalary({ gross: g, dependents, pension: 0, transportDiscount: 0, other: 0, deduction: 'auto', year }).net;
  const monthlyNet = net(gross);
  const vacationNet = net((gross * 4) / 3);
  const thirteenthNet = monthlyNet;
  const annualNet = 11 * monthlyNet + vacationNet + thirteenthNet;
  const fgtsAnnual = 0.08 * (gross * 12 + gross / 3 + gross);
  const benefitsAnnual = benefitsMonthly * 12;
  return { monthlyNet: round2(monthlyNet), vacationNet: round2(vacationNet), thirteenthNet: round2(thirteenthNet), annualNet: round2(annualNet), fgtsAnnual: round2(fgtsAnnual), benefitsAnnual: round2(benefitsAnnual), total: round2(annualNet + fgtsAnnual + benefitsAnnual) };
}

export interface PjOptions {
  regime: PjRegime;
  proLabore: number | undefined;
  expenses: number;
  dependents: number;
  year: number;
}

/** Líquido pessoal mensal do PJ para um faturamento; sem pró-labore informado, usa o necessário para o Fator R (28%) ou o salário mínimo. */
export function pjMonthlyNet(revenue: number, o: PjOptions): number {
  const wage = minimumWage(o.year);
  const proLabore = o.proLabore ?? (o.regime === 'simples_factor_r' ? Math.max(wage, revenue * 0.28) : wage);
  return calcPj({ monthlyRevenue: revenue, proLabore, expenses: o.expenses, regime: o.regime, dependents: o.dependents, year: o.year }).personalNet;
}

/** Menor faturamento mensal em que o PJ iguala o pacote CLT (busca binária); `undefined` quando não se aplica. */
export function breakEvenRevenue(target: number, paidShare: number, o: PjOptions): number | undefined {
  if (o.regime.startsWith('mei')) return undefined;
  const value = (r: number): number => {
    try {
      return pjMonthlyNet(r, o) * paidShare;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  let lo = 1;
  let hi = 395_000;
  if (value(hi) < target) return undefined;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (value(mid) >= target) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

export const cltVsPjTool = defineTool({
  id: 'clt-vs-pj',
  name: 'Calculadora CLT ou PJ: qual compensa mais?',
  description: 'Compara o ganho líquido de um emprego CLT (com 13º, férias, FGTS e benefícios) com o de um contrato PJ no Simples ou MEI, e mostra quanto o PJ precisa faturar para empatar',
  category: 'calculadoras',
  keywords: ['clt ou pj', 'clt vs pj', 'clt x pj', 'vale a pena pj', 'comparar clt e pj', 'salário pj equivalente', 'quanto cobrar como pj', 'simples nacional', 'mei', 'proposta de emprego'],
  icon: '⚖️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    cltSalary: money().default(6000),
    cltBenefits: money().default(0),
    pjRevenue: money(400_000).default(9000),
    regime: z.enum(['simples_factor_r', 'simples_iii', 'simples_v', 'mei_services']).default('simples_factor_r'),
    proLabore: money().optional(),
    pjExpenses: money().default(300),
    unpaidMonths: z.number().min(0).max(6).default(1),
    dependents: z.number().int().min(0).max(30).default(0),
    year: folhaYear,
  }),
  outputSchema: z.object({
    cltMonthlyNet: z.number(), cltAnnualNet: z.number(), cltFgtsAnnual: z.number(), cltBenefitsAnnual: z.number(), cltMonthlyEquivalent: z.number(),
    pjMonthlyNet: z.number(), pjAnnualNet: z.number(), pjMonthlyEquivalent: z.number(),
    difference: z.number(), verdict: z.string(), breakEvenRevenue: z.number().optional(), notes: z.string(),
  }),
  execute: (v) => {
    if (v.cltSalary <= 0) throw new ToolError('Informe o salário CLT');
    if (v.pjRevenue <= 0) throw new ToolError('Informe o faturamento PJ');
    const clt = cltYear(v.cltSalary, v.cltBenefits, v.dependents, v.year);
    const opts: PjOptions = { regime: v.regime, proLabore: v.proLabore, expenses: v.pjExpenses, dependents: v.dependents, year: v.year };
    const monthlyPj = pjMonthlyNet(v.pjRevenue, opts);
    const paidShare = (12 - v.unpaidMonths) / 12;
    const pjAnnual = monthlyPj * (12 - v.unpaidMonths);
    const cltEq = clt.total / 12;
    const pjEq = pjAnnual / 12;
    const diff = round2(pjEq - cltEq);
    const be = breakEvenRevenue(cltEq, paidShare, opts);
    const verdict =
      Math.abs(diff) < 1
        ? 'Empate: os dois cenários rendem praticamente o mesmo por mês.'
        : diff > 0
          ? `O PJ rende ${reais(diff)} a mais por mês (média anual), antes de considerar a falta de FGTS-multa, seguro-desemprego e estabilidade.`
          : `O CLT rende ${reais(-diff)} a mais por mês (média anual).`;
    return {
      cltMonthlyNet: clt.monthlyNet,
      cltAnnualNet: clt.annualNet,
      cltFgtsAnnual: clt.fgtsAnnual,
      cltBenefitsAnnual: clt.benefitsAnnual,
      cltMonthlyEquivalent: round2(cltEq),
      pjMonthlyNet: round2(monthlyPj),
      pjAnnualNet: round2(pjAnnual),
      pjMonthlyEquivalent: round2(pjEq),
      difference: diff,
      verdict,
      ...(be === undefined ? {} : { breakEvenRevenue: be }),
      notes: `No CLT entram 11 salários líquidos, 1 mês de férias com 1/3, o 13º, o FGTS depositado pela empresa e os benefícios que você informar. No PJ entram o imposto do regime, o INSS e o IR do pró-labore e as despesas, descontados os meses sem faturar. Não inclui multa do FGTS, seguro-desemprego, estabilidades, plano de saúde pago por conta própria, nem contador além do que você puser em despesas. ${NOTE}`,
    };
  },
  fields: {
    cltSalary: { label: 'Salário bruto CLT (R$)' },
    cltBenefits: { label: 'Benefícios mensais no CLT (R$)', help: 'Vale-refeição, plano de saúde pago pela empresa etc. Conte pelo valor que você pagaria do seu bolso.' },
    pjRevenue: { label: 'Faturamento mensal PJ (R$)', help: 'O valor da nota que você emitiria.' },
    regime: {
      label: 'Regime do PJ',
      optionLabels: { simples_factor_r: 'Simples Nacional com Fator R automático', simples_iii: 'Simples Nacional, Anexo III', simples_v: 'Simples Nacional, Anexo V', mei_services: 'MEI (serviços)' },
    },
    proLabore: { label: 'Pró-labore mensal (R$)', help: 'Opcional. Se vazio: o necessário para o Fator R de 28% (Fator R automático) ou o salário mínimo.' },
    pjExpenses: { label: 'Despesas mensais do PJ (R$)', help: 'Contador, taxas, ferramentas.' },
    unpaidMonths: { label: 'Meses por ano sem faturar (férias)', help: 'No PJ, férias e doença não são pagas. Padrão: 1 mês.' },
    dependents: { label: 'Dependentes (IR)' },
    year: { label: 'Competência (ano das tabelas)', help: `Tabelas cadastradas: ${FOLHA_YEARS.join(', ')}.` },
  },
  outputLabels: {
    cltMonthlyNet: 'CLT: líquido de um mês comum (R$)', cltAnnualNet: 'CLT: líquido no ano com férias e 13º (R$)', cltFgtsAnnual: 'CLT: FGTS depositado no ano (R$)', cltBenefitsAnnual: 'CLT: benefícios no ano (R$)',
    cltMonthlyEquivalent: 'CLT: equivalente por mês (R$)', pjMonthlyNet: 'PJ: líquido de um mês faturado (R$)', pjAnnualNet: 'PJ: líquido no ano (R$)', pjMonthlyEquivalent: 'PJ: equivalente por mês (R$)',
    difference: 'PJ menos CLT por mês (R$)', verdict: 'Resultado', breakEvenRevenue: 'Faturamento PJ para empatar (R$/mês)', notes: 'Observações',
  },
  examples: [{ description: 'CLT de R$ 6.000 contra PJ de R$ 9.000', input: { cltSalary: 6000, cltBenefits: 0, pjRevenue: 9000, regime: 'simples_factor_r', pjExpenses: 300, unpaidMonths: 1, dependents: 0, year: 2026 } }],
  documentation:
    'O CLT paga 12 salários mais o 13º e as férias com 1/3, e a empresa deposita 8% de FGTS por fora. O PJ não tem nada disso: o que entra é o faturamento menos o imposto do regime, o INSS e o IR do pró-labore (parte do ganho é salário, parte é distribuição de lucros isenta) e as despesas, e as férias saem do próprio bolso. Por isso o PJ precisa faturar mais para empatar; a ferramenta calcula esse ponto por busca numérica. Os valores usam as tabelas de INSS e IR cadastradas e o Simples Nacional (Anexos III e V, Fator R).',
});

// ---------- custo de um funcionário ----------

export interface EmployeeCost {
  salary: number;
  thirteenth: number;
  vacation: number;
  fgts: number;
  employerInss: number;
  rat: number;
  thirdParties: number;
  benefits: number;
  fgtsFine: number;
  monthly: number;
}

export function employeeCost(i: { salary: number; benefits: number; simples: boolean; ratPercent: number; thirdPartiesPercent: number; includeFgtsFine: boolean }): EmployeeCost {
  const thirteenth = i.salary / 12;
  const vacation = (i.salary / 12) * (4 / 3);
  // O INSS patronal incide sobre salário, 13º e férias, sem o terço constitucional; o FGTS incide também sobre o terço.
  const inssBase = i.salary + thirteenth + i.salary / 12;
  const fgtsBase = i.salary + thirteenth + vacation;
  const fgts = 0.08 * fgtsBase;
  const employerInss = i.simples ? 0 : 0.2 * inssBase;
  const rat = i.simples ? 0 : (i.ratPercent / 100) * inssBase;
  const thirdParties = i.simples ? 0 : (i.thirdPartiesPercent / 100) * inssBase;
  const fgtsFine = i.includeFgtsFine ? 0.4 * fgts : 0;
  const monthly = i.salary + thirteenth + vacation + fgts + employerInss + rat + thirdParties + i.benefits + fgtsFine;
  const r = (n: number) => round2(n);
  return { salary: r(i.salary), thirteenth: r(thirteenth), vacation: r(vacation), fgts: r(fgts), employerInss: r(employerInss), rat: r(rat), thirdParties: r(thirdParties), benefits: r(i.benefits), fgtsFine: r(fgtsFine), monthly: r(monthly) };
}

export const employeeCostTool = defineTool({
  id: 'custo-funcionario',
  name: 'Calculadora do Custo de um Funcionário para a Empresa',
  description: 'Calcula quanto um funcionário CLT custa de verdade por mês: salário, 13º, férias com 1/3, FGTS, INSS patronal, RAT, terceiros e benefícios, no Simples ou no lucro presumido',
  category: 'calculadoras',
  keywords: ['custo de funcionário', 'custo de um funcionário', 'encargos trabalhistas', 'quanto custa um funcionário', 'encargos sobre folha', 'inss patronal', 'rat', 'provisão de férias e 13º', 'custo clt para empresa', 'contratar funcionário'],
  icon: '🏢',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    salary: money().default(3000),
    benefits: money().default(0),
    regime: z.enum(['simples', 'presumido']).default('simples'),
    ratPercent: percent(10).default(2),
    thirdPartiesPercent: percent(10).default(5.8),
    includeFgtsFine: z.boolean().default(false),
  }),
  outputSchema: z.object({
    salary: z.number(), thirteenth: z.number(), vacation: z.number(), fgts: z.number(), employerInss: z.number(), rat: z.number(), thirdParties: z.number(), benefits: z.number(), fgtsFine: z.number(),
    monthlyCost: z.number(), annualCost: z.number(), multiplier: z.number(), notes: z.string(),
  }),
  execute: (v) => {
    if (v.salary <= 0) throw new ToolError('Informe o salário bruto');
    const c = employeeCost({ salary: v.salary, benefits: v.benefits, simples: v.regime === 'simples', ratPercent: v.ratPercent, thirdPartiesPercent: v.thirdPartiesPercent, includeFgtsFine: v.includeFgtsFine });
    return {
      salary: c.salary, thirteenth: c.thirteenth, vacation: c.vacation, fgts: c.fgts, employerInss: c.employerInss, rat: c.rat, thirdParties: c.thirdParties, benefits: c.benefits, fgtsFine: c.fgtsFine,
      monthlyCost: c.monthly,
      annualCost: round2(c.monthly * 12),
      multiplier: roundTo(c.monthly / v.salary, 2),
      notes: `${v.regime === 'simples' ? 'No Simples Nacional (anexos I, II, III e V) a contribuição patronal já está dentro do DAS, então só o FGTS entra como encargo. Para o Anexo IV ou para atividades com regra própria, use "lucro presumido ou real".' : 'No lucro presumido ou real: 20% de INSS patronal, mais RAT (1% a 3%, vezes o FAP da empresa) e terceiros (por volta de 5,8%, varia por atividade).'} As provisões de 13º e de férias (com 1/3) são tratadas como custo mensal. Não inclui vale-transporte descontado do empregado, horas extras, adicionais, rescisão nem exames. ${NOTE}`,
    };
  },
  fields: {
    salary: { label: 'Salário bruto (R$)' },
    benefits: { label: 'Benefícios mensais pagos pela empresa (R$)', help: 'Vale-refeição, plano de saúde, vale-transporte da parte da empresa etc.' },
    regime: { label: 'Regime tributário da empresa', optionLabels: { simples: 'Simples Nacional (anexos I, II, III, V)', presumido: 'Lucro presumido ou real (e Anexo IV)' } },
    ratPercent: { label: 'RAT (%)', help: '1%, 2% ou 3% conforme o risco da atividade, multiplicado pelo FAP. Só no lucro presumido ou real.' },
    thirdPartiesPercent: { label: 'Terceiros (%)', help: 'Sistema S, salário-educação e INCRA. Por volta de 5,8%, varia por atividade. Só no lucro presumido ou real.' },
    includeFgtsFine: { label: 'Provisionar a multa de 40% do FGTS', help: 'Para quem quer reservar o custo de uma eventual demissão sem justa causa.' },
  },
  outputLabels: {
    salary: 'Salário (R$)', thirteenth: 'Provisão de 13º (R$)', vacation: 'Provisão de férias com 1/3 (R$)', fgts: 'FGTS 8% (R$)', employerInss: 'INSS patronal 20% (R$)', rat: 'RAT (R$)', thirdParties: 'Terceiros (R$)',
    benefits: 'Benefícios (R$)', fgtsFine: 'Provisão da multa do FGTS (R$)', monthlyCost: 'Custo mensal total (R$)', annualCost: 'Custo anual (R$)', multiplier: 'Custo ÷ salário (vezes)', notes: 'Observações',
  },
  examples: [{ description: 'Salário de R$ 3.000 no Simples', input: { salary: 3000, benefits: 0, regime: 'simples', ratPercent: 2, thirdPartiesPercent: 5.8, includeFgtsFine: false }, output: { salary: 3000, thirteenth: 250 } }],
  documentation:
    'Custo mensal = salário + 1/12 de 13º + 1/12 de férias com 1/3 + FGTS de 8% (sobre salário, 13º e férias com 1/3) + contribuições patronais + benefícios. Fora do Simples, a contribuição patronal é 20% de INSS + RAT + terceiros sobre salário, 13º e férias (sem o terço constitucional, conforme a jurisprudência do STJ). Resultados típicos: de 1,3 a 1,4 vez o salário no Simples e de 1,6 a 1,8 vez no lucro presumido, sem benefícios. É uma estimativa para orçar; a folha real depende de convenção coletiva, FAP e do enquadramento.',
});

// ---------- DAS-MEI ----------

export type MeiActivity = 'commerce' | 'services' | 'both';

export function meiDas(activity: MeiActivity, year: number): { inss: number; icms: number; iss: number; total: number } {
  const inss = round2(minimumWage(year) * 0.05);
  const icms = activity === 'services' ? 0 : 1;
  const iss = activity === 'commerce' ? 0 : 5;
  return { inss, icms, iss, total: round2(inss + icms + iss) };
}

const MEI_YEARS = Object.keys(MINIMUM_WAGE).map(Number);

export const meiDasTool = defineTool({
  id: 'das-mei',
  name: 'Calculadora do DAS MEI (valor da guia mensal)',
  description: 'Mostra o valor do DAS do MEI por atividade (comércio, serviços ou os dois), o custo no ano, o limite de faturamento e o que acontece se passar dele',
  category: 'calculadoras',
  keywords: ['das mei', 'valor do das mei', 'mei 2026', 'guia mei', 'quanto paga o mei', 'limite do mei', 'faturamento mei', 'imposto mei', 'desenquadramento', 'microempreendedor individual'],
  icon: '🧾',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    activity: z.enum(['commerce', 'services', 'both']).default('services'),
    year: z.coerce.number().int().refine((y) => MEI_YEARS.includes(y), { message: `Competências disponíveis: ${MEI_YEARS.join(', ')}` }).default(Math.max(...MEI_YEARS)),
    monthsActive: z.number().int().min(1).max(12).default(12),
    revenueYear: money(100_000_000).optional(),
  }),
  outputSchema: z.object({
    das: z.number(), inss: z.number(), icms: z.number(), iss: z.number(), dueDay: z.string(), annualCost: z.number(), annualLimit: z.number(), tolerance: z.number(), status: z.string(), source: z.string(),
  }),
  execute: ({ activity, year, monthsActive, revenueYear }) => {
    const d = meiDas(activity, year);
    const limit = round2((MEI_ANNUAL_LIMIT / 12) * monthsActive);
    const tolerance = round2(limit * 1.2);
    let status = `Informe o faturamento do ano para conferir o limite.`;
    if (revenueYear !== undefined) {
      if (revenueYear <= limit) status = `Dentro do limite: faltam ${reais(limit - revenueYear)}.`;
      else if (revenueYear <= tolerance) status = `Passou do limite em ${reais(revenueYear - limit)} (até 20%): segue como MEI até o fim do ano, com DAS complementar sobre o excedente, e vira ME no ano seguinte.`;
      else status = `Passou mais de 20% do limite (${reais(revenueYear - limit)} acima): o desenquadramento vale desde 1º de janeiro do ano (ou desde a abertura); procure um contador.`;
    }
    return {
      das: d.total, inss: d.inss, icms: d.icms, iss: d.iss, dueDay: 'Dia 20 de cada mês',
      annualCost: round2(d.total * monthsActive), annualLimit: limit, tolerance, status,
      source: `INSS: 5% do salário mínimo de ${year} (${reais(minimumWage(year))}); ICMS (R$ 1,00) para comércio e indústria; ISS (R$ 5,00) para serviços. LC 123/2006, art. 18-A. Limite: R$ 81.000 por ano, ou R$ 6.750 por mês de atividade no ano de abertura.`,
    };
  },
  fields: {
    activity: { label: 'Atividade do MEI', optionLabels: { commerce: 'Comércio ou indústria', services: 'Serviços', both: 'Comércio e serviços' } },
    year: { label: 'Ano' },
    monthsActive: { label: 'Meses de atividade no ano', help: 'No ano de abertura, conte o mês da abertura. O limite é proporcional: R$ 6.750 por mês.' },
    revenueYear: { label: 'Faturamento do ano até agora (R$)', help: 'Opcional. Serve para checar o limite.' },
  },
  outputLabels: {
    das: 'Valor do DAS por mês (R$)', inss: 'Parte do INSS (R$)', icms: 'ICMS (R$)', iss: 'ISS (R$)', dueDay: 'Vencimento', annualCost: 'Custo no ano (R$)', annualLimit: 'Limite de faturamento do ano (R$)',
    tolerance: 'Limite com a tolerância de 20% (R$)', status: 'Situação', source: 'Base do cálculo',
  },
  examples: [{ description: 'MEI de serviços em 2026', input: { activity: 'services', year: 2026, monthsActive: 12 }, output: { das: 86.05, inss: 81.05, iss: 5 } }],
  documentation:
    'O DAS-MEI é fixo: 5% do salário mínimo (INSS) mais R$ 1,00 de ICMS para comércio e indústria e/ou R$ 5,00 de ISS para serviços. Vence todo dia 20. O limite de faturamento é R$ 81.000 por ano (R$ 6.750 por mês de atividade no ano de abertura). Passando até 20% do limite, o MEI paga DAS complementar sobre o excedente e vira microempresa no ano seguinte; passando mais de 20%, o desenquadramento é retroativo a janeiro do ano. O valor muda quando o salário mínimo muda.',
});

// ---------- markup ----------

export const markupTool = defineTool({
  id: 'markup',
  name: 'Calculadora de Markup e Preço de Venda',
  description: 'Calcula o preço de venda a partir do custo, dos impostos, da comissão e da margem de lucro desejada, e mostra a diferença entre markup e margem',
  category: 'calculadoras',
  keywords: ['markup', 'calcular markup', 'preço de venda', 'formação de preço', 'margem de lucro', 'markup divisor', 'quanto cobrar', 'precificação', 'margem x markup', 'custo e lucro'],
  icon: '🏷️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['price', 'analyze']).default('price'),
    cost: money().default(50),
    taxesPercent: percent(99).default(10),
    commissionPercent: percent(99).default(5),
    otherPercent: percent(99).default(0),
    profitPercent: percent(99).default(20),
    salePrice: money().default(100),
  }),
  outputSchema: z.object({
    price: z.number(), markupPercent: z.number(), multiplier: z.number(), grossMarginPercent: z.number(), variableCosts: z.number(), netProfit: z.number(), netMarginPercent: z.number(), grossProfit: z.number(),
  }),
  execute: ({ mode, cost, taxesPercent, commissionPercent, otherPercent, profitPercent, salePrice }) => {
    if (cost <= 0) throw new ToolError('Informe o custo do produto ou serviço');
    const variable = taxesPercent + commissionPercent + otherPercent;
    let price: number;
    if (mode === 'price') {
      const sum = variable + profitPercent;
      if (sum >= 100) throw new ToolError('Impostos, comissão, outras despesas e lucro somam 100% ou mais do preço: não existe preço que feche a conta');
      price = cost / (1 - sum / 100);
    } else {
      if (salePrice <= 0) throw new ToolError('Informe o preço de venda');
      price = salePrice;
    }
    const variableCosts = (price * variable) / 100;
    const netProfit = price - cost - variableCosts;
    return {
      price: round2(price),
      markupPercent: roundTo(((price - cost) / cost) * 100, 2),
      multiplier: roundTo(price / cost, 4),
      grossMarginPercent: roundTo(((price - cost) / price) * 100, 2),
      variableCosts: round2(variableCosts),
      netProfit: round2(netProfit),
      netMarginPercent: roundTo((netProfit / price) * 100, 2),
      grossProfit: round2(price - cost),
    };
  },
  fields: {
    mode: { label: 'O que calcular', optionLabels: { price: 'Preço de venda para atingir o lucro desejado', analyze: 'Margem e markup de um preço que já pratico' } },
    cost: { label: 'Custo do produto ou serviço (R$)' },
    taxesPercent: { label: 'Impostos sobre a venda (%)', help: 'Simples, ICMS, ISS etc., como % do preço.' },
    commissionPercent: { label: 'Comissão de venda (%)' },
    otherPercent: { label: 'Outras despesas variáveis (%)', help: 'Taxa de cartão, frete, marketplace etc.' },
    profitPercent: { label: 'Lucro líquido desejado (% do preço)', help: 'Usado no modo "preço de venda".' },
    salePrice: { label: 'Preço de venda atual (R$)', help: 'Usado no modo "margem e markup".' },
  },
  outputLabels: {
    price: 'Preço de venda (R$)', markupPercent: 'Markup (%)', multiplier: 'Multiplicador (preço ÷ custo)', grossMarginPercent: 'Margem bruta (%)', variableCosts: 'Impostos e despesas variáveis (R$)',
    netProfit: 'Lucro líquido por unidade (R$)', netMarginPercent: 'Margem líquida (%)', grossProfit: 'Lucro bruto por unidade (R$)',
  },
  examples: [{ description: 'Custo de R$ 50 com 35% de impostos, comissão e lucro', input: { mode: 'price', cost: 50, taxesPercent: 10, commissionPercent: 5, otherPercent: 0, profitPercent: 20, salePrice: 100 }, output: { price: 76.92, multiplier: 1.5385 } }],
  documentation:
    'Markup é quanto se soma ao custo: (preço − custo) ÷ custo. Margem é quanto sobra do preço: (preço − custo) ÷ preço. Um markup de 100% equivale a uma margem de 50%. Para formar o preço com tudo que incide sobre a venda, usa-se o markup divisor: preço = custo ÷ (1 − (impostos + comissão + outras despesas + lucro) em fração). Se a soma dos percentuais chegar a 100%, não há preço possível.',
});

// ---------- renda fixa: CDB, LCI/LCA e poupança ----------

export function irRateForDays(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

/** Fator de rendimento de um papel que paga uma porcentagem do CDI, em dias úteis (252 por ano). */
export function cdiFactor(cdiAnnualPercent: number, percentOfCdi: number, businessDays: number): number {
  const daily = (1 + cdiAnnualPercent / 100) ** (1 / 252) - 1;
  return (1 + daily * (percentOfCdi / 100)) ** businessDays;
}

/** Rendimento mensal da poupança: 0,5% ao mês com Selic acima de 8,5% ao ano; senão 70% da Selic (a.a.) ÷ 12; mais a TR. */
export function savingsMonthlyRate(selicAnnualPercent: number, trMonthlyPercent: number): number {
  const base = selicAnnualPercent > 8.5 ? 0.005 : (0.7 * selicAnnualPercent) / 100 / 12;
  return (1 + base) * (1 + trMonthlyPercent / 100) - 1;
}

export const fixedIncomeTool = defineTool({
  id: 'renda-fixa',
  name: 'Simulador de CDB, LCI/LCA e Poupança',
  description: 'Compara quanto rendem CDB, LCI/LCA e poupança no mesmo prazo, já descontado o imposto de renda regressivo, com as taxas que você informar',
  category: 'calculadoras',
  keywords: ['simulador cdb', 'cdb ou poupança', 'lci lca', 'rendimento cdb', 'quanto rende', 'imposto de renda cdb', 'ir regressivo', 'cdi', 'selic', 'poupança rende quanto', 'investimento renda fixa'],
  icon: '📊',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    amount: money(1e12).default(10_000),
    months: z.number().int().min(1).max(600).default(12),
    cdiAnnualPercent: percent(100).default(14.9),
    selicAnnualPercent: percent(100).default(15),
    cdbPercentCdi: percent(500).default(100),
    lciPercentCdi: percent(500).default(90),
    trMonthlyPercent: z.number().finite().min(0).max(5).default(0),
  }),
  outputSchema: z.object({
    cdbGross: z.number(), cdbIrRate: z.number(), cdbIr: z.number(), cdbNet: z.number(), cdbReturnPercent: z.number(),
    lciNet: z.number(), lciReturnPercent: z.number(), savingsNet: z.number(), savingsReturnPercent: z.number(), best: z.string(), notes: z.string(),
  }),
  execute: (v) => {
    if (v.amount <= 0) throw new ToolError('Informe o valor a investir');
    const days = Math.round((v.months * 365) / 12);
    const businessDays = Math.round((days * 252) / 365);
    const cdbGross = v.amount * cdiFactor(v.cdiAnnualPercent, v.cdbPercentCdi, businessDays);
    const irRate = irRateForDays(days);
    const cdbIr = (cdbGross - v.amount) * irRate;
    const cdbNet = cdbGross - cdbIr;
    const lci = v.amount * cdiFactor(v.cdiAnnualPercent, v.lciPercentCdi, businessDays);
    const savings = v.amount * (1 + savingsMonthlyRate(v.selicAnnualPercent, v.trMonthlyPercent)) ** v.months;
    const ret = (final: number) => roundTo(((final - v.amount) / v.amount) * 100, 2);
    const ranking = [
      { name: 'CDB', value: cdbNet },
      { name: 'LCI/LCA', value: lci },
      { name: 'Poupança', value: savings },
    ].sort((a, b) => b.value - a.value);
    const best = ranking[0] as { name: string; value: number };
    return {
      cdbGross: round2(cdbGross), cdbIrRate: roundTo(irRate * 100, 1), cdbIr: round2(cdbIr), cdbNet: round2(cdbNet), cdbReturnPercent: ret(cdbNet),
      lciNet: round2(lci), lciReturnPercent: ret(lci), savingsNet: round2(savings), savingsReturnPercent: ret(savings),
      best: `${best.name}, com ${reais(round2(best.value))} no fim de ${v.months} ${v.months === 1 ? 'mês' : 'meses'} (${days} dias corridos).`,
      notes: `As taxas padrão são só exemplos: informe o CDI e a Selic atuais (Banco Central). O CDB tem IR regressivo de 22,5% (até 180 dias), 20% (181 a 360), 17,5% (361 a 720) e 15% (acima de 720), e não paga IOF a partir do 30º dia. LCI e LCA são isentas de IR para pessoa física. A poupança rende 0,5% ao mês enquanto a Selic estiver acima de 8,5% ao ano. Os dias úteis são estimados (252 por ano); feriados mudam o resultado um pouco. Não é recomendação de investimento, e o FGC cobre até R$ 250 mil por CPF e instituição.`,
    };
  },
  fields: {
    amount: { label: 'Valor investido (R$)' },
    months: { label: 'Prazo (meses)' },
    cdiAnnualPercent: { label: 'CDI atual (% ao ano)', help: 'Valor de exemplo: consulte a taxa vigente no Banco Central ou na B3.' },
    selicAnnualPercent: { label: 'Selic atual (% ao ano)', help: 'Define o rendimento da poupança.' },
    cdbPercentCdi: { label: 'CDB: % do CDI', help: 'Por exemplo, 100 para um CDB que paga 100% do CDI.' },
    lciPercentCdi: { label: 'LCI/LCA: % do CDI' },
    trMonthlyPercent: { label: 'TR do mês (%)', help: 'Opcional. Costuma ser zero ou perto disso.' },
  },
  outputLabels: {
    cdbGross: 'CDB: valor bruto (R$)', cdbIrRate: 'CDB: alíquota de IR (%)', cdbIr: 'CDB: imposto de renda (R$)', cdbNet: 'CDB: valor líquido (R$)', cdbReturnPercent: 'CDB: rendimento líquido (%)',
    lciNet: 'LCI/LCA: valor líquido (R$)', lciReturnPercent: 'LCI/LCA: rendimento (%)', savingsNet: 'Poupança: valor final (R$)', savingsReturnPercent: 'Poupança: rendimento (%)', best: 'Maior valor líquido', notes: 'Observações',
  },
  examples: [{ description: 'R$ 10.000 por 12 meses', input: { amount: 10000, months: 12, cdiAnnualPercent: 14.9, selicAnnualPercent: 15, cdbPercentCdi: 100, lciPercentCdi: 90, trMonthlyPercent: 0 }, output: { cdbIrRate: 17.5 } }],
  documentation:
    'O CDB paga uma porcentagem do CDI sobre os dias úteis; o imposto de renda é cobrado só sobre o lucro, com alíquota que diminui com o prazo. LCI e LCA costumam pagar menos do CDI, mas não têm IR para pessoa física, e por isso uma LCI a 90% do CDI pode render mais líquido que um CDB a 100% em prazos curtos. A poupança tem regra própria, ligada à Selic. A ferramenta usa as taxas que você digitar; ela não consulta cotações.',
});
