import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { base64ToBytes } from '@esc/gen-core';
import {
  EXPENSE_CATEGORIES, INVESTMENT_TYPES, PAYMENT_METHODS, Workbook, budgetSheetTool, cashFlowSheetTool, csvField, csvText, dateToSerial, debtsSheetTool, expensesSheetTool, goalsSheetTool,
  investmentsSheetTool, personalFinanceSheetTool, rentSheetTool, spreadsheetTools,
} from './index.js';
import type { CellValue } from './index.js';

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string; issues?: { path: string }[] } };
const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => {
  const r = await run(tool, input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
};
const fails = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown, fragment?: string) => {
  const r = await run(tool, input);
  expect(r.ok).toBe(false);
  if (!r.ok && fragment) expect(JSON.stringify(r.error)).toContain(fragment);
};

/** Abre o XLSX gerado e reconstrói, a partir do arquivo, um motor de fórmulas independente da geração. */
async function open(base64: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base64ToBytes(base64).buffer as ArrayBuffer);
  const engine = new Workbook();
  const cached = new Map<string, Map<string, CellValue>>();
  for (const ws of wb.worksheets) {
    engine.addSheet(ws.name);
    cached.set(ws.name, new Map());
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'formula' in v) {
          engine.set(ws.name, cell.address, { formula: String(v.formula) });
          const r = v.result as unknown;
          cached.get(ws.name)!.set(cell.address, r instanceof Date ? dateToSerial(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate()) : ((r ?? null) as CellValue));
        } else if (v instanceof Date) {
          engine.set(ws.name, cell.address, { value: dateToSerial(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) });
        } else if (v !== null && typeof v !== 'object') {
          engine.set(ws.name, cell.address, { value: v as CellValue });
        }
      });
    });
  }
  return { wb, engine, cached };
}

type Opened = Awaited<ReturnType<typeof open>>;

/** Todo valor em cache precisa ser igual ao que o motor recalcula a partir das fórmulas do arquivo. */
function expectCachedMatchesRecalc({ engine, cached }: Opened) {
  let formulas = 0;
  for (const [sheet, cells] of cached) {
    for (const [address, result] of cells) {
      formulas++;
      const recalculated = engine.get(sheet, address);
      const label = `${sheet}!${address}`;
      if (typeof recalculated === 'number' && typeof result === 'number') expect(result, label).toBeCloseTo(recalculated, 8);
      // O leitor do exceljs descarta o valor em cache quando ele é 0 ou texto vazio (o arquivo tem <v>0</v>).
      else if ((result === null || result === '' || result === undefined) && (recalculated === 0 || recalculated === '' || recalculated === null || recalculated === false)) continue;
      else expect(result ?? '', label).toEqual(recalculated ?? '');
    }
  }
  return formulas;
}

const val = (o: Opened, sheet: string, address: string) => o.engine.get(sheet, address);
const generate = async (tool: Parameters<typeof data>[0], input: Record<string, unknown>) => open(String((await data(tool, { format: 'xlsx', ...input })).xlsx));

