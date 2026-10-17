import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { parseNumbers, round2, roundTo } from './calc-math.js';

const money = (max = 1e12) => z.number().finite().min(0).max(max);
const pct = (max = 1000) => z.number().finite().min(0).max(max);

/** Dias comerciais por unidade de tempo (mês de 30 dias, ano de 360), convenção usual em juros simples. */
const DAYS = { day: 1, month: 30, year: 360 } as const;
type Period = keyof typeof DAYS;

const convertTime = (time: number, from: Period, to: Period) => (time * DAYS[from]) / DAYS[to];

/** Parcela de uma série uniforme postecipada (Tabela Price). */
export function pmt(principal: number, ratePercent: number, n: number): number {
  const i = ratePercent / 100;
  if (i === 0) return principal / n;
  return (principal * i) / (1 - (1 + i) ** -n);
}

// ---------- juros simples ----------

export const simpleInterestTool = defineTool({
  id: 'juros-simples',
  name: 'Calculadora de Juros Simples',
  description: 'Calcula juros e montante pelo regime de juros simples',
  category: 'calculadoras',
  keywords: ['juros simples', 'montante', 'capital', 'taxa', 'rendimento', 'matemática financeira'],
  icon: '➕',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    capital: money().default(1000),
    rate: pct().default(2),
    ratePeriod: z.enum(['day', 'month', 'year']).default('month'),
    time: z.number().finite().min(0).max(100_000).default(12),
    timePeriod: z.enum(['day', 'month', 'year']).default('month'),
  }),
  outputSchema: z.object({ interest: z.number(), amount: z.number() }),
  execute: ({ capital, rate, ratePeriod, time, timePeriod }) => {
    const periods = convertTime(time, timePeriod, ratePeriod);
    const interest = capital * (rate / 100) * periods;
    return { interest: round2(interest), amount: round2(capital + interest) };
  },
  fields: {
    capital: { label: 'Capital (R$)' },
    rate: { label: 'Taxa (%)' },
    ratePeriod: { label: 'A taxa é por', optionLabels: { day: 'Dia', month: 'Mês', year: 'Ano' } },
    time: { label: 'Tempo' },
    timePeriod: { label: 'O tempo está em', optionLabels: { day: 'Dias', month: 'Meses', year: 'Anos' } },
  },
  outputLabels: { interest: 'Juros (R$)', amount: 'Montante (R$)' },
  examples: [{ description: 'R$ 1.000 a 2% ao mês por 12 meses', input: { capital: 1000, rate: 2, ratePeriod: 'month', time: 12, timePeriod: 'month' }, output: { interest: 240, amount: 1240 } }],
  documentation:
    'Juros simples: J = C × i × t, sem juros sobre juros. Quando taxa e tempo estão em unidades diferentes, usa-se a convenção comercial: mês de 30 dias e ano de 360 dias (12 meses). O montante é M = C + J.',
});

// ---------- juros compostos ----------

export function compoundInterest(capital: number, ratePercent: number, periods: number, contribution: number) {
  const i = ratePercent / 100;
  const growth = (1 + i) ** periods;
  const whole = Math.floor(periods);
  const wholeGrowth = (1 + i) ** whole;
  // Aportes ao fim de cada período completo.
  const contributions = contribution === 0 ? 0 : i === 0 ? contribution * whole : contribution * ((wholeGrowth - 1) / i) * (1 + i) ** (periods - whole);
  const amount = capital * growth + contributions;
  const invested = capital + contribution * whole;
  return { amount, invested, interest: amount - invested };
}

