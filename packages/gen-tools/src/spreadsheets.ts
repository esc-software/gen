import { z } from 'zod';
import { defineTool, type Tool } from '@esc/gen-core';
import { today } from './calc-daily.js';
import { Sheet, buildXlsx, computeWorkbook, sheetToCsv, type WorkbookSpec } from './sheet-builder.js';
import { numberToCol } from './xl-formula.js';

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const SAMPLE_NOTE = 'exemplo';

export const EXPENSE_CATEGORIES = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Vestuário', 'Dívidas', 'Investimentos', 'Outros'];
export const PAYMENT_METHODS = ['Dinheiro', 'Débito', 'Crédito', 'Pix', 'Boleto'];

const lines = (s: string | undefined, fallback: string[]): string[] => {
  const list = (s ?? '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  return list.length ? list : fallback;
};

/** Rótulos de categoria vão para células de texto (não para nomes de aba), então só limitamos o tamanho. */
const safeLabel = (text: string): string => text.slice(0, 60);

function instructions(title: string, steps: string[]): Sheet {
  const sheet = new Sheet('Instruções', [110], { tabColor: 'FF94A3B8' });
  sheet.put(1, 1, { v: title, style: 'title' });
  steps.forEach((s, i) => sheet.put(1, 3 + i, { v: s, style: 'note' }));
  return sheet;
}

const COMMON_STEPS = [
  'Células em amarelo claro são para você preencher; as cinzas são calculadas por fórmulas e não precisam ser editadas.',
  'Linhas em itálico cinza marcadas como "exemplo" são dados FICTÍCIOS de demonstração: apague-as antes de usar a planilha.',
  'Gerada pelo Gen (ESC Software). Os valores são em reais (R$). Esta planilha é um modelo de organização e não substitui orientação financeira profissional.',
];

// ---------- 1. gastos pessoais ----------

export interface ExpensesOptions { rows: number; withSamples: boolean; year: number }

export function expensesWorkbook({ rows, withSamples, year }: ExpensesOptions): WorkbookSpec {
  const last = rows + 1;
  const inst = instructions('Planilha de gastos pessoais', ['Registre cada gasto na aba "Gastos": data, descrição, categoria, forma de pagamento e valor.', 'A aba "Resumo" soma sozinha por categoria e por forma de pagamento.', ...COMMON_STEPS]);

  const gastos = new Sheet('Gastos', [13, 34, 18, 20, 16, 12], { primary: true, tabColor: 'FF0F766E' });
  gastos.row(1, ['Data', 'Descrição', 'Categoria', 'Forma de pagamento', 'Valor (R$)', 'Obs.'], { style: 'header' });
  const samples: [number, string, string, string, number][] = [
    [3, 'Aluguel', 'Moradia', 'Pix', 1500], [5, 'Supermercado', 'Alimentação', 'Débito', 482.9], [7, 'Combustível', 'Transporte', 'Crédito', 220],
    [10, 'Farmácia', 'Saúde', 'Débito', 64.5], [12, 'Cinema', 'Lazer', 'Crédito', 48], [15, 'Curso online', 'Educação', 'Pix', 89.9], [18, 'Restaurante', 'Alimentação', 'Crédito', 112.4], [22, 'Conta de luz', 'Moradia', 'Boleto', 187.35],
  ];
  for (let r = 2; r <= last; r++) {
    const s = withSamples ? samples[r - 2] : undefined;
    const style = s ? 'sample' : 'input';
    gastos.put(1, r, { v: s ? { date: [year, 1, s[0]] } : null, fmt: 'date', style });
    gastos.put(2, r, { v: s ? s[1] : null, style });
    gastos.put(3, r, { v: s ? s[2] : null, style });
    gastos.put(4, r, { v: s ? s[3] : null, style });
    gastos.put(5, r, { v: s ? s[4] : null, fmt: 'money', style });
    gastos.put(6, r, { v: s ? SAMPLE_NOTE : null, style });
  }
  gastos.validate(`C2:C${last}`, `Listas!$A$2:$A$${EXPENSE_CATEGORIES.length + 1}`).validate(`D2:D${last}`, `Listas!$B$2:$B$${PAYMENT_METHODS.length + 1}`).freeze(1);

  const resumo = new Sheet('Resumo', [26, 18, 14], { tabColor: 'FF14B8A6' });
  resumo.put(1, 1, { v: 'Gastos por categoria', style: 'title' });
  resumo.row(3, ['Categoria', 'Total (R$)', '% do total'], { style: 'header' });
  const firstCat = 4;
  const lastCat = firstCat + EXPENSE_CATEGORIES.length - 1;
  const totalRow = lastCat + 1;
  EXPENSE_CATEGORIES.forEach((cat, i) => {
    const r = firstCat + i;
    resumo.put(1, r, { f: `Listas!A${i + 2}`, style: 'calc' });
    resumo.put(2, r, { f: `SUMIF(Gastos!$C$2:$C$${last},A${r},Gastos!$E$2:$E$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(3, r, { f: `IF($B$${totalRow}=0,0,B${r}/$B$${totalRow})`, fmt: 'percent', style: 'calc' });
  });
  resumo.put(1, totalRow, { v: 'Total', style: 'total' });
  resumo.put(2, totalRow, { f: `SUM(B${firstCat}:B${lastCat})`, fmt: 'money', style: 'total' });
  resumo.put(3, totalRow, { f: `SUM(C${firstCat}:C${lastCat})`, fmt: 'percent', style: 'total' });
  resumo.put(1, totalRow + 1, { v: 'Gastos sem categoria', style: 'label' });
  resumo.put(2, totalRow + 1, { f: `SUM(Gastos!$E$2:$E$${last})-B${totalRow}`, fmt: 'money', style: 'calc' });
  const payHeader = totalRow + 3;
  resumo.row(payHeader, ['Forma de pagamento', 'Total (R$)', '% do total'], { style: 'header' });
  PAYMENT_METHODS.forEach((m, i) => {
    const r = payHeader + 1 + i;
    resumo.put(1, r, { f: `Listas!B${i + 2}`, style: 'calc' });
    resumo.put(2, r, { f: `SUMIF(Gastos!$D$2:$D$${last},A${r},Gastos!$E$2:$E$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(3, r, { f: `IF($B$${totalRow}=0,0,B${r}/SUM(Gastos!$E$2:$E$${last}))`, fmt: 'percent', style: 'calc' });
  });

  const listas = new Sheet('Listas', [22, 22], { tabColor: 'FF94A3B8' });
  listas.row(1, ['Categorias', 'Formas de pagamento'], { style: 'header' });
  EXPENSE_CATEGORIES.forEach((c, i) => listas.put(1, i + 2, { v: c }));
  PAYMENT_METHODS.forEach((c, i) => listas.put(2, i + 2, { v: c }));
  return { title: 'Planilha de gastos pessoais', sheets: [inst.spec, gastos.spec, resumo.spec, listas.spec] };
}

// ---------- 2. controle financeiro (fluxo de caixa anual) ----------

export interface CashFlowOptions { year: number; income: string[]; expenses: string[]; initialBalance: number; withSamples: boolean }

export function cashFlowWorkbook(o: CashFlowOptions): WorkbookSpec {
  const inst = instructions(`Controle financeiro ${o.year}`, ['Informe o saldo inicial e, mês a mês, as receitas e as despesas de cada categoria.', 'O saldo do mês e o saldo acumulado são calculados automaticamente.', ...COMMON_STEPS]);
  const s = new Sheet('Fluxo de caixa', [30, ...Array<number>(12).fill(12), 14], { primary: true, tabColor: 'FF0F766E' });
  s.put(1, 1, { v: `Fluxo de caixa ${o.year}`, style: 'title' });
  s.put(1, 2, { v: 'Saldo inicial (R$)', style: 'label' });
  s.put(2, 2, { v: o.initialBalance, fmt: 'money', style: o.withSamples ? 'sample' : 'input' });
  s.row(4, ['Categoria', ...MONTHS_SHORT, 'Total'], { style: 'header' });

  let r = 5;
  s.put(1, r, { v: 'RECEITAS', style: 'section' });
  r++;
  const incomeFirst = r;
  o.income.forEach((cat, i) => {
    s.put(1, r, { v: cat });
    for (let m = 1; m <= 12; m++) s.put(m + 1, r, { v: o.withSamples ? [5200, 300, 0][i % 3]! : null, fmt: 'money', style: o.withSamples ? 'sample' : 'input' });
    s.put(14, r, { f: `SUM(B${r}:M${r})`, fmt: 'money', style: 'calc' });
    r++;
  });
  const incomeLast = r - 1;
  s.put(1, r, { v: 'Total de receitas', style: 'total' });
  for (let c = 2; c <= 14; c++) s.put(c, r, { f: `SUM(${numberToCol(c)}${incomeFirst}:${numberToCol(c)}${incomeLast})`, fmt: 'money', style: 'total' });
  const incomeTotal = r;
  r += 2;
  s.put(1, r, { v: 'DESPESAS', style: 'section' });
  r++;
  const expFirst = r;
  const sampleExpenses = [1500, 800, 350, 200, 150, 250, 100, 0];
  o.expenses.forEach((cat, i) => {
    s.put(1, r, { v: cat });
    for (let m = 1; m <= 12; m++) s.put(m + 1, r, { v: o.withSamples ? sampleExpenses[i % sampleExpenses.length]! : null, fmt: 'money', style: o.withSamples ? 'sample' : 'input' });
    s.put(14, r, { f: `SUM(B${r}:M${r})`, fmt: 'money', style: 'calc' });
    r++;
  });
  const expLast = r - 1;
  s.put(1, r, { v: 'Total de despesas', style: 'total' });
  for (let c = 2; c <= 14; c++) s.put(c, r, { f: `SUM(${numberToCol(c)}${expFirst}:${numberToCol(c)}${expLast})`, fmt: 'money', style: 'total' });
  const expTotal = r;
  r += 2;
  s.put(1, r, { v: 'Saldo do mês', style: 'label' });
  for (let c = 2; c <= 14; c++) s.put(c, r, { f: `${numberToCol(c)}${incomeTotal}-${numberToCol(c)}${expTotal}`, fmt: 'money', style: 'calc' });
  const balanceRow = r;
  r++;
  s.put(1, r, { v: 'Saldo acumulado', style: 'label' });
  for (let c = 2; c <= 13; c++) s.put(c, r, { f: c === 2 ? `$B$2+B${balanceRow}` : `${numberToCol(c - 1)}${r}+${numberToCol(c)}${balanceRow}`, fmt: 'money', style: 'calc' });
  s.put(14, r, { f: `M${r}`, fmt: 'money', style: 'calc' });
  s.freeze(4);
  return { title: `Controle financeiro ${o.year}`, sheets: [inst.spec, s.spec] };
}

// ---------- 3. orçamento mensal ----------

export interface BudgetOptions { income: number; withSamples: boolean }

const BUDGET_PLAN: [string, number][] = [['Moradia', 0.3], ['Alimentação', 0.15], ['Transporte', 0.1], ['Saúde', 0.05], ['Educação', 0.05], ['Lazer', 0.1], ['Dívidas', 0.05], ['Reserva e investimentos', 0.15], ['Outros', 0.05]];

export function budgetWorkbook({ income, withSamples }: BudgetOptions): WorkbookSpec {
  const inst = instructions('Orçamento mensal', ['Informe sua renda líquida do mês e ajuste o percentual planejado de cada categoria (a soma deve ser 100%).', 'Preencha o "Realizado" ao longo do mês: a coluna "Situação" avisa quando uma categoria passa do planejado.', 'A divisão sugerida (30% moradia, 15% alimentação, 15% reserva...) é só um ponto de partida: adapte à sua realidade.', ...COMMON_STEPS]);
  const s = new Sheet('Orçamento', [28, 14, 18, 18, 18, 22], { primary: true, tabColor: 'FF0F766E' });
  s.put(1, 1, { v: 'Orçamento mensal', style: 'title' });
  s.put(1, 2, { v: 'Renda líquida do mês (R$)', style: 'label' });
  s.put(2, 2, { v: income, fmt: 'money', style: withSamples ? 'sample' : 'input' });
  s.row(4, ['Categoria', '% planejado', 'Planejado (R$)', 'Realizado (R$)', 'Diferença (R$)', 'Situação'], { style: 'header' });
  const realized = [1480, 760, 330, 140, 100, 420, 150, 600, 90];
  const first = 5;
  BUDGET_PLAN.forEach(([cat, pct], i) => {
    const r = first + i;
    s.put(1, r, { v: cat });
    s.put(2, r, { v: pct, fmt: 'percent', style: 'input' });
    s.put(3, r, { f: `ROUND($B$2*B${r},2)`, fmt: 'money', style: 'calc' });
    s.put(4, r, { v: withSamples ? realized[i]! : null, fmt: 'money', style: withSamples ? 'sample' : 'input' });
    s.put(5, r, { f: `C${r}-D${r}`, fmt: 'money', style: 'calc' });
    s.put(6, r, { f: `IF(D${r}>C${r},"Acima do planejado","Dentro do planejado")`, style: 'calc' });
  });
  const last = first + BUDGET_PLAN.length - 1;
  const total = last + 1;
  s.put(1, total, { v: 'Total', style: 'total' });
  s.put(2, total, { f: `SUM(B${first}:B${last})`, fmt: 'percent', style: 'total' });
  s.put(3, total, { f: `SUM(C${first}:C${last})`, fmt: 'money', style: 'total' });
  s.put(4, total, { f: `SUM(D${first}:D${last})`, fmt: 'money', style: 'total' });
  s.put(5, total, { f: `C${total}-D${total}`, fmt: 'money', style: 'total' });
  s.put(6, total, { f: `IF(ROUND(B${total},4)=1,"Percentuais somam 100%","Ajuste os percentuais: não somam 100%")`, style: 'total' });
  s.put(1, total + 2, { v: 'Sobra (renda − realizado)', style: 'label' });
  s.put(2, total + 2, { f: `B2-D${total}`, fmt: 'money', style: 'calc' });
  s.freeze(4);
  return { title: 'Orçamento mensal', sheets: [inst.spec, s.spec] };
}

// ---------- 4. controle de aluguel ----------

export interface RentOptions { startYear: number; startMonth: number; months: number; dueDay: number; baseRent: number; adjustmentPercent: number; finePercent: number; interestPercent: number; withSamples: boolean }

export function rentWorkbook(o: RentOptions): WorkbookSpec {
  const inst = instructions('Controle de aluguel', ['Confira os parâmetros no topo da aba "Controle" (valor base, reajuste anual, multa e juros).', 'Quando o inquilino pagar, preencha a data e o valor pagos: a planilha calcula atraso, multa, juros e o saldo da parcela.', 'A multa é aplicada uma vez sobre o aluguel em atraso e os juros são proporcionais aos dias (taxa mensal ÷ 30 por dia). Confira as regras do seu contrato.', ...COMMON_STEPS]);
  const s = new Sheet('Controle', [8, 14, 16, 16, 16, 12, 18, 16, 14, 12], { primary: true, tabColor: 'FF0F766E' });
  s.put(1, 1, { v: 'Controle de aluguel', style: 'title' });
  const params: [string, CellSpecValue, 'money' | 'percent' | 'date' | 'int'][] = [
    ['Primeiro vencimento', { date: [o.startYear, o.startMonth, o.dueDay] }, 'date'],
    ['Aluguel base (R$)', o.baseRent, 'money'],
    ['Reajuste anual', o.adjustmentPercent / 100, 'percent'],
    ['Multa por atraso', o.finePercent / 100, 'percent'],
    ['Juros ao mês', o.interestPercent / 100, 'percent'],
  ];
  params.forEach(([label, v, fmt], i) => {
    s.put(1, 2 + i, { v: label, style: 'label' });
    s.put(4, 2 + i, { v, fmt, style: 'input' });
  });
  s.merge('A2:C2').merge('A3:C3').merge('A4:C4').merge('A5:C5').merge('A6:C6');
  const header = 8;
  s.row(header, ['Nº', 'Vencimento', 'Aluguel (R$)', 'Data do pagamento', 'Valor pago (R$)', 'Dias de atraso', 'Multa e juros (R$)', 'Saldo (R$)', 'Situação', 'Obs.'], { style: 'header' });
  const first = header + 1;
  for (let n = 1; n <= o.months; n++) {
    const r = first + n - 1;
    const sample = o.withSamples && n <= 3;
    const style = sample ? 'sample' : 'input';
    s.put(1, r, { v: n, fmt: 'int' });
    s.put(2, r, { f: `EDATE($D$2,${n - 1})`, fmt: 'date', style: 'calc' });
    s.put(3, r, { f: `ROUND($D$3*(1+$D$4)^INT(${n - 1}/12),2)`, fmt: 'money', style: 'calc' });
    const paid: { date: [number, number, number] } | null = sample && n !== 3 ? { date: [o.startYear + Math.floor((o.startMonth - 1 + n - 1) / 12), ((o.startMonth - 1 + n - 1) % 12) + 1, Math.min(o.dueDay + (n === 2 ? 6 : 0), 28)] } : null;
    s.put(4, r, { v: paid, fmt: 'date', style });
    s.put(5, r, { v: sample && n !== 3 ? o.baseRent : null, fmt: 'money', style });
    s.put(6, r, { f: `IF(D${r}="","",MAX(0,D${r}-B${r}))`, fmt: 'int', style: 'calc' });
    s.put(7, r, { f: `IF(D${r}="",0,IF(F${r}>0,ROUND(C${r}*$D$5+C${r}*($D$6/30)*F${r},2),0))`, fmt: 'money', style: 'calc' });
    s.put(8, r, { f: `ROUND(C${r}+G${r}-E${r},2)`, fmt: 'money', style: 'calc' });
    s.put(9, r, { f: `IF(D${r}="","Em aberto",IF(H${r}<=0,"Quitado","Pendente"))`, style: 'calc' });
    s.put(10, r, { v: sample ? SAMPLE_NOTE : null, style });
  }
  const last = first + o.months - 1;
  const t = last + 1;
  s.put(1, t, { v: 'Total', style: 'total' });
  for (const c of [2, 4, 6, 9, 10]) s.put(c, t, { v: null, style: 'total' });
  s.put(3, t, { f: `SUM(C${first}:C${last})`, fmt: 'money', style: 'total' });
  s.put(5, t, { f: `SUM(E${first}:E${last})`, fmt: 'money', style: 'total' });
  s.put(7, t, { f: `SUM(G${first}:G${last})`, fmt: 'money', style: 'total' });
  s.put(8, t, { f: `SUM(H${first}:H${last})`, fmt: 'money', style: 'total' });
  s.freeze(header);
  return { title: 'Controle de aluguel', sheets: [inst.spec, s.spec] };
}

type CellSpecValue = number | { date: [number, number, number] };

// ---------- 5. controle de dívidas ----------

export interface DebtOptions { rows: number; withSamples: boolean }

export function debtsWorkbook({ rows, withSamples }: DebtOptions): WorkbookSpec {
  const inst = instructions('Controle de dívidas', ['Liste cada dívida com valor original, taxa de juros mensal, número de parcelas e quantas já foram pagas.', 'A planilha calcula a parcela, o saldo devedor e quanto falta pagar. A coluna "Prioridade" ordena pela maior taxa de juros (método avalanche): quite primeiro as de prioridade 1 quando sobrar dinheiro.', 'O saldo devedor é uma estimativa pela Tabela Price com a taxa informada; confira com o credor, pois tarifas, seguros e IOF alteram os valores.', ...COMMON_STEPS]);
  const s = new Sheet('Dívidas', [20, 26, 16, 12, 11, 11, 16, 12, 18, 18, 12, 10], { primary: true, tabColor: 'FF0F766E' });
  s.row(1, ['Credor', 'Descrição', 'Valor original (R$)', 'Taxa ao mês (%)', 'Parcelas totais', 'Parcelas pagas', 'Valor da parcela (R$)', 'Parcelas restantes', 'Saldo devedor (R$)', 'Total a pagar (R$)', 'Prioridade', 'Obs.'], { style: 'header' });
  const samples: [string, string, number, number, number, number][] = [
    ['Banco Exemplo', 'Cartão de crédito parcelado', 3000, 9.5, 12, 4], ['Financeira Exemplo', 'Empréstimo pessoal', 8000, 3.2, 24, 6], ['Loja Exemplo', 'Sofá', 2400, 0, 10, 2],
  ];
  const last = rows + 1;
  for (let r = 2; r <= last; r++) {
    const smp = withSamples ? samples[r - 2] : undefined;
    const style = smp ? 'sample' : 'input';
    s.put(1, r, { v: smp ? smp[0] : null, style });
    s.put(2, r, { v: smp ? smp[1] : null, style });
    s.put(3, r, { v: smp ? smp[2] : null, fmt: 'money', style });
    s.put(4, r, { v: smp ? smp[3] : null, fmt: 'number', style });
    s.put(5, r, { v: smp ? smp[4] : null, fmt: 'int', style });
    s.put(6, r, { v: smp ? smp[5] : null, fmt: 'int', style });
    s.put(7, r, { f: `IF(OR(C${r}="",E${r}=""),"",IF(D${r}=0,ROUND(C${r}/E${r},2),ROUND(-PMT(D${r}/100,E${r},C${r}),2)))`, fmt: 'money', style: 'calc' });
    s.put(8, r, { f: `IF(E${r}="","",MAX(0,E${r}-F${r}))`, fmt: 'int', style: 'calc' });
    s.put(9, r, { f: `IF(G${r}="","",IF(H${r}=0,0,IF(D${r}=0,ROUND(G${r}*H${r},2),ROUND(G${r}*(1-(1+D${r}/100)^-H${r})/(D${r}/100),2))))`, fmt: 'money', style: 'calc' });
    s.put(10, r, { f: `IF(G${r}="","",ROUND(G${r}*H${r},2))`, fmt: 'money', style: 'calc' });
    s.put(11, r, { f: `IF(D${r}="","",COUNTIF($D$2:$D$${last},">"&D${r})+1)`, fmt: 'int', style: 'calc' });
    s.put(12, r, { v: smp ? SAMPLE_NOTE : null, style });
  }
  const t = last + 1;
  s.put(1, t, { v: 'Total', style: 'total' });
  for (const c of [2, 4, 5, 6, 8, 11, 12]) s.put(c, t, { v: null, style: 'total' });
  s.put(3, t, { f: `SUM(C2:C${last})`, fmt: 'money', style: 'total' });
  s.put(7, t, { f: `SUM(G2:G${last})`, fmt: 'money', style: 'total' });
  s.put(9, t, { f: `SUM(I2:I${last})`, fmt: 'money', style: 'total' });
  s.put(10, t, { f: `SUM(J2:J${last})`, fmt: 'money', style: 'total' });
  s.freeze(1);
  return { title: 'Controle de dívidas', sheets: [inst.spec, s.spec] };
}

// ---------- 6. metas financeiras ----------

export interface GoalsOptions { rows: number; withSamples: boolean; refYear: number; refMonth: number; monthlyReturnPercent: number }

export function goalsWorkbook(o: GoalsOptions): WorkbookSpec {
  const inst = instructions('Metas financeiras', ['Defina o mês de início, o rendimento mensal esperado e, para cada meta, o valor alvo, o valor já guardado e o prazo.', 'A planilha calcula quanto guardar por mês, com e sem rendimento, e o progresso de cada meta.', 'O rendimento é uma hipótese sua (não uma promessa); use 0% para uma conta conservadora.', ...COMMON_STEPS]);
  const s = new Sheet('Metas', [28, 16, 16, 14, 11, 16, 20, 22, 12, 10], { primary: true, tabColor: 'FF0F766E' });
  s.put(1, 1, { v: 'Metas financeiras', style: 'title' });
  s.put(1, 2, { v: 'Mês de início', style: 'label' });
  s.put(3, 2, { v: { date: [o.refYear, o.refMonth, 1] }, fmt: 'date', style: 'input' });
  s.put(1, 3, { v: 'Rendimento esperado ao mês', style: 'label' });
  s.put(3, 3, { v: o.monthlyReturnPercent / 100, fmt: 'percent', style: 'input' });
  s.merge('A2:B2').merge('A3:B3');
  s.row(5, ['Meta', 'Valor alvo (R$)', 'Valor atual (R$)', 'Prazo', 'Meses restantes', 'Falta (R$)', 'Guardar por mês, sem rendimento (R$)', 'Guardar por mês, com rendimento (R$)', 'Progresso', 'Obs.'], { style: 'header' });
  const samples: [string, number, number, number][] = [['Reserva de emergência', 18000, 4500, 12], ['Viagem de férias', 7000, 1200, 8], ['Entrada de um carro', 30000, 5000, 30]];
  const first = 6;
  const last = first + o.rows - 1;
  for (let r = first; r <= last; r++) {
    const smp = o.withSamples ? samples[r - first] : undefined;
    const style = smp ? 'sample' : 'input';
    let deadline: { date: [number, number, number] } | null = null;
    if (smp) {
      const total = o.refYear * 12 + (o.refMonth - 1) + smp[3];
      deadline = { date: [Math.floor(total / 12), (total % 12) + 1, 1] };
    }
    s.put(1, r, { v: smp ? smp[0] : null, style });
    s.put(2, r, { v: smp ? smp[1] : null, fmt: 'money', style });
    s.put(3, r, { v: smp ? smp[2] : null, fmt: 'money', style });
    s.put(4, r, { v: deadline, fmt: 'date', style });
    s.put(5, r, { f: `IF(D${r}="","",MAX(1,(YEAR(D${r})-YEAR($C$2))*12+MONTH(D${r})-MONTH($C$2)))`, fmt: 'int', style: 'calc' });
    s.put(6, r, { f: `IF(B${r}="","",MAX(0,B${r}-C${r}))`, fmt: 'money', style: 'calc' });
    s.put(7, r, { f: `IF(OR(F${r}="",E${r}=""),"",ROUND(F${r}/E${r},2))`, fmt: 'money', style: 'calc' });
    s.put(8, r, { f: `IF(OR(F${r}="",E${r}=""),"",IF($C$3=0,G${r},ROUND(MAX(0,(B${r}-C${r}*(1+$C$3)^E${r})*$C$3/((1+$C$3)^E${r}-1)),2)))`, fmt: 'money', style: 'calc' });
    s.put(9, r, { f: `IF(B${r}="","",IF(B${r}=0,0,MIN(1,C${r}/B${r})))`, fmt: 'percent', style: 'calc' });
    s.put(10, r, { v: smp ? SAMPLE_NOTE : null, style });
  }
  const t = last + 1;
  s.put(1, t, { v: 'Total', style: 'total' });
  for (const c of [4, 5, 9, 10]) s.put(c, t, { v: null, style: 'total' });
  s.put(2, t, { f: `SUM(B${first}:B${last})`, fmt: 'money', style: 'total' });
  s.put(3, t, { f: `SUM(C${first}:C${last})`, fmt: 'money', style: 'total' });
  s.put(6, t, { f: `SUM(F${first}:F${last})`, fmt: 'money', style: 'total' });
  s.put(7, t, { f: `SUM(G${first}:G${last})`, fmt: 'money', style: 'total' });
  s.put(8, t, { f: `SUM(H${first}:H${last})`, fmt: 'money', style: 'total' });
  s.freeze(5);
  return { title: 'Metas financeiras', sheets: [inst.spec, s.spec] };
}

// ---------- 7. controle de investimentos ----------

export const INVESTMENT_TYPES = ['Renda fixa', 'Ações', 'Fundos imobiliários', 'ETFs', 'Fundos', 'Criptomoedas', 'Outros'];

export interface InvestmentsOptions { rows: number; withSamples: boolean; year: number }

export function investmentsWorkbook({ rows, withSamples, year }: InvestmentsOptions): WorkbookSpec {
  const inst = instructions('Controle de investimentos', ['Registre cada ativo com tipo, data da compra, quantidade, preço médio pago e preço atual.', 'A planilha calcula o valor investido, o valor atual e o resultado em reais e em porcentagem, além da alocação por tipo na aba "Resumo".', 'O preço atual deve ser atualizado por você; a planilha não consulta cotações. Resultados não incluem impostos, taxas nem proventos.', ...COMMON_STEPS]);
  const s = new Sheet('Ativos', [24, 20, 14, 12, 16, 16, 18, 18, 16, 14, 12], { primary: true, tabColor: 'FF0F766E' });
  s.row(1, ['Ativo', 'Tipo', 'Data da compra', 'Quantidade', 'Preço médio (R$)', 'Preço atual (R$)', 'Valor investido (R$)', 'Valor atual (R$)', 'Resultado (R$)', 'Resultado (%)', 'Obs.'], { style: 'header' });
  const samples: [string, string, [number, number, number], number, number, number][] = [
    ['Tesouro Selic (exemplo)', 'Renda fixa', [year, 2, 10], 1, 10000, 10420], ['Ação ABCD3 (fictícia)', 'Ações', [year, 3, 15], 100, 25.4, 28.1], ['FII WXYZ11 (fictício)', 'Fundos imobiliários', [year, 4, 5], 50, 98, 95.3],
  ];
  const last = rows + 1;
  for (let r = 2; r <= last; r++) {
    const smp = withSamples ? samples[r - 2] : undefined;
    const style = smp ? 'sample' : 'input';
    s.put(1, r, { v: smp ? smp[0] : null, style });
    s.put(2, r, { v: smp ? smp[1] : null, style });
    s.put(3, r, { v: smp ? { date: smp[2] } : null, fmt: 'date', style });
    s.put(4, r, { v: smp ? smp[3] : null, fmt: 'number', style });
    s.put(5, r, { v: smp ? smp[4] : null, fmt: 'money', style });
    s.put(6, r, { v: smp ? smp[5] : null, fmt: 'money', style });
    s.put(7, r, { f: `IF(OR(D${r}="",E${r}=""),"",ROUND(D${r}*E${r},2))`, fmt: 'money', style: 'calc' });
    s.put(8, r, { f: `IF(OR(D${r}="",F${r}=""),"",ROUND(D${r}*F${r},2))`, fmt: 'money', style: 'calc' });
    s.put(9, r, { f: `IF(OR(G${r}="",H${r}=""),"",H${r}-G${r})`, fmt: 'money', style: 'calc' });
    s.put(10, r, { f: `IF(OR(G${r}="",H${r}=""),"",IF(G${r}=0,0,I${r}/G${r}))`, fmt: 'percent', style: 'calc' });
    s.put(11, r, { v: smp ? SAMPLE_NOTE : null, style });
  }
  const t = last + 1;
  s.put(1, t, { v: 'Total', style: 'total' });
  for (const c of [2, 3, 4, 5, 6, 11]) s.put(c, t, { v: null, style: 'total' });
  s.put(7, t, { f: `SUM(G2:G${last})`, fmt: 'money', style: 'total' });
  s.put(8, t, { f: `SUM(H2:H${last})`, fmt: 'money', style: 'total' });
  s.put(9, t, { f: `H${t}-G${t}`, fmt: 'money', style: 'total' });
  s.put(10, t, { f: `IF(G${t}=0,0,I${t}/G${t})`, fmt: 'percent', style: 'total' });
  s.validate(`B2:B${last}`, `Listas!$A$2:$A$${INVESTMENT_TYPES.length + 1}`).freeze(1);

  const resumo = new Sheet('Resumo', [24, 18, 18, 14], { tabColor: 'FF14B8A6' });
  resumo.put(1, 1, { v: 'Alocação por tipo', style: 'title' });
  resumo.row(3, ['Tipo', 'Valor investido (R$)', 'Valor atual (R$)', '% da carteira'], { style: 'header' });
  const firstT = 4;
  const lastT = firstT + INVESTMENT_TYPES.length - 1;
  INVESTMENT_TYPES.forEach((_, i) => {
    const r = firstT + i;
    resumo.put(1, r, { f: `Listas!A${i + 2}`, style: 'calc' });
    resumo.put(2, r, { f: `SUMIF(Ativos!$B$2:$B$${last},A${r},Ativos!$G$2:$G$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(3, r, { f: `SUMIF(Ativos!$B$2:$B$${last},A${r},Ativos!$H$2:$H$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(4, r, { f: `IF($C$${lastT + 1}=0,0,C${r}/$C$${lastT + 1})`, fmt: 'percent', style: 'calc' });
  });
  resumo.put(1, lastT + 1, { v: 'Total', style: 'total' });
  resumo.put(2, lastT + 1, { f: `SUM(B${firstT}:B${lastT})`, fmt: 'money', style: 'total' });
  resumo.put(3, lastT + 1, { f: `SUM(C${firstT}:C${lastT})`, fmt: 'money', style: 'total' });
  resumo.put(4, lastT + 1, { f: `SUM(D${firstT}:D${lastT})`, fmt: 'percent', style: 'total' });
  const listas = new Sheet('Listas', [24], { tabColor: 'FF94A3B8' });
  listas.put(1, 1, { v: 'Tipos de ativo', style: 'header' });
  INVESTMENT_TYPES.forEach((t2, i) => listas.put(1, i + 2, { v: t2 }));
  return { title: 'Controle de investimentos', sheets: [inst.spec, s.spec, resumo.spec, listas.spec] };
}

// ---------- 8. planilha financeira pessoal (completa) ----------

export interface PersonalFinanceOptions { year: number; rows: number; withSamples: boolean }

export const INCOME_CATEGORIES = ['Salário', 'Freelas', 'Rendimentos', 'Outras receitas'];

export function personalFinanceWorkbook({ year, rows, withSamples }: PersonalFinanceOptions): WorkbookSpec {
  const last = rows + 1;
  const inst = instructions(`Planilha financeira pessoal ${year}`, ['Lance as receitas na aba "Receitas" e as despesas na aba "Despesas" (data, descrição, categoria e valor). O mês é preenchido sozinho.', 'A aba "Resumo mensal" soma por mês e mostra o saldo e a taxa de poupança; a aba "Patrimônio" calcula o que você tem menos o que deve.', ...COMMON_STEPS]);

  const makeLog = (name: string, categories: string[], list: 'A' | 'B', samples: [number, number, string, string, number][], primary: boolean): Sheet => {
    const s = new Sheet(name, [13, 34, 22, 16, 8, 12], { ...(primary ? { primary: true } : {}), tabColor: 'FF0F766E' });
    s.row(1, ['Data', 'Descrição', 'Categoria', 'Valor (R$)', 'Mês', 'Obs.'], { style: 'header' });
    for (let r = 2; r <= last; r++) {
      const smp = withSamples ? samples[r - 2] : undefined;
      const style = smp ? 'sample' : 'input';
      s.put(1, r, { v: smp ? { date: [year, smp[0], smp[1]] } : null, fmt: 'date', style });
      s.put(2, r, { v: smp ? smp[2] : null, style });
      s.put(3, r, { v: smp ? smp[3] : null, style });
      s.put(4, r, { v: smp ? smp[4] : null, fmt: 'money', style });
      s.put(5, r, { f: `IF(A${r}="","",MONTH(A${r}))`, fmt: 'int', style: 'calc' });
      s.put(6, r, { v: smp ? SAMPLE_NOTE : null, style });
    }
    s.validate(`C2:C${last}`, `Listas!$${list}$2:$${list}$${categories.length + 1}`).freeze(1);
    return s;
  };
  const receitas = makeLog('Receitas', INCOME_CATEGORIES, 'A', [[1, 5, 'Salário de janeiro', 'Salário', 5200], [1, 20, 'Projeto de design', 'Freelas', 800], [2, 5, 'Salário de fevereiro', 'Salário', 5200]], true);
  const despesas = makeLog('Despesas', EXPENSE_CATEGORIES, 'B', [[1, 3, 'Aluguel', 'Moradia', 1500], [1, 8, 'Supermercado', 'Alimentação', 640], [1, 15, 'Plano de saúde', 'Saúde', 380], [2, 3, 'Aluguel', 'Moradia', 1500]], false);

  const resumo = new Sheet('Resumo mensal', [12, 16, 16, 16, 16], { tabColor: 'FF14B8A6' });
  resumo.put(1, 1, { v: `Resumo mensal ${year}`, style: 'title' });
  resumo.row(3, ['Mês', 'Receitas (R$)', 'Despesas (R$)', 'Saldo (R$)', 'Taxa de poupança'], { style: 'header' });
  for (let m = 1; m <= 12; m++) {
    const r = 3 + m;
    resumo.put(1, r, { v: MONTHS_SHORT[m - 1]! });
    resumo.put(2, r, { f: `SUMIF(Receitas!$E$2:$E$${last},${m},Receitas!$D$2:$D$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(3, r, { f: `SUMIF(Despesas!$E$2:$E$${last},${m},Despesas!$D$2:$D$${last})`, fmt: 'money', style: 'calc' });
    resumo.put(4, r, { f: `B${r}-C${r}`, fmt: 'money', style: 'calc' });
    resumo.put(5, r, { f: `IF(B${r}=0,0,D${r}/B${r})`, fmt: 'percent', style: 'calc' });
  }
  resumo.put(1, 16, { v: 'Ano', style: 'total' });
  resumo.put(2, 16, { f: 'SUM(B4:B15)', fmt: 'money', style: 'total' });
  resumo.put(3, 16, { f: 'SUM(C4:C15)', fmt: 'money', style: 'total' });
  resumo.put(4, 16, { f: 'B16-C16', fmt: 'money', style: 'total' });
  resumo.put(5, 16, { f: 'IF(B16=0,0,D16/B16)', fmt: 'percent', style: 'total' });

  const pat = new Sheet('Patrimônio', [30, 18, 4, 30, 18], { tabColor: 'FF14B8A6' });
  pat.put(1, 1, { v: 'Patrimônio', style: 'title' });
  pat.row(3, ['Ativos (o que você tem)', 'Valor (R$)', null, 'Passivos (o que você deve)', 'Valor (R$)'], { style: 'header' });
  const assets: [string, number][] = [['Conta corrente', 3200], ['Reserva de emergência', 12000], ['Investimentos', 18000], ['Veículo (valor de mercado)', 35000]];
  const liabilities: [string, number][] = [['Cartão de crédito', 1800], ['Financiamento', 22000]];
  for (let i = 0; i < 8; i++) {
    const r = 4 + i;
    const a = withSamples ? assets[i] : undefined;
    const l = withSamples ? liabilities[i] : undefined;
    pat.put(1, r, { v: a ? `${a[0]} (${SAMPLE_NOTE})` : null, style: a ? 'sample' : 'input' });
    pat.put(2, r, { v: a ? a[1] : null, fmt: 'money', style: a ? 'sample' : 'input' });
    pat.put(4, r, { v: l ? `${l[0]} (${SAMPLE_NOTE})` : null, style: l ? 'sample' : 'input' });
    pat.put(5, r, { v: l ? l[1] : null, fmt: 'money', style: l ? 'sample' : 'input' });
  }
  pat.put(1, 12, { v: 'Total de ativos', style: 'total' });
  pat.put(2, 12, { f: 'SUM(B4:B11)', fmt: 'money', style: 'total' });
  pat.put(4, 12, { v: 'Total de passivos', style: 'total' });
  pat.put(5, 12, { f: 'SUM(E4:E11)', fmt: 'money', style: 'total' });
  pat.put(1, 14, { v: 'Patrimônio líquido', style: 'label' });
  pat.put(2, 14, { f: 'B12-E12', fmt: 'money', style: 'calc' });

  const listas = new Sheet('Listas', [22, 22], { tabColor: 'FF94A3B8' });
  listas.row(1, ['Categorias de receita', 'Categorias de despesa'], { style: 'header' });
  INCOME_CATEGORIES.forEach((c, i) => listas.put(1, i + 2, { v: c }));
  EXPENSE_CATEGORIES.forEach((c, i) => listas.put(2, i + 2, { v: c }));
  return { title: `Planilha financeira pessoal ${year}`, sheets: [inst.spec, receitas.spec, despesas.spec, resumo.spec, pat.spec, listas.spec] };
}

// ---------- ferramentas ----------

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const commonInput = {
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  withSamples: z.boolean().default(true),
};

const commonFields = {
  format: { label: 'Formato do arquivo', optionLabels: { xlsx: 'Excel (.xlsx) com fórmulas', csv: 'CSV (planilha principal, com valores calculados)' } },
  withSamples: { label: 'Incluir linhas de exemplo fictícias', help: 'As linhas de exemplo ficam em itálico cinza e marcadas como "exemplo".' },
};

const commonOutput = z.object({
  fileName: z.string(),
  xlsx: z.string(),
  csv: z.string(),
  sheets: z.array(z.string()),
  summary: z.string(),
});

const commonOutputLabels = { fileName: 'Arquivo', xlsx: 'Conteúdo XLSX (Base64)', csv: 'Conteúdo CSV', sheets: 'Abas', summary: 'Resumo' };

function commonDownloads(baseName: string) {
  return [
    { field: 'xlsx', fileName: `${baseName}.xlsx`, mimeType: XLSX_MIME, encoding: 'base64' as const, label: 'Baixar planilha (.xlsx)' },
    { field: 'csv', fileName: `${baseName}.csv`, mimeType: 'text/csv;charset=utf-8', label: 'Baixar CSV' },
  ];
}

async function produce(spec: WorkbookSpec, format: 'xlsx' | 'csv', baseName: string, summary: string) {
  const sheets = spec.sheets.map((s) => s.name);
  if (format === 'csv') {
    const computed = computeWorkbook(spec);
    return { fileName: `${baseName}.csv`, xlsx: '', csv: sheetToCsv(spec, computed), sheets, summary };
  }
  const { base64 } = await buildXlsx(spec);
  return { fileName: `${baseName}.xlsx`, xlsx: base64, csv: '', sheets, summary };
}

const nowYear = () => today().year;

function sheetTool(config: {
  id: string; name: string; description: string; keywords: string[]; icon: string; baseName: string; documentation: string;
  schema: z.ZodRawShape; fields: Record<string, { label: string; help?: string; placeholder?: string; multiline?: boolean }>;
  build: (input: Record<string, unknown>) => { spec: WorkbookSpec; summary: string };
  example: Record<string, unknown>;
}): Tool {
  return defineTool({
    id: config.id,
    name: config.name,
    description: config.description,
    category: 'planilhas',
    keywords: config.keywords,
    icon: config.icon,
    modes: ['browser', 'node'],
    inputSchema: z.object({ ...config.schema, ...commonInput }),
    outputSchema: commonOutput,
    execute: async (input) => {
      const { format, ...rest } = input as { format: 'xlsx' | 'csv' } & Record<string, unknown>;
      const { spec, summary } = config.build({ ...rest, withSamples: (input as { withSamples: boolean }).withSamples });
      return produce(spec, format, config.baseName, summary);
    },
    fields: { ...config.fields, ...commonFields },
    outputLabels: commonOutputLabels,
    downloads: commonDownloads(config.baseName),
    hiddenOutputs: ['xlsx'],
    examples: [{ description: 'Modelo com exemplos', input: config.example }],
    documentation: `${config.documentation} O arquivo é gerado no seu dispositivo, sem enviar dados a servidores. Os valores calculados são conferidos nos testes recalculando as fórmulas do arquivo gerado. No CSV, só a aba principal é exportada, com os resultados das fórmulas; textos iniciados por =, +, - ou @ ganham um apóstrofo para evitar a execução de fórmulas ao abrir no Excel.`,
  });
}

const rowsSchema = (def: number, max = 500) => ({ rows: z.number().int().min(5).max(max).default(def) });
const yearSchema = z.number().int().min(2000).max(2100).default(nowYear());

export const expensesSheetTool = sheetTool({
  id: 'planilha-gastos', name: 'Planilha de Gastos Pessoais', description: 'Gera uma planilha para registrar gastos por categoria e forma de pagamento, com resumo automático', keywords: ['planilha', 'gastos', 'despesas', 'controle', 'excel', 'orçamento', 'categorias'], icon: '💸', baseName: 'planilha-de-gastos',
  documentation: 'Cria as abas Gastos (lançamentos com lista de categorias e formas de pagamento), Resumo (totais e percentuais por categoria e forma de pagamento com SUMIF), Listas e Instruções.',
  schema: { ...rowsSchema(100), year: yearSchema }, fields: { rows: { label: 'Linhas de lançamentos' }, year: { label: 'Ano das datas de exemplo' } },
  build: (i) => ({ spec: expensesWorkbook({ rows: i.rows as number, withSamples: i.withSamples as boolean, year: i.year as number }), summary: `${i.rows} linhas de lançamento, resumo por categoria e por forma de pagamento.` }),
  example: { rows: 100, year: 2026, format: 'xlsx', withSamples: true },
});

export const cashFlowSheetTool = sheetTool({
  id: 'controle-financeiro', name: 'Planilha de Controle Financeiro', description: 'Gera o fluxo de caixa do ano, mês a mês, com saldo do mês e saldo acumulado', keywords: ['controle financeiro', 'fluxo de caixa', 'receitas', 'despesas', 'saldo', 'planilha', 'anual'], icon: '📊', baseName: 'controle-financeiro',
  documentation: 'Cria o fluxo de caixa anual com receitas e despesas por categoria, total mensal e anual, saldo do mês e saldo acumulado a partir do saldo inicial.',
  schema: { year: yearSchema, incomeCategories: z.string().max(1000).optional(), expenseCategories: z.string().max(2000).optional(), initialBalance: z.number().finite().min(-1e9).max(1e9).default(0) },
  fields: { year: { label: 'Ano' }, incomeCategories: { label: 'Categorias de receita (uma por linha)', multiline: true, help: 'Opcional. Padrão: Salário, Rendimentos, Outras receitas.' }, expenseCategories: { label: 'Categorias de despesa (uma por linha)', multiline: true, help: 'Opcional. Padrão: as categorias comuns.' }, initialBalance: { label: 'Saldo inicial (R$)' } },
  build: (i) => ({ spec: cashFlowWorkbook({ year: i.year as number, income: lines(i.incomeCategories as string | undefined, ['Salário', 'Rendimentos', 'Outras receitas']).slice(0, 20).map(safeLabel), expenses: lines(i.expenseCategories as string | undefined, EXPENSE_CATEGORIES.slice(0, 8)).slice(0, 40).map(safeLabel), initialBalance: i.initialBalance as number, withSamples: i.withSamples as boolean }), summary: 'Fluxo de caixa anual com saldo mensal e acumulado.' }),
  example: { year: 2026, initialBalance: 1000, format: 'xlsx', withSamples: true },
});

export const budgetSheetTool = sheetTool({
  id: 'orcamento-mensal', name: 'Planilha de Orçamento Mensal', description: 'Gera um orçamento mensal com planejado versus realizado por categoria e alertas de estouro', keywords: ['orçamento', 'orçamento mensal', 'planejado', 'realizado', 'planilha', 'categorias', 'metas de gastos'], icon: '🧮', baseName: 'orcamento-mensal',
  documentation: 'Distribui a renda líquida em categorias (com percentuais editáveis), calcula o valor planejado e compara com o realizado, avisando quando uma categoria passa do planejado e se os percentuais somam 100%.',
  schema: { income: z.number().finite().positive().max(1e9).default(5000) }, fields: { income: { label: 'Renda líquida do mês (R$)' } },
  build: (i) => ({ spec: budgetWorkbook({ income: i.income as number, withSamples: i.withSamples as boolean }), summary: 'Orçamento com planejado, realizado, diferença e situação por categoria.' }),
  example: { income: 5000, format: 'xlsx', withSamples: true },
});

export const rentSheetTool = sheetTool({
  id: 'controle-aluguel', name: 'Planilha de Controle de Aluguel', description: 'Gera o controle das parcelas de aluguel com reajuste anual, atraso, multa, juros e saldo', keywords: ['aluguel', 'controle de aluguel', 'locação', 'inquilino', 'multa', 'juros', 'reajuste', 'planilha'], icon: '🏠', baseName: 'controle-de-aluguel',
  documentation: 'Gera as parcelas mensais com vencimento, valor reajustado a cada 12 meses, e calcula dias de atraso, multa, juros pro rata e saldo de cada parcela a partir da data e do valor pagos.',
  schema: { startYear: z.number().int().min(2000).max(2100).default(nowYear()), startMonth: z.number().int().min(1).max(12).default(1), months: z.number().int().min(1).max(120).default(12), dueDay: z.number().int().min(1).max(28).default(5), baseRent: z.number().finite().positive().max(1e7).default(1500), adjustmentPercent: z.number().min(0).max(100).default(5), finePercent: z.number().min(0).max(100).default(2), interestPercent: z.number().min(0).max(100).default(1) },
  fields: { startYear: { label: 'Ano do primeiro vencimento' }, startMonth: { label: 'Mês do primeiro vencimento (1 a 12)' }, months: { label: 'Número de parcelas' }, dueDay: { label: 'Dia de vencimento (1 a 28)' }, baseRent: { label: 'Aluguel base (R$)' }, adjustmentPercent: { label: 'Reajuste anual (%)' }, finePercent: { label: 'Multa por atraso (%)', help: 'Por lei, a multa em contratos de aluguel costuma ser de até 10%; veja o seu contrato.' }, interestPercent: { label: 'Juros ao mês (%)' } },
  build: (i) => ({ spec: rentWorkbook({ startYear: i.startYear as number, startMonth: i.startMonth as number, months: i.months as number, dueDay: i.dueDay as number, baseRent: i.baseRent as number, adjustmentPercent: i.adjustmentPercent as number, finePercent: i.finePercent as number, interestPercent: i.interestPercent as number, withSamples: i.withSamples as boolean }), summary: `${i.months} parcelas com reajuste anual de ${i.adjustmentPercent}%.` }),
  example: { startYear: 2026, startMonth: 1, months: 12, dueDay: 5, baseRent: 1500, adjustmentPercent: 5, finePercent: 2, interestPercent: 1, format: 'xlsx', withSamples: true },
});

export const debtsSheetTool = sheetTool({
  id: 'controle-dividas', name: 'Planilha de Controle de Dívidas', description: 'Gera uma planilha para listar dívidas, calcular parcelas e saldo devedor e priorizar o pagamento pela maior taxa', keywords: ['dívidas', 'controle de dívidas', 'quitar', 'parcelas', 'saldo devedor', 'avalanche', 'juros', 'planilha'], icon: '📉', baseName: 'controle-de-dividas',
  documentation: 'Para cada dívida calcula a parcela (Tabela Price), parcelas restantes, saldo devedor, total a pagar e a prioridade de quitação pela maior taxa de juros (método avalanche).',
  schema: rowsSchema(15, 100), fields: { rows: { label: 'Linhas para dívidas' } },
  build: (i) => ({ spec: debtsWorkbook({ rows: i.rows as number, withSamples: i.withSamples as boolean }), summary: `${i.rows} linhas de dívidas com saldo devedor e prioridade.` }),
  example: { rows: 15, format: 'xlsx', withSamples: true },
});

export const goalsSheetTool = sheetTool({
  id: 'metas-financeiras', name: 'Planilha de Metas Financeiras', description: 'Gera uma planilha de metas com prazo, quanto guardar por mês (com e sem rendimento) e progresso', keywords: ['metas financeiras', 'objetivos', 'poupar', 'guardar dinheiro', 'reserva de emergência', 'prazo', 'planilha'], icon: '🎯', baseName: 'metas-financeiras',
  documentation: 'Calcula, para cada meta, os meses restantes, quanto falta e o aporte mensal necessário sem e com um rendimento mensal hipotético, além do percentual atingido.',
  schema: { ...rowsSchema(10, 100), refYear: z.number().int().min(2000).max(2100).default(nowYear()), refMonth: z.number().int().min(1).max(12).default(today().month), monthlyReturnPercent: z.number().min(0).max(10).default(0.6) },
  fields: { rows: { label: 'Linhas para metas' }, refYear: { label: 'Ano de início' }, refMonth: { label: 'Mês de início (1 a 12)' }, monthlyReturnPercent: { label: 'Rendimento esperado ao mês (%)', help: 'Hipótese sua; use 0 para ignorar rendimentos.' } },
  build: (i) => ({ spec: goalsWorkbook({ rows: i.rows as number, withSamples: i.withSamples as boolean, refYear: i.refYear as number, refMonth: i.refMonth as number, monthlyReturnPercent: i.monthlyReturnPercent as number }), summary: `${i.rows} linhas de metas, rendimento de ${i.monthlyReturnPercent}% ao mês.` }),
  example: { rows: 10, refYear: 2026, refMonth: 1, monthlyReturnPercent: 0.6, format: 'xlsx', withSamples: true },
});

export const investmentsSheetTool = sheetTool({
  id: 'controle-investimentos', name: 'Planilha de Controle de Investimentos', description: 'Gera uma planilha da carteira com valor investido, valor atual, resultado e alocação por tipo de ativo', keywords: ['investimentos', 'carteira', 'ações', 'renda fixa', 'fiis', 'rentabilidade', 'alocação', 'planilha'], icon: '📈', baseName: 'controle-de-investimentos',
  documentation: 'Registra ativos com quantidade e preços, calcula valor investido, valor atual e resultado (R$ e %), e a aba Resumo mostra a alocação da carteira por tipo.',
  schema: { ...rowsSchema(30), year: yearSchema }, fields: { rows: { label: 'Linhas para ativos' }, year: { label: 'Ano das datas de exemplo' } },
  build: (i) => ({ spec: investmentsWorkbook({ rows: i.rows as number, withSamples: i.withSamples as boolean, year: i.year as number }), summary: `${i.rows} linhas de ativos com resultado e alocação por tipo.` }),
  example: { rows: 30, year: 2026, format: 'xlsx', withSamples: true },
});

export const personalFinanceSheetTool = sheetTool({
  id: 'planilha-financeira-pessoal', name: 'Planilha Financeira Pessoal Completa', description: 'Gera uma planilha completa com receitas, despesas, resumo mensal, taxa de poupança e patrimônio', keywords: ['planilha financeira', 'finanças pessoais', 'receitas e despesas', 'patrimônio', 'taxa de poupança', 'resumo mensal', 'excel'], icon: '🗂️', baseName: 'planilha-financeira-pessoal',
  documentation: 'Reúne abas de Receitas, Despesas, Resumo mensal (SUMIF por mês), Patrimônio (ativos, passivos e patrimônio líquido), Listas e Instruções, com taxa de poupança calculada.',
  schema: { ...rowsSchema(150), year: yearSchema }, fields: { rows: { label: 'Linhas por aba de lançamentos' }, year: { label: 'Ano' } },
  build: (i) => ({ spec: personalFinanceWorkbook({ year: i.year as number, rows: i.rows as number, withSamples: i.withSamples as boolean }), summary: 'Receitas, despesas, resumo mensal e patrimônio.' }),
  example: { rows: 150, year: 2026, format: 'xlsx', withSamples: true },
});

export const spreadsheetTools = [expensesSheetTool, cashFlowSheetTool, budgetSheetTool, rentSheetTool, debtsSheetTool, goalsSheetTool, investmentsSheetTool, personalFinanceSheetTool];