describe('estrutura comum dos arquivos', () => {
  it('toda planilha abre, tem nomes de aba válidos e únicos e valores em cache corretos', async () => {
    for (const tool of spreadsheetTools) {
      const o = await generate(tool as never, {});
      const names = o.wb.worksheets.map((w) => w.name);
      expect(new Set(names).size, tool.id).toBe(names.length);
      expect(names[0], tool.id).toBe('Instruções');
      for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
      expect(expectCachedMatchesRecalc(o), tool.id).toBeGreaterThan(5);
    }
  });

  it('nenhuma fórmula gera erro, nem com a planilha vazia', async () => {
    for (const tool of spreadsheetTools) {
      const o = await generate(tool as never, { withSamples: false });
      for (const [sheet, cells] of o.cached) for (const address of cells.keys()) expect(() => o.engine.get(sheet, address), `${tool.id} ${sheet}!${address}`).not.toThrow();
    }
  });

  it('as instruções explicam as cores e avisam que os exemplos são fictícios', async () => {
    for (const tool of spreadsheetTools) {
      const o = await generate(tool as never, {});
      const text = o.wb.getWorksheet('Instruções')!.getColumn(1).values.join('\n');
      expect(text, tool.id).toContain('FICTÍCIOS');
      expect(text, tool.id).toContain('amarelo');
    }
  });

  it('linhas de exemplo ficam marcadas, e sem exemplos a planilha vem limpa', async () => {
    const withSamples = await generate(expensesSheetTool, { rows: 20, withSamples: true });
    const ws = withSamples.wb.getWorksheet('Gastos')!;
    expect(ws.getCell('F2').value).toBe('exemplo');
    expect(ws.getCell('B2').font?.italic).toBe(true);
    expect(ws.getCell('B2').font?.color?.argb).toBe('FF6B7280');
    const clean = await generate(expensesSheetTool, { rows: 20, withSamples: false });
    const empty = clean.wb.getWorksheet('Gastos')!;
    for (let r = 2; r <= 21; r++) for (const c of ['A', 'B', 'C', 'D', 'E', 'F']) expect(empty.getCell(`${c}${r}`).value, `${c}${r}`).toBeNull();
    expect(val(clean, 'Resumo', 'B14')).toBe(0);
  });

  it('o arquivo tem tipo MIME e nome corretos nas opções de download', async () => {
    for (const tool of spreadsheetTools) {
      const xlsx = tool.downloads.find((d) => d.field === 'xlsx')!;
      expect(xlsx.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(xlsx.encoding).toBe('base64');
      expect(xlsx.fileName.endsWith('.xlsx')).toBe(true);
      expect(tool.hiddenOutputs).toContain('xlsx');
    }
    const r = await data(expensesSheetTool, { format: 'xlsx' });
    expect(base64ToBytes(String(r.xlsx)).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b])); // "PK": arquivo zip (XLSX)
    expect(r.csv).toBe('');
  });
});

describe('planilha de gastos pessoais', () => {
  it('resumo confere com a soma independente dos exemplos', async () => {
    const o = await generate(expensesSheetTool, { rows: 50 });
    // Categorias nas linhas 4 a 13 do Resumo, na ordem de EXPENSE_CATEGORIES.
    const byCategory: Record<string, number> = { Moradia: 1500 + 187.35, Alimentação: 482.9 + 112.4, Transporte: 220, Saúde: 64.5, Educação: 89.9, Lazer: 48 };
    EXPENSE_CATEGORIES.forEach((cat, i) => expect(val(o, 'Resumo', `B${4 + i}`), cat).toBeCloseTo(byCategory[cat] ?? 0, 8));
    expect(val(o, 'Resumo', 'B14')).toBeCloseTo(2705.05, 8);
    expect(val(o, 'Resumo', 'C14')).toBeCloseTo(1, 10);
    expect(val(o, 'Resumo', 'B15')).toBeCloseTo(0, 10); // nada sem categoria
    // Formas de pagamento (a partir da linha 18).
    const byPay: Record<string, number> = { Pix: 1500 + 89.9, Débito: 482.9 + 64.5, Crédito: 220 + 48 + 112.4, Boleto: 187.35 };
    PAYMENT_METHODS.forEach((m, i) => expect(val(o, 'Resumo', `B${18 + i}`), m).toBeCloseTo(byPay[m] ?? 0, 8));
    expect(val(o, 'Resumo', 'A4')).toBe('Moradia');
  });

  it('o resumo reage a novos lançamentos digitados pelo usuário', async () => {
    const o = await generate(expensesSheetTool, { rows: 50 });
    o.engine.set('Gastos', 'C30', { value: 'Lazer' });
    o.engine.set('Gastos', 'D30', { value: 'Pix' });
    o.engine.set('Gastos', 'E30', { value: 100 });
    expect(val(o, 'Resumo', 'B9')).toBeCloseTo(148, 8); // Lazer 48 + 100
    expect(val(o, 'Resumo', 'B14')).toBeCloseTo(2805.05, 8);
    o.engine.set('Gastos', 'C31', { value: 'Categoria nova' });
    o.engine.set('Gastos', 'E31', { value: 50 });
    expect(val(o, 'Resumo', 'B15')).toBeCloseTo(50, 8); // aparece em "sem categoria"
  });

  it('tem validação de lista nas colunas, formato de data e moeda e painel congelado', async () => {
    const o = await generate(expensesSheetTool, { rows: 20 });
    const ws = o.wb.getWorksheet('Gastos')!;
    expect(ws.getCell('C2').dataValidation).toMatchObject({ type: 'list', formulae: ['Listas!$A$2:$A$11'] });
    expect(ws.getCell('D20').dataValidation).toMatchObject({ type: 'list', formulae: ['Listas!$B$2:$B$6'] });
    expect(ws.getCell('A2').numFmt).toBe('dd/mm/yyyy');
    expect(ws.getCell('E2').numFmt).toBe('"R$" #,##0.00');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getCell('A2').value).toEqual(new Date(Date.UTC(new Date().getFullYear(), 0, 3)));
    expect(o.wb.getWorksheet('Listas')!.getCell('A2').value).toBe('Moradia');
  });

  it('opções e erros', async () => {
    expect((await open(String((await data(expensesSheetTool, { rows: 500, year: 2030 })).xlsx))).wb.getWorksheet('Gastos')!.getCell('A2').value).toEqual(new Date(Date.UTC(2030, 0, 3)));
    await fails(expensesSheetTool, { rows: 4 });
    await fails(expensesSheetTool, { rows: 501 });
    await fails(expensesSheetTool, { year: 1999 });
    await fails(expensesSheetTool, { format: 'pdf' });
  });
});