export const compoundInterestTool = defineTool({
  id: 'juros-compostos',
  name: 'Calculadora de Juros Compostos',
  description: 'Calcula o montante com juros compostos e aportes mensais, e converte taxas equivalentes',
  category: 'calculadoras',
  keywords: ['juros compostos', 'investimento', 'aporte', 'rendimento', 'montante', 'poupança', 'taxa equivalente'],
  icon: '📈',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    capital: money().default(1000),
    contribution: money().default(0),
    rate: pct().default(1),
    ratePeriod: z.enum(['month', 'year']).default('month'),
    time: z.number().finite().min(0).max(1200).default(12),
    timePeriod: z.enum(['month', 'year']).default('month'),
  }),
  outputSchema: z.object({
    amount: z.number(), invested: z.number(), interest: z.number(), equivalentMonthlyRate: z.number(), equivalentYearlyRate: z.number(),
  }),
  execute: ({ capital, contribution, rate, ratePeriod, time, timePeriod }) => {
    const periods = convertTime(time, timePeriod, ratePeriod);
    if (periods > 1200) throw new ToolError('O prazo máximo é de 1200 períodos');
    const r = compoundInterest(capital, rate, periods, contribution);
    const monthly = ratePeriod === 'month' ? rate : ((1 + rate / 100) ** (1 / 12) - 1) * 100;
    const yearly = ratePeriod === 'year' ? rate : ((1 + rate / 100) ** 12 - 1) * 100;
    return {
      amount: round2(r.amount), invested: round2(r.invested), interest: round2(r.interest),
      equivalentMonthlyRate: roundTo(monthly, 4), equivalentYearlyRate: roundTo(yearly, 4),
    };
  },
  fields: {
    capital: { label: 'Capital inicial (R$)' },
    contribution: { label: 'Aporte a cada período (R$)', help: 'Depositado no fim de cada período completo.' },
    rate: { label: 'Taxa (%)' },
    ratePeriod: { label: 'A taxa é por', optionLabels: { month: 'Mês', year: 'Ano' } },
    time: { label: 'Tempo' },
    timePeriod: { label: 'O tempo está em', optionLabels: { month: 'Meses', year: 'Anos' } },
  },
  outputLabels: {
    amount: 'Montante (R$)', invested: 'Total investido (R$)', interest: 'Juros ganhos (R$)',
    equivalentMonthlyRate: 'Taxa mensal equivalente (%)', equivalentYearlyRate: 'Taxa anual equivalente (%)',
  },
  examples: [
    { description: 'R$ 1.000 a 1% ao mês por 12 meses', input: { capital: 1000, contribution: 0, rate: 1, ratePeriod: 'month', time: 12, timePeriod: 'month' }, output: { amount: 1126.83 } },
    { description: 'R$ 500 por mês a 1% por 12 meses', input: { capital: 0, contribution: 500, rate: 1, ratePeriod: 'month', time: 12, timePeriod: 'month' }, output: { amount: 6341.25, invested: 6000 } },
  ],
  documentation:
    'Montante M = C × (1 + i)^n; com aportes ao fim de cada período, soma-se A × ((1 + i)^n − 1) ÷ i. A taxa e o tempo podem estar em unidades diferentes (a conversão do tempo usa mês de 30 dias e ano de 12 meses); as taxas equivalentes mensal e anual são calculadas por (1 + i)^(1/12) − 1 e (1 + i)^12 − 1. É uma projeção matemática: não considera impostos, taxas nem variação da rentabilidade.',
});

// ---------- financiamento ----------

export interface Installment {
  number: number;
  payment: number;
  interest: number;
  amortization: number;
  balance: number;
}

export function amortizationSchedule(principal: number, ratePercent: number, n: number, system: 'price' | 'sac'): Installment[] {
  const i = ratePercent / 100;
  const rows: Installment[] = [];
  let balance = principal;
  const fixed = pmt(principal, ratePercent, n);
  for (let k = 1; k <= n; k++) {
    const interest = balance * i;
    const amortization = system === 'sac' ? principal / n : fixed - interest;
    const payment = system === 'sac' ? amortization + interest : fixed;
    balance = k === n ? 0 : balance - amortization;
    rows.push({ number: k, payment, interest, amortization, balance: Math.max(balance, 0) });
  }
  return rows;
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const loanTool = defineTool({
  id: 'financiamento',
  name: 'Calculadora de Financiamento',
  description: 'Simula financiamentos nos sistemas Price (parcelas fixas) e SAC (amortização constante)',
  category: 'calculadoras',
  keywords: ['financiamento', 'empréstimo', 'price', 'sac', 'parcelas', 'imóvel', 'veículo', 'amortização', 'juros'],
  icon: '🏠',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    amount: z.number().finite().positive().max(1e12).default(100000),
    monthlyRate: pct(100).default(1),
    months: z.number().int().min(1).max(480).default(24),
    system: z.enum(['price', 'sac']).default('price'),
  }),
  outputSchema: z.object({
    firstInstallment: z.number(), lastInstallment: z.number(), totalPaid: z.number(), totalInterest: z.number(), schedule: z.array(z.string()),
  }),
  execute: ({ amount, monthlyRate, months, system }) => {
    const rows = amortizationSchedule(amount, monthlyRate, months, system);
    const totalPaid = rows.reduce((a, r) => a + r.payment, 0);
    const line = (r: Installment) => `${r.number}: parcela ${fmt(r.payment)} (juros ${fmt(r.interest)}, amortização ${fmt(r.amortization)}) saldo ${fmt(r.balance)}`;
    const schedule = rows.length <= 60 ? rows.map(line) : [...rows.slice(0, 12).map(line), '…', ...rows.slice(-3).map(line)];
    return {
      firstInstallment: round2((rows[0] as Installment).payment),
      lastInstallment: round2((rows[rows.length - 1] as Installment).payment),
      totalPaid: round2(totalPaid),
      totalInterest: round2(totalPaid - amount),
      schedule,
    };
  },
  fields: {
    amount: { label: 'Valor financiado (R$)' },
    monthlyRate: { label: 'Taxa de juros mensal (%)' },
    months: { label: 'Prazo (meses)' },
    system: { label: 'Sistema de amortização', optionLabels: { price: 'Price (parcelas iguais)', sac: 'SAC (parcelas decrescentes)' } },
  },
  outputLabels: {
    firstInstallment: 'Primeira parcela (R$)', lastInstallment: 'Última parcela (R$)', totalPaid: 'Total pago (R$)',
    totalInterest: 'Total de juros (R$)', schedule: 'Cronograma',
  },
  examples: [
    { description: 'R$ 10.000 em 12 meses a 1% (Price)', input: { amount: 10000, monthlyRate: 1, months: 12, system: 'price' }, output: { firstInstallment: 888.49, lastInstallment: 888.49, totalPaid: 10661.85 } },
    { description: 'Mesmo financiamento pelo SAC', input: { amount: 12000, monthlyRate: 1, months: 12, system: 'sac' }, output: { firstInstallment: 1120, lastInstallment: 1010 } },
  ],
  documentation:
    'Price: parcelas iguais, com juros decrescentes e amortização crescente (PMT = PV × i ÷ (1 − (1 + i)^−n)). SAC: amortização constante e parcelas decrescentes; costuma ter menor custo total de juros. A simulação não inclui seguros, tarifas, IOF nem correção (TR/IPCA), por isso não equivale ao Custo Efetivo Total (CET). Para prazos longos, o cronograma mostra as primeiras 12 e as últimas 3 parcelas.',
});

// ---------- parcelamento ----------