describe('controle financeiro (fluxo de caixa)', () => {
  it('saldos mensais e acumulados conferem com o cálculo independente', async () => {
    const o = await generate(cashFlowSheetTool, { year: 2026, initialBalance: 1000 });
    // Receitas: 5200 + 300 + 0 por mês; despesas: soma das 8 categorias de exemplo = 3350.
    expect(val(o, 'Fluxo de caixa', 'B9')).toBe(5500);
    expect(val(o, 'Fluxo de caixa', 'N9')).toBe(5500 * 12);
    const header = o.wb.getWorksheet('Fluxo de caixa')!;
    let balanceRow = 0;
    let totalExpenseRow = 0;
    header.getColumn(1).eachCell((cell, row) => {
      if (cell.value === 'Saldo do mês') balanceRow = row;
      if (cell.value === 'Total de despesas') totalExpenseRow = row;
    });
    expect(val(o, 'Fluxo de caixa', `B${totalExpenseRow}`)).toBe(3350);
    expect(val(o, 'Fluxo de caixa', `B${balanceRow}`)).toBe(2150);
    expect(val(o, 'Fluxo de caixa', `B${balanceRow + 1}`)).toBe(3150);
    expect(val(o, 'Fluxo de caixa', `M${balanceRow + 1}`)).toBe(1000 + 12 * 2150);
    expect(val(o, 'Fluxo de caixa', `N${balanceRow}`)).toBe(12 * 2150);
    expect(val(o, 'Fluxo de caixa', 'A1')).toBe('Fluxo de caixa 2026');
  });

  it('categorias personalizadas e saldo inicial negativo', async () => {
    const o = await generate(cashFlowSheetTool, { year: 2026, incomeCategories: 'Salário\nFreela', expenseCategories: 'Aluguel\nMercado', initialBalance: -500, withSamples: false });
    const ws = o.wb.getWorksheet('Fluxo de caixa')!;
    expect(ws.getCell('A6').value).toBe('Salário');
    expect(ws.getCell('A7').value).toBe('Freela');
    expect(val(o, 'Fluxo de caixa', 'B2')).toBe(-500);
    // Sem lançamentos, o saldo acumulado é o saldo inicial.
    let acc = 0;
    ws.getColumn(1).eachCell((c, r) => { if (c.value === 'Saldo acumulado') acc = r; });
    expect(val(o, 'Fluxo de caixa', `M${acc}`)).toBe(-500);
  });

  it('um valor digitado altera os totais em cadeia', async () => {
    const o = await generate(cashFlowSheetTool, { year: 2026, withSamples: false });
    o.engine.set('Fluxo de caixa', 'D6', { value: 1000 });
    expect(val(o, 'Fluxo de caixa', 'D9')).toBe(1000);
    expect(val(o, 'Fluxo de caixa', 'N6')).toBe(1000);
  });

  it('nomes de categoria hostis não viram fórmula nem quebram o arquivo', async () => {
    const r = await data(cashFlowSheetTool, { year: 2026, format: 'xlsx', expenseCategories: '=HYPERLINK("http://x","clique")\n@SUM(A1)\n[perigo]:x' });
    const o = await open(String(r.xlsx));
    const cell = o.wb.getWorksheet('Fluxo de caixa')!.getCell('A12');
    expect(typeof cell.value).toBe('string');
    expect(String(cell.value)).toContain('HYPERLINK');
    expect((cell.value as unknown as { formula?: string }).formula).toBeUndefined();
    const csv = String((await data(cashFlowSheetTool, { year: 2026, format: 'csv', expenseCategories: '=1+1\n+2\n-3\n@x' })).csv);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+2");
    expect(csv).toContain("'-3");
    expect(csv).toContain("'@x");
  });
});