/** Taxa mensal (%) que iguala o valor à vista ao fluxo de `n` parcelas, por bisseção. */
export function implicitRate(cash: number, installment: number, n: number): number | null {
  if (installment * n <= cash) return installment * n === cash ? 0 : null;
  let lo = 0;
  let hi = 1; // 100% ao mês
  const presentValue = (i: number) => (i === 0 ? installment * n : (installment * (1 - (1 + i) ** -n)) / i);
  if (presentValue(hi) > cash) return null;
  for (let step = 0; step < 200; step++) {
    const mid = (lo + hi) / 2;
    if (presentValue(mid) > cash) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export const installmentTool = defineTool({
  id: 'parcelamento',
  name: 'Calculadora de Parcelamento',
  description: 'Calcula parcelas com ou sem juros e descobre a taxa de juros embutida em um parcelamento',
  category: 'calculadoras',
  keywords: ['parcelamento', 'parcelas', 'à vista', 'juros embutidos', 'taxa implícita', 'compra parcelada', 'entrada'],
  icon: '🛒',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['installment', 'implicitRate']).default('installment'),
    cashPrice: z.number().finite().positive().max(1e12).default(1000),
    entry: money().default(0),
    months: z.number().int().min(1).max(480).default(10),
    monthlyRate: pct(100).default(0),
    installmentValue: money().optional(),
  }),
  outputSchema: z.object({
    installment: z.number().optional(), totalPaid: z.number().optional(), totalInterest: z.number().optional(), implicitMonthlyRate: z.number().optional(), message: z.string(),
  }),
  execute: ({ mode, cashPrice, entry, months, monthlyRate, installmentValue }) => {
    if (entry >= cashPrice) throw new ToolError('A entrada deve ser menor que o valor à vista');
    const financed = cashPrice - entry;
    if (mode === 'installment') {
      const p = pmt(financed, monthlyRate, months);
      const total = p * months + entry;
      return {
        installment: round2(p), totalPaid: round2(total), totalInterest: round2(total - cashPrice),
        message: monthlyRate === 0 ? 'Parcelamento sem juros' : `Parcelamento com juros de ${monthlyRate}% ao mês`,
      };
    }
    if (installmentValue === undefined || installmentValue <= 0) throw new ToolError('Informe o valor da parcela');
    const rate = implicitRate(financed, installmentValue, months);
    if (rate === null) throw new ToolError('As parcelas somam menos que o valor à vista ou a taxa passa de 100% ao mês');
    const total = installmentValue * months + entry;
    return {
      implicitMonthlyRate: roundTo(rate, 4), totalPaid: round2(total), totalInterest: round2(total - cashPrice),
      message: rate === 0 ? 'Sem juros embutidos' : `Há juros embutidos de cerca de ${roundTo(rate, 2)}% ao mês`,
    };
  },
  fields: {
    mode: { label: 'O que descobrir', optionLabels: { installment: 'Valor da parcela', implicitRate: 'Taxa de juros embutida' } },
    cashPrice: { label: 'Preço à vista (R$)' },
    entry: { label: 'Entrada (R$)' },
    months: { label: 'Número de parcelas' },
    monthlyRate: { label: 'Juros mensais (%)', help: 'Use 0 para parcelamento sem juros. Só vale para "Valor da parcela".' },
    installmentValue: { label: 'Valor da parcela anunciada (R$)', help: 'Só para "Taxa de juros embutida".' },
  },
  outputLabels: {
    installment: 'Valor da parcela (R$)', totalPaid: 'Total pago (R$)', totalInterest: 'Juros pagos (R$)',
    implicitMonthlyRate: 'Taxa mensal embutida (%)', message: 'Resumo',
  },
  examples: [
    { description: '1.200 em 12x a 2% ao mês', input: { mode: 'installment', cashPrice: 1200, entry: 0, months: 12, monthlyRate: 2 }, output: { installment: 113.47 } },
    { description: 'Qual a taxa de 10x de 120 num produto de 1.000?', input: { mode: 'implicitRate', cashPrice: 1000, entry: 0, months: 10, monthlyRate: 0, installmentValue: 120 }, output: { totalPaid: 1200 } },
  ],
  documentation:
    'Calcula a parcela pela Tabela Price (juros compostos). No modo "taxa embutida", encontra a taxa mensal que iguala o valor à vista ao fluxo das parcelas, o que mostra o custo real de um parcelamento "sem juros" que tem desconto à vista. A entrada é abatida antes dos juros.',
});

// ---------- cartão de crédito (rotativo) ----------

export const creditCardInterestTool = defineTool({
  id: 'juros-cartao',
  name: 'Calculadora de Juros do Cartão de Crédito',
  description: 'Mostra quanto a dívida do cartão cresce com os juros do rotativo e em quanto tempo ela é quitada com uma parcela fixa',
  category: 'calculadoras',
  keywords: ['cartão de crédito', 'rotativo', 'juros do cartão', 'dívida', 'fatura', 'pagamento mínimo'],
  icon: '💳',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    balance: z.number().finite().positive().max(1e12).default(2000),
    monthlyRate: pct(1000).default(14),
    months: z.number().int().min(1).max(600).default(12),
    monthlyPayment: money().optional(),
  }),
  outputSchema: z.object({
    finalBalance: z.number().optional(), totalInterest: z.number(), monthsToPayOff: z.number().optional(), totalPaid: z.number().optional(), message: z.string(),
  }),
  execute: ({ balance, monthlyRate, months, monthlyPayment }) => {
    const i = monthlyRate / 100;
    if (monthlyPayment === undefined || monthlyPayment === 0) {
      const final = balance * (1 + i) ** months;
      return { finalBalance: round2(final), totalInterest: round2(final - balance), message: `Sem pagar nada, a dívida cresce ${roundTo(((final / balance) - 1) * 100, 1)}% em ${months} meses` };
    }
    if (monthlyPayment <= balance * i) {
      throw new ToolError(`O pagamento mensal precisa ser maior que os juros do primeiro mês (R$ ${fmt(balance * i)}); senão a dívida nunca diminui`);
    }
    let debt = balance;
    let paid = 0;
    let k = 0;
    while (debt > 0.005 && k < 1200) {
      debt *= 1 + i;
      const payment = Math.min(monthlyPayment, debt);
      debt -= payment;
      paid += payment;
      k++;
    }
    return { monthsToPayOff: k, totalPaid: round2(paid), totalInterest: round2(paid - balance), message: `Dívida quitada em ${k} meses` };
  },
  fields: {
    balance: { label: 'Valor da dívida (R$)' },
    monthlyRate: { label: 'Juros do rotativo ao mês (%)', help: 'Consulte a taxa na sua fatura; ela varia entre bancos.' },
    months: { label: 'Meses sem pagar', help: 'Usado quando não há pagamento mensal.' },
    monthlyPayment: { label: 'Pagamento mensal fixo (R$)', help: 'Opcional. Se informado, calcula em quantos meses a dívida acaba.' },
  },
  outputLabels: {
    finalBalance: 'Dívida após o prazo (R$)', totalInterest: 'Juros (R$)', monthsToPayOff: 'Meses para quitar',
    totalPaid: 'Total pago (R$)', message: 'Resumo',
  },
  examples: [
    { description: 'R$ 1.000 a 10% ao mês por 12 meses sem pagar', input: { balance: 1000, monthlyRate: 10, months: 12 }, output: { finalBalance: 3138.43 } },
    { description: 'Quitar R$ 1.000 pagando R$ 200 por mês a 10%', input: { balance: 1000, monthlyRate: 10, months: 12, monthlyPayment: 200 }, output: { monthsToPayOff: 8 } },
  ],
  documentation:
    'A dívida cresce a juros compostos sobre o saldo. Com pagamento fixo, simula mês a mês (juros e depois pagamento) até zerar. Não inclui IOF, multa por atraso nem encargos adicionais; a taxa deve ser a informada pelo seu banco.',
});

// ---------- cheque especial ----------

export const overdraftTool = defineTool({
  id: 'cheque-especial',
  name: 'Calculadora de Cheque Especial',
  description: 'Calcula os juros do cheque especial pelo número de dias em que o limite foi usado',
  category: 'calculadoras',
  keywords: ['cheque especial', 'limite', 'juros', 'conta corrente', 'saldo negativo', 'dívida'],
  icon: '🏦',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    amount: z.number().finite().positive().max(1e9).default(1000),
    days: z.number().int().min(1).max(3650).default(10),
    monthlyRate: pct(100).default(8),
  }),
  outputSchema: z.object({ interest: z.number(), total: z.number(), dailyRate: z.number(), yearlyRate: z.number() }),
  execute: ({ amount, days, monthlyRate }) => {
    const i = monthlyRate / 100;
    const growth = (1 + i) ** (days / 30);
    return {
      interest: round2(amount * (growth - 1)),
      total: round2(amount * growth),
      dailyRate: roundTo(((1 + i) ** (1 / 30) - 1) * 100, 4),
      yearlyRate: roundTo(((1 + i) ** 12 - 1) * 100, 2),
    };
  },
  fields: {
    amount: { label: 'Valor usado do limite (R$)' },
    days: { label: 'Dias no cheque especial' },
    monthlyRate: { label: 'Taxa ao mês (%)', help: 'Consulte a taxa do seu banco.' },
  },
  outputLabels: { interest: 'Juros (R$)', total: 'Total a pagar (R$)', dailyRate: 'Taxa diária equivalente (%)', yearlyRate: 'Taxa anual equivalente (%)' },
  examples: [{ description: 'R$ 1.000 por 30 dias a 8%', input: { amount: 1000, days: 30, monthlyRate: 8 }, output: { interest: 80, total: 1080 } }],
  documentation:
    'Os juros são proporcionais aos dias (juros compostos pro rata: (1 + i)^(dias/30) − 1). Não inclui o IOF, cuja alíquota é definida por decreto e muda com o tempo, nem tarifas. Use a taxa informada pelo seu banco.',
});

// ---------- consignado ----------

export function presentValue(payment: number, ratePercent: number, n: number): number {
  const i = ratePercent / 100;
  return i === 0 ? payment * n : (payment * (1 - (1 + i) ** -n)) / i;
}