describe('orçamento mensal', () => {
  it('planejado, diferença e situação batem com o cálculo independente', async () => {
    const o = await generate(budgetSheetTool, { income: 5000 });
    const planned = [1500, 750, 500, 250, 250, 500, 250, 750, 250];
    const realized = [1480, 760, 330, 140, 100, 420, 150, 600, 90];
    planned.forEach((p, i) => {
      expect(val(o, 'Orçamento', `C${5 + i}`)).toBe(p);
      expect(val(o, 'Orçamento', `E${5 + i}`)).toBe(p - realized[i]!);
      expect(val(o, 'Orçamento', `F${5 + i}`)).toBe(realized[i]! > p ? 'Acima do planejado' : 'Dentro do planejado');
    });
    expect(val(o, 'Orçamento', 'F6')).toBe('Acima do planejado'); // alimentação: 760 > 750
    expect(val(o, 'Orçamento', 'B14')).toBeCloseTo(1, 10);
    expect(val(o, 'Orçamento', 'F14')).toBe('Percentuais somam 100%');
    expect(val(o, 'Orçamento', 'C14')).toBe(5000);
    expect(val(o, 'Orçamento', 'D14')).toBe(4070);
    expect(val(o, 'Orçamento', 'B16')).toBe(930); // sobra
  });

  it('avisa quando os percentuais não somam 100% e recalcula com outra renda', async () => {
    const o = await generate(budgetSheetTool, { income: 5000 });
    o.engine.set('Orçamento', 'B5', { value: 0.4 });
    expect(val(o, 'Orçamento', 'F14')).toBe('Ajuste os percentuais: não somam 100%');
    o.engine.set('Orçamento', 'B2', { value: 10000 });
    expect(val(o, 'Orçamento', 'C5')).toBe(4000);
    await fails(budgetSheetTool, { income: 0 });
  });
});