export const payrollLoanTool = defineTool({
  id: 'consignado',
  name: 'Calculadora de Empréstimo Consignado',
  description: 'Calcula a parcela do consignado e a margem consignável da sua renda',
  category: 'calculadoras',
  keywords: ['consignado', 'empréstimo', 'margem consignável', 'inss', 'servidor', 'parcela', 'desconto em folha'],
  icon: '🧾',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    amount: z.number().finite().positive().max(1e9).default(10000),
    monthlyRate: pct(100).default(1.8),
    months: z.number().int().min(1).max(144).default(48),
    income: money(1e9).optional(),
    marginPercent: z.number().finite().min(0).max(100).default(35),
  }),
  outputSchema: z.object({
    installment: z.number(), totalPaid: z.number(), totalInterest: z.number(),
    maxInstallment: z.number().optional(), maxLoan: z.number().optional(), fitsMargin: z.boolean().optional(),
  }),
  execute: ({ amount, monthlyRate, months, income, marginPercent }) => {
    const p = pmt(amount, monthlyRate, months);
    const out: Record<string, number | boolean> = {
      installment: round2(p), totalPaid: round2(p * months), totalInterest: round2(p * months - amount),
    };
    if (income !== undefined) {
      const max = (income * marginPercent) / 100;
      out.maxInstallment = round2(max);
      out.maxLoan = round2(presentValue(max, monthlyRate, months));
      out.fitsMargin = p <= max + 0.005;
    }
    return out as { installment: number; totalPaid: number; totalInterest: number };
  },
  fields: {
    amount: { label: 'Valor do empréstimo (R$)' },
    monthlyRate: { label: 'Taxa de juros ao mês (%)' },
    months: { label: 'Prazo (meses)' },
    income: { label: 'Renda mensal líquida (R$)', help: 'Opcional. Para calcular a margem consignável.' },
    marginPercent: { label: 'Margem consignável (%)', help: 'O limite legal é definido em lei e pode mudar; confira o vigente para o seu caso.' },
  },
  outputLabels: {
    installment: 'Parcela (R$)', totalPaid: 'Total pago (R$)', totalInterest: 'Juros (R$)',
    maxInstallment: 'Parcela máxima pela margem (R$)', maxLoan: 'Empréstimo máximo pela margem (R$)', fitsMargin: 'Cabe na margem?',
  },
  examples: [{ description: 'R$ 10.000 em 48x a 1,8% com renda de R$ 3.000', input: { amount: 10000, monthlyRate: 1.8, months: 48, income: 3000, marginPercent: 35 }, output: { maxInstallment: 1050, fitsMargin: true } }],
  documentation:
    'A parcela segue a Tabela Price. A margem consignável é a parte da renda que pode ser comprometida com parcelas descontadas em folha; o percentual (35% é o valor usual para empréstimo) depende da categoria e é definido em lei, por isso é um campo editável. Não inclui IOF nem seguros; compare com o CET informado pelo banco.',
});

// ---------- inflação ----------

export function accumulate(ratesPercent: number[]): number {
  return (ratesPercent.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
}

export const inflationTool = defineTool({
  id: 'inflacao',
  name: 'Calculadora de Inflação',
  description: 'Acumula taxas mensais de inflação e corrige valores, a partir dos índices que você informar',
  category: 'calculadoras',
  keywords: ['inflação', 'ipca', 'igp-m', 'correção monetária', 'reajuste', 'poder de compra', 'acumulado'],
  icon: '📉',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    amount: money().default(1000),
    rates: z.string().max(5000).default(''),
  }),
  outputSchema: z.object({ accumulatedPercent: z.number(), months: z.number(), correctedValue: z.number(), purchasingPower: z.number() }),
  execute: ({ amount, rates }) => {
    const list = parseNumbers(rates);
    if (list.length === 0) throw new ToolError('Informe as taxas mensais de inflação');
    if (list.length > 1200) throw new ToolError('Use no máximo 1200 meses');
    if (list.some((r) => r <= -100)) throw new ToolError('Taxas devem ser maiores que -100%');
    const acc = accumulate(list);
    return {
      accumulatedPercent: roundTo(acc, 4), months: list.length,
      correctedValue: round2(amount * (1 + acc / 100)),
      purchasingPower: round2(amount / (1 + acc / 100)),
    };
  },
  fields: {
    amount: { label: 'Valor (R$)' },
    rates: { label: 'Taxas mensais (%)', multiline: true, placeholder: '0,52  0,44  0,56  0,16', help: 'Uma taxa por mês, separadas por espaço, ponto e vírgula ou linha. Copie os índices do IBGE (IPCA) ou do índice de sua escolha.' },
  },
  outputLabels: { accumulatedPercent: 'Inflação acumulada (%)', months: 'Meses', correctedValue: 'Valor corrigido (R$)', purchasingPower: 'Valor de hoje com o poder de compra do início (R$)' },
  examples: [{ description: 'Três meses de 1%', input: { amount: 1000, rates: '1 1 1' }, output: { accumulatedPercent: 3.0301, correctedValue: 1030.3, months: 3 } }],
  documentation:
    'Acumula as taxas por juros compostos: (1 + r1) × (1 + r2) × … − 1. Os índices não são embutidos na ferramenta porque mudam todo mês; informe os que desejar (por exemplo, o IPCA divulgado pelo IBGE). O "poder de compra" mostra quanto valeria o valor inicial deflacionado pelo acumulado.',
});

// ---------- margem de lucro ----------

export const marginTool = defineTool({
  id: 'margem-lucro',
  name: 'Calculadora de Margem de Lucro e Markup',
  description: 'Calcula margem, markup e lucro, ou o preço de venda a partir do custo e da margem desejada',
  category: 'calculadoras',
  keywords: ['margem de lucro', 'markup', 'preço de venda', 'custo', 'lucro', 'precificação'],
  icon: '💹',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['fromPrice', 'priceFromMargin', 'priceFromMarkup']).default('fromPrice'),
    cost: z.number().finite().positive().max(1e12).default(60),
    price: money().default(100),
    percent: z.number().finite().min(0).max(10000).default(40),
  }),
  outputSchema: z.object({ price: z.number(), profit: z.number(), marginPercent: z.number(), markupPercent: z.number() }),
  execute: ({ mode, cost, price, percent }) => {
    let finalPrice = price;
    if (mode === 'priceFromMargin') {
      if (percent >= 100) throw new ToolError('A margem deve ser menor que 100%');
      finalPrice = cost / (1 - percent / 100);
    } else if (mode === 'priceFromMarkup') finalPrice = cost * (1 + percent / 100);
    const profit = finalPrice - cost;
    return {
      price: round2(finalPrice), profit: round2(profit),
      marginPercent: finalPrice === 0 ? 0 : roundTo((profit / finalPrice) * 100, 2), markupPercent: roundTo((profit / cost) * 100, 2),
    };
  },
  fields: {
    mode: { label: 'Calcular', optionLabels: { fromPrice: 'Margem e markup, dados custo e preço', priceFromMargin: 'Preço, dados custo e margem desejada', priceFromMarkup: 'Preço, dados custo e markup' } },
    cost: { label: 'Custo (R$)' },
    price: { label: 'Preço de venda (R$)', help: 'Usado no primeiro modo.' },
    percent: { label: 'Margem ou markup desejado (%)', help: 'Usado nos modos que calculam o preço.' },
  },
  outputLabels: { price: 'Preço de venda (R$)', profit: 'Lucro (R$)', marginPercent: 'Margem (% do preço)', markupPercent: 'Markup (% do custo)' },
  examples: [
    { description: 'Custo 60, preço 100', input: { mode: 'fromPrice', cost: 60, price: 100, percent: 0 }, output: { profit: 40, marginPercent: 40, markupPercent: 66.67 } },
    { description: 'Preço para margem de 25% sobre custo 75', input: { mode: 'priceFromMargin', cost: 75, price: 0, percent: 25 }, output: { price: 100 } },
  ],
  documentation:
    'Margem é o lucro como porcentagem do preço de venda; markup é o lucro como porcentagem do custo. Preço pela margem: custo ÷ (1 − margem). Preço pelo markup: custo × (1 + markup). Impostos, comissões e despesas fixas não estão incluídos; adicione-os ao custo para obter a margem líquida.',
});

// ---------- ROI ----------