describe('controle de aluguel', () => {
  const input = { startYear: 2026, startMonth: 1, months: 24, dueDay: 5, baseRent: 1500, adjustmentPercent: 5, finePercent: 2, interestPercent: 1 };

  it('vencimentos, reajuste anual e situação das parcelas', async () => {
    const o = await generate(rentSheetTool, input);
    const row = (n: number) => 8 + n; // parcela n na linha 8 + n
    expect(val(o, 'Controle', `B${row(1)}`)).toBe(dateToSerial(2026, 1, 5));
    expect(val(o, 'Controle', `B${row(2)}`)).toBe(dateToSerial(2026, 2, 5));
    expect(val(o, 'Controle', `B${row(13)}`)).toBe(dateToSerial(2027, 1, 5));
    expect(val(o, 'Controle', `C${row(12)}`)).toBe(1500);
    expect(val(o, 'Controle', `C${row(13)}`)).toBe(1575); // reajuste de 5% a cada 12 meses
    expect(val(o, 'Controle', `C${row(24)}`)).toBe(1575); // ainda no segundo ano
    // Amostras: 1 paga em dia; 2 paga com 6 dias de atraso; 3 em aberto.
    expect(val(o, 'Controle', `F${row(1)}`)).toBe(0);
    expect(val(o, 'Controle', `I${row(1)}`)).toBe('Quitado');
    expect(val(o, 'Controle', `F${row(2)}`)).toBe(6);
    expect(val(o, 'Controle', `G${row(2)}`)).toBe(33); // multa 30 + juros 3
    expect(val(o, 'Controle', `H${row(2)}`)).toBe(33);
    expect(val(o, 'Controle', `I${row(2)}`)).toBe('Pendente');
    expect(val(o, 'Controle', `I${row(3)}`)).toBe('Em aberto');
    expect(val(o, 'Controle', `F${row(3)}`)).toBe('');
  });

  it('pagamento digitado recalcula atraso, multa e saldo', async () => {
    const o = await generate(rentSheetTool, input);
    o.engine.set('Controle', 'D11', { value: dateToSerial(2026, 3, 15) }); // parcela 3, vencimento 05/03: 10 dias de atraso
    o.engine.set('Controle', 'E11', { value: 1500 });
    expect(val(o, 'Controle', 'F11')).toBe(10);
    expect(val(o, 'Controle', 'G11')).toBe(35); // 30 + 1500 × (1%/30) × 10
    expect(val(o, 'Controle', 'I11')).toBe('Pendente');
    o.engine.set('Controle', 'E11', { value: 1535 });
    expect(val(o, 'Controle', 'I11')).toBe('Quitado');
    expect(val(o, 'Controle', 'H11')).toBe(0);
  });

  it('terceiro ano: segundo reajuste composto', async () => {
    const o = await generate(rentSheetTool, { ...input, months: 30 });
    expect(val(o, 'Controle', 'C33')).toBe(1653.75); // parcela 25: 1500 × 1,05²
    expect(val(o, 'Controle', 'C37')).toBe(1653.75);
  });

  it('totais e opções', async () => {
    const o = await generate(rentSheetTool, { ...input, months: 12 });
    expect(val(o, 'Controle', 'C21')).toBe(18000);
    expect(val(o, 'Controle', 'E21')).toBe(3000);
    const dec = await generate(rentSheetTool, { ...input, startMonth: 11, months: 5 });
    expect(val(dec, 'Controle', 'B10')).toBe(dateToSerial(2026, 12, 5));
    expect(val(dec, 'Controle', 'B11')).toBe(dateToSerial(2027, 1, 5));
    await fails(rentSheetTool, { ...input, dueDay: 29 });
    await fails(rentSheetTool, { ...input, startMonth: 13 });
    await fails(rentSheetTool, { ...input, months: 0 });
    await fails(rentSheetTool, { ...input, baseRent: 0 });
  });
});

describe('controle de dívidas', () => {
  it('parcela, saldo devedor e prioridade batem com o cálculo independente', async () => {
    const o = await generate(debtsSheetTool, { rows: 10 });
    const pmt = (pv: number, rate: number, n: number) => (rate === 0 ? pv / n : (pv * rate) / (1 - (1 + rate) ** -n));
    const balance = (p: number, rate: number, rem: number) => (rate === 0 ? p * rem : (p * (1 - (1 + rate) ** -rem)) / rate);
    const debts: [number, number, number, number][] = [[3000, 0.095, 12, 4], [8000, 0.032, 24, 6], [2400, 0, 10, 2]];
    debts.forEach(([pv, rate, n, paid], i) => {
      const r = 2 + i;
      const parcela = Math.round(pmt(pv, rate, n) * 100) / 100;
      expect(val(o, 'Dívidas', `G${r}`)).toBe(parcela);
      expect(val(o, 'Dívidas', `H${r}`)).toBe(n - paid);
      expect(val(o, 'Dívidas', `I${r}`)).toBe(Math.round(balance(parcela, rate, n - paid) * 100) / 100);
      expect(val(o, 'Dívidas', `J${r}`)).toBe(Math.round(parcela * (n - paid) * 100) / 100);
    });
    expect(val(o, 'Dívidas', 'K2')).toBe(1);
    expect(val(o, 'Dívidas', 'K3')).toBe(2);
    expect(val(o, 'Dívidas', 'K4')).toBe(3);
    expect(val(o, 'Dívidas', 'G4')).toBe(240);
    expect(val(o, 'Dívidas', 'I4')).toBe(1920);
    expect(val(o, 'Dívidas', 'C12')).toBe(13400);
  });

  it('linhas vazias ficam em branco e uma dívida quitada tem saldo zero', async () => {
    const o = await generate(debtsSheetTool, { rows: 10 });
    expect(val(o, 'Dívidas', 'G6')).toBe('');
    expect(val(o, 'Dívidas', 'K6')).toBe('');
    o.engine.set('Dívidas', 'F4', { value: 10 });
    expect(val(o, 'Dívidas', 'H4')).toBe(0);
    expect(val(o, 'Dívidas', 'I4')).toBe(0);
    o.engine.set('Dívidas', 'F4', { value: 15 }); // mais pagas que o total não gera valor negativo
    expect(val(o, 'Dívidas', 'H4')).toBe(0);
  });
});