export const roiTool = defineTool({
  id: 'roi',
  name: 'Calculadora de ROI',
  description: 'Calcula o retorno sobre investimento e as taxas mensal e anual equivalentes',
  category: 'calculadoras',
  keywords: ['roi', 'retorno sobre investimento', 'rentabilidade', 'lucro', 'investimento', 'payback'],
  icon: '🎯',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    invested: z.number().finite().positive().max(1e12).default(10000),
    finalValue: money().default(12500),
    months: z.number().finite().positive().max(1200).optional(),
  }),
  outputSchema: z.object({ gain: z.number(), roiPercent: z.number(), monthlyPercent: z.number().optional(), yearlyPercent: z.number().optional() }),
  execute: ({ invested, finalValue, months }) => {
    const ratio = finalValue / invested;
    const out: { gain: number; roiPercent: number; monthlyPercent?: number; yearlyPercent?: number } = {
      gain: round2(finalValue - invested), roiPercent: roundTo((ratio - 1) * 100, 2),
    };
    if (months !== undefined && ratio > 0) {
      out.monthlyPercent = roundTo((ratio ** (1 / months) - 1) * 100, 4);
      out.yearlyPercent = roundTo((ratio ** (12 / months) - 1) * 100, 2);
    }
    return out;
  },
  fields: {
    invested: { label: 'Valor investido (R$)' },
    finalValue: { label: 'Valor final (R$)', help: 'Quanto você tem ao fim (investimento + retorno).' },
    months: { label: 'Prazo (meses)', help: 'Opcional. Para ver as taxas equivalentes por mês e por ano.' },
  },
  outputLabels: { gain: 'Ganho (R$)', roiPercent: 'ROI (%)', monthlyPercent: 'Taxa mensal equivalente (%)', yearlyPercent: 'Taxa anual equivalente (%)' },
  examples: [{ description: 'R$ 10.000 viram R$ 12.500 em 12 meses', input: { invested: 10000, finalValue: 12500, months: 12 }, output: { gain: 2500, roiPercent: 25, yearlyPercent: 25 } }],
  documentation:
    'ROI = (valor final − valor investido) ÷ valor investido. As taxas equivalentes usam juros compostos: (valor final ÷ investido)^(1/meses) − 1. O ROI não considera risco, inflação nem impostos.',
});

// ---------- comissão de vendas ----------

export const commissionTool = defineTool({
  id: 'comissao-vendas',
  name: 'Calculadora de Comissão de Vendas',
  description: 'Calcula a comissão sobre vendas, o salário fixo somado e o descanso semanal remunerado (DSR) da comissão',
  category: 'calculadoras',
  keywords: ['comissão', 'vendas', 'vendedor', 'dsr', 'percentual', 'remuneração variável'],
  icon: '🤝',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    sales: money().default(20000),
    ratePercent: pct(100).default(3),
    fixedSalary: money().default(0),
    workingDays: z.number().int().min(0).max(31).optional(),
    restDays: z.number().int().min(0).max(31).optional(),
  }),
  outputSchema: z.object({ commission: z.number(), dsr: z.number().optional(), total: z.number() }),
  execute: ({ sales, ratePercent, fixedSalary, workingDays, restDays }) => {
    const commission = (sales * ratePercent) / 100;
    let dsr = 0;
    const out: { commission: number; dsr?: number; total: number } = { commission: round2(commission), total: 0 };
    if (workingDays !== undefined && restDays !== undefined) {
      if (workingDays === 0) throw new ToolError('Informe os dias úteis do mês');
      dsr = (commission / workingDays) * restDays;
      out.dsr = round2(dsr);
    }
    out.total = round2(fixedSalary + commission + dsr);
    return out;
  },
  fields: {
    sales: { label: 'Total vendido (R$)' },
    ratePercent: { label: 'Comissão (%)' },
    fixedSalary: { label: 'Salário fixo (R$)' },
    workingDays: { label: 'Dias úteis do mês', help: 'Opcional. Para calcular o DSR da comissão.' },
    restDays: { label: 'Domingos e feriados do mês', help: 'Opcional. Para calcular o DSR da comissão.' },
  },
  outputLabels: { commission: 'Comissão (R$)', dsr: 'DSR sobre a comissão (R$)', total: 'Total bruto (R$)' },
  examples: [{ description: '3% sobre R$ 20.000 com DSR', input: { sales: 20000, ratePercent: 3, fixedSalary: 1500, workingDays: 25, restDays: 5 }, output: { commission: 600, dsr: 120, total: 2220 } }],
  documentation:
    'Comissão = vendas × percentual. Para empregados comissionistas, a comissão reflete no descanso semanal remunerado: DSR = comissão ÷ dias úteis × (domingos + feriados) (Súmula 27 do TST). O resultado é bruto: não desconta INSS nem imposto de renda.',
});