describe('metas financeiras', () => {
  it('meses restantes e aportes com e sem rendimento', async () => {
    const o = await generate(goalsSheetTool, { rows: 10, refYear: 2026, refMonth: 1, monthlyReturnPercent: 0.6 });
    expect(val(o, 'Metas', 'E6')).toBe(12);
    expect(val(o, 'Metas', 'F6')).toBe(13500);
    expect(val(o, 'Metas', 'G6')).toBe(1125);
    const r = 0.006;
    const needed = ((18000 - 4500 * (1 + r) ** 12) * r) / ((1 + r) ** 12 - 1);
    expect(val(o, 'Metas', 'H6')).toBe(Math.round(needed * 100) / 100);
    expect(val(o, 'Metas', 'H6') as number).toBeLessThan(val(o, 'Metas', 'G6') as number);
    expect(val(o, 'Metas', 'I6')).toBeCloseTo(0.25, 10);
    expect(val(o, 'Metas', 'E7')).toBe(8);
    expect(val(o, 'Metas', 'E8')).toBe(30);
  });

  it('rendimento zero iguala os dois aportes; meta já atingida não pede aporte', async () => {
    const o = await generate(goalsSheetTool, { rows: 10, refYear: 2026, refMonth: 6, monthlyReturnPercent: 0 });
    expect(val(o, 'Metas', 'H6')).toBe(val(o, 'Metas', 'G6'));
    o.engine.set('Metas', 'C6', { value: 20000 });
    expect(val(o, 'Metas', 'F6')).toBe(0);
    expect(val(o, 'Metas', 'G6')).toBe(0);
    expect(val(o, 'Metas', 'I6')).toBe(1);
    // Prazo no mesmo mês: pelo menos 1 mês, sem divisão por zero.
    o.engine.set('Metas', 'D7', { value: dateToSerial(2026, 6, 20) });
    expect(val(o, 'Metas', 'E7')).toBe(1);
  });

  it('erros de parâmetros', async () => {
    await fails(goalsSheetTool, { refMonth: 0 });
    await fails(goalsSheetTool, { monthlyReturnPercent: 11 });
  });
});

describe('controle de investimentos', () => {
  it('valores, resultado e alocação', async () => {
    const o = await generate(investmentsSheetTool, { rows: 10, year: 2026 });
    expect(val(o, 'Ativos', 'G2')).toBe(10000);
    expect(val(o, 'Ativos', 'H2')).toBe(10420);
    expect(val(o, 'Ativos', 'I2')).toBe(420);
    expect(val(o, 'Ativos', 'J2')).toBeCloseTo(0.042, 10);
    expect(val(o, 'Ativos', 'G3')).toBe(2540);
    expect(val(o, 'Ativos', 'H3')).toBe(2810);
    expect(val(o, 'Ativos', 'I4')).toBe(-135);
    const invested = 10000 + 2540 + 4900;
    const current = 10420 + 2810 + 4765;
    expect(val(o, 'Ativos', 'G12')).toBe(invested);
    expect(val(o, 'Ativos', 'H12')).toBe(current);
    expect(val(o, 'Ativos', 'I12')).toBe(current - invested);
    expect(val(o, 'Ativos', 'J12')).toBeCloseTo((current - invested) / invested, 10);
    INVESTMENT_TYPES.forEach((t, i) => {
      const expected: Record<string, number> = { 'Renda fixa': 10420, Ações: 2810, 'Fundos imobiliários': 4765 };
      expect(val(o, 'Resumo', `C${4 + i}`), t).toBe(expected[t] ?? 0);
    });
    expect(val(o, 'Resumo', `D${4 + INVESTMENT_TYPES.length}`)).toBeCloseTo(1, 10);
    expect(val(o, 'Resumo', `C${4 + INVESTMENT_TYPES.length}`)).toBe(current);
  });

  it('novo ativo entra na alocação e linhas vazias não geram NaN', async () => {
    const o = await generate(investmentsSheetTool, { rows: 10 });
    o.engine.set('Ativos', 'B6', { value: 'Ações' });
    o.engine.set('Ativos', 'D6', { value: 10 });
    o.engine.set('Ativos', 'E6', { value: 20 });
    o.engine.set('Ativos', 'F6', { value: 30 });
    expect(val(o, 'Resumo', 'C5')).toBe(2810 + 300);
    expect(val(o, 'Ativos', 'J6')).toBe(0.5);
    expect(val(o, 'Ativos', 'G8')).toBe('');
    expect(o.wb.getWorksheet('Ativos')!.getCell('B2').dataValidation).toMatchObject({ type: 'list' });
  });
});

describe('planilha financeira pessoal', () => {
  it('resumo mensal por SUMIF, taxa de poupança e patrimônio', async () => {
    const o = await generate(personalFinanceSheetTool, { rows: 30, year: 2026 });
    expect(val(o, 'Resumo mensal', 'B4')).toBe(6000);
    expect(val(o, 'Resumo mensal', 'C4')).toBe(2520);
    expect(val(o, 'Resumo mensal', 'D4')).toBe(3480);
    expect(val(o, 'Resumo mensal', 'E4')).toBeCloseTo(3480 / 6000, 10);
    expect(val(o, 'Resumo mensal', 'B5')).toBe(5200);
    expect(val(o, 'Resumo mensal', 'C5')).toBe(1500);
    expect(val(o, 'Resumo mensal', 'B6')).toBe(0);
    expect(val(o, 'Resumo mensal', 'E6')).toBe(0);
    expect(val(o, 'Resumo mensal', 'B16')).toBe(11200);
    expect(val(o, 'Resumo mensal', 'C16')).toBe(4020);
    expect(val(o, 'Resumo mensal', 'D16')).toBe(7180);
    expect(val(o, 'Patrimônio', 'B12')).toBe(68200);
    expect(val(o, 'Patrimônio', 'E12')).toBe(23800);
    expect(val(o, 'Patrimônio', 'B14')).toBe(44400);
    expect(val(o, 'Receitas', 'E2')).toBe(1);
    expect(val(o, 'Receitas', 'E10')).toBe('');
  });

  it('lançamento novo atualiza o mês certo', async () => {
    const o = await generate(personalFinanceSheetTool, { rows: 30, year: 2026 });
    o.engine.set('Despesas', 'A10', { value: dateToSerial(2026, 6, 20) });
    o.engine.set('Despesas', 'D10', { value: 250 });
    expect(val(o, 'Despesas', 'E10')).toBe(6);
    expect(val(o, 'Resumo mensal', 'C9')).toBe(250);
    expect(val(o, 'Resumo mensal', 'D9')).toBe(-250);
  });
});

describe('exportação em CSV', () => {
  it('BOM, separador ponto e vírgula, vírgula decimal e datas brasileiras', async () => {
    const r = await data(expensesSheetTool, { format: 'csv', rows: 10, year: 2026 });
    const csv = String(r.csv);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Data;Descrição;Categoria;Forma de pagamento;Valor (R$);Obs.');
    expect(lines[1]).toBe('03/01/2026;Aluguel;Moradia;Pix;1500;exemplo');
    expect(lines[2]).toContain('482,9');
    expect(lines).toHaveLength(9); // cabeçalho + 8 exemplos (linhas vazias são omitidas)
    expect(r.xlsx).toBe('');
    expect(String(r.fileName)).toBe('planilha-de-gastos.csv');
  });

  it('valores calculados aparecem no CSV da aba principal', async () => {
    const csv = String((await data(debtsSheetTool, { format: 'csv', rows: 5 })).csv);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[3]).toBe('Loja Exemplo;Sofá;2400;0;10;2;240;8;1920;1920;3;exemplo');
    expect(lines[4]?.startsWith('Total;;13400;')).toBe(true);
  });

  it('percentuais e campos com separador ou aspas são protegidos', async () => {
    const csv = String((await data(budgetSheetTool, { format: 'csv', income: 5000 })).csv);
    expect(csv).toContain('Moradia;30%;1500;1480;20;Dentro do planejado');
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvField('linha\nquebrada')).toBe('"linha\nquebrada"');
    expect(csvField('simples')).toBe('simples');
    expect(csvText('=1+1')).toBe("'=1+1");
    expect(csvText('texto normal')).toBe('texto normal');
    expect(csvText('-5 reais')).toBe("'-5 reais");
  });
});
