import { describe, expect, it } from 'vitest';
import {
  accumulate, addMonthsClamped, ageBetween, amortizationSchedule, areaTool, ascendantLongitude, brazilianHolidays, businessDaysTool, calcInss, calcIrrf, calcNetSalary,
  compoundInterest, computeArea, computeVolume, concreteMix, dogAgeInHumanYears, downloadTimeTool, easter, electricityTool, enemTool, evaluate, formatDuration,
  idealWeights, implicitRate, installmentTool, mifflinStJeor, nameNumbers, numerologyTool, paintCans, parseAppliances, parseNumbers, parseWorkedMinutes, percentage,
  pmt, presentValue, reduceNumber, lifePathNumber, round2, roundTo, simpleCalculatorTool, scientificCalculatorTool, statistics, sunLongitude, vacationDaysForAbsences,
  workedHoursTool, loanTool, payrollLoanTool, creditCardInterestTool, tipTool, discountTool, marginTool, roiTool, inflationTool, simpleInterestTool, compoundInterestTool,
  fuelEfficiencyTool, ethanolOrGasolineTool, tripCostTool, waterUseTool, flooringTool, concreteTool, pizzaTool, barbecueTool, dateCalculatorTool, ageTool, sleepCycleTool,
  bmiTool, bmiCategory, bmrTool, caloriesTool, idealWeightTool, macrosTool, pregnancyTool, ovulationTool, menstrualCycleTool, dogAgeTool, ruleOfThreeTool, averageTool,
  volumeTool, commissionTool, inssTool, incomeTaxTool, netSalaryTool, thirteenthTool, vacationTool, fgtsTool, transportVoucherTool, overtimeTool, nightShiftTool,
  terminationTool, domesticTerminationTool, retirementTool, pjSalaryTool, pointsRequired, progressiveAgeRequired, evaluateRetirement, earliestRetirement, calcTermination,
  calcPj, noticeDaysFor, fullYears, monthsBetweenCounting15, INSS_TABLES, IR_TABLES,
} from './index.js';

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string; issues?: { path: string; message: string }[] } };
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
const d = (s: string) => {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number];
  return { year, month, day };
};

describe('arredondamento monetário', () => {
  it('meio para cima, sem erro de ponto flutuante', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(121.575)).toBe(121.58);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1);
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(round2(1e12 + 0.125)).toBe(1000000000000.13);
  });
});

describe('avaliador de expressões (sem eval)', () => {
  const simple = { angle: 'radians', scientific: false } as const;
  const sci = { angle: 'degrees', scientific: true } as const;

  it('precedência, associatividade e sinais', () => {
    expect(evaluate('2+3*4', simple)).toBe(14);
    expect(evaluate('(2+3)*4', simple)).toBe(20);
    expect(evaluate('-2^2', simple)).toBe(-4);
    expect(evaluate('2^3^2', simple)).toBe(512);
    expect(evaluate('2^-1', simple)).toBe(0.5);
    expect(evaluate('2*-3', simple)).toBe(-6);
    expect(evaluate('--4', simple)).toBe(4);
    expect(evaluate('10%3', simple)).toBe(1);
    expect(evaluate('10/4', simple)).toBe(2.5);
    expect(evaluate('1,5+1,5', simple)).toBe(3);
    expect(evaluate('2 × 3 ÷ 4', simple)).toBe(1.5);
    expect(evaluate('1e3+1', simple)).toBe(1001);
    expect(evaluate('((((1))))', simple)).toBe(1);
  });

  it('funções e constantes científicas', () => {
    expect(evaluate('sin(30)', sci)).toBeCloseTo(0.5, 12);
    expect(evaluate('cos(60)', sci)).toBeCloseTo(0.5, 12);
    expect(evaluate('tan(45)', sci)).toBeCloseTo(1, 12);
    expect(evaluate('asin(0.5)', sci)).toBeCloseTo(30, 10);
    expect(evaluate('sin(pi/2)', { angle: 'radians', scientific: true })).toBeCloseTo(1, 12);
    expect(evaluate('sqrt(16)+cbrt(27)', sci)).toBe(7);
    expect(evaluate('5!', sci)).toBe(120);
    expect(evaluate('0!', sci)).toBe(1);
    expect(evaluate('ln(e)', sci)).toBe(1);
    expect(evaluate('log(1000)', sci)).toBeCloseTo(3, 12);
    expect(evaluate('log2(8)', sci)).toBeCloseTo(3, 12);
    expect(evaluate('abs(-3)+floor(2.9)+ceil(2.1)+round(2.5)', sci)).toBe(11);
    expect(evaluate('fat(4)', sci)).toBe(24);
  });

  it('erros claros', () => {
    const bad: [string, string][] = [
      ['', 'expressão'], ['1/0', 'zero'], ['(1+2', 'parêntese'], ['1+', 'terminou'], ['1 2', 'inválida'], ['1..2', 'inválido'],
      ['abc', 'científica'], ['5!', 'científica'], ['2@3', 'não permitido'], [')', 'inválida'],
    ];
    for (const [expression, fragment] of bad) {
      expect(() => evaluate(expression, simple), expression).toThrow(fragment);
    }
    expect(() => evaluate('sqrt(-1)', sci)).toThrow('indefinido');
    expect(() => evaluate('171!', sci)).toThrow('170');
    expect(() => evaluate('2.5!', sci)).toThrow('inteiros');
    expect(() => evaluate('10^999', sci)).toThrow('grande');
    expect(() => evaluate('sin 30', sci)).toThrow('parênteses');
    expect(() => evaluate('foo(1)', sci)).toThrow('desconhecida');
    expect(() => evaluate('1+'.repeat(300) + '1', simple)).toThrow('longa');
    expect(() => evaluate('('.repeat(150) + '1' + ')'.repeat(150), simple)).toThrow('aninhados');
  });

  it('não executa código: nomes perigosos são só identificadores desconhecidos', async () => {
    for (const attack of ['constructor', 'process.exit()', 'alert(1)', 'this', '__proto__', 'globalThis', 'require("fs")', 'Function("return 1")()']) {
      const r = await run(scientificCalculatorTool, { expression: attack });
      expect(r.ok, attack).toBe(false);
    }
  });

  it('ferramentas: ruído de ponto flutuante e formatação pt-BR', async () => {
    expect(await data(simpleCalculatorTool, { expression: '0,1+0,2' })).toMatchObject({ result: 0.3, formatted: '0,3' });
    expect(await data(simpleCalculatorTool, { expression: '1000*1000' })).toMatchObject({ formatted: '1.000.000' });
    await fails(simpleCalculatorTool, { expression: '2+' });
  });
});

describe('porcentagem, regra de três e média', () => {
  it('porcentagem', () => {
    expect(percentage('percentOf', 15, 200).result).toBe(30);
    expect(percentage('whatPercent', 30, 120).result).toBe(25);
    expect(percentage('change', 80, 100).result).toBe(25);
    expect(percentage('change', 100, 80).result).toBe(-20);
    expect(percentage('change', -50, -25).result).toBe(50);
    expect(percentage('increase', 20, 100).result).toBe(120);
    expect(percentage('decrease', 20, 100).result).toBe(80);
    expect(percentage('original', 20, 120).result).toBe(100);
    expect(() => percentage('whatPercent', 1, 0)).toThrow();
    expect(() => percentage('change', 0, 5)).toThrow();
    expect(() => percentage('original', -100, 5)).toThrow();
  });

  it('regra de três direta e inversa', async () => {
    expect((await data(ruleOfThreeTool, { kind: 'direct', a: 2, b: 10, c: 5 })).x).toBe(25);
    expect((await data(ruleOfThreeTool, { kind: 'inverse', a: 4, b: 6, c: 8 })).x).toBe(3);
    await fails(ruleOfThreeTool, { kind: 'direct', a: 0, b: 1, c: 1 });
    await fails(ruleOfThreeTool, { kind: 'inverse', a: 1, b: 1, c: 0 });
  });

  it('estatística conhecida', () => {
    const s = statistics([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s).toMatchObject({ count: 8, sum: 40, arithmeticMean: 5, median: 4.5, mode: '4', min: 2, max: 9, range: 7, populationStdDev: 2 });
    expect(s.sampleStdDev).toBeCloseTo(2.13809, 4);
    expect(statistics([1, 2, 3]).mode).toBe('não há moda');
    expect(statistics([1, 1, 2, 2]).mode).toBe('1, 2');
    expect(statistics([1, 4, 4]).geometricMean).toBeCloseTo(2.5198, 4);
    expect(statistics([1, 2, 4]).harmonicMean).toBeCloseTo(1.7143, 4);
    expect(statistics([-1, 2]).geometricMean).toBeUndefined();
    expect(statistics([5]).sampleStdDev).toBeUndefined();
    expect(statistics([6, 8, 10], [1, 2, 3]).weightedMean).toBeCloseTo(8.6667, 4);
  });

  it('média: separadores, vírgula decimal e erros', async () => {
    expect(parseNumbers('7,5; 8\n6,5 9')).toEqual([7.5, 8, 6.5, 9]);
    expect(await data(averageTool, { values: '7,5 8 6,5 9' })).toMatchObject({ arithmeticMean: 7.75 });
    await fails(averageTool, { values: '' }, 'ao menos um');
    await fails(averageTool, { values: '1 abc' }, 'inválido');
    await fails(averageTool, { values: '1 2', weights: '1' }, 'quantidades');
    await fails(averageTool, { values: '1 2', weights: '0 0' }, 'zero');
    await fails(averageTool, { values: '1 2', weights: '1 -1' }, 'negativos');
    await fails(averageTool, { values: Array(10_001).fill('1').join(' ') });
  });
});

describe('desconto, gorjeta, margem e ROI', () => {
  it('desconto', async () => {
    expect(await data(discountTool, { price: 200, kind: 'percent', discount: 15 })).toEqual({ finalPrice: 170, saved: 30, percent: 15 });
    expect(await data(discountTool, { price: 120, kind: 'value', discount: 30 })).toMatchObject({ finalPrice: 90, percent: 25 });
    await fails(discountTool, { price: 100, kind: 'value', discount: 150 }, 'maior');
    await fails(discountTool, { price: -1 });
  });

  it('gorjeta e divisão', async () => {
    expect(await data(tipTool, { bill: 240, tipPercent: 10, people: 4 })).toEqual({ tip: 24, total: 264, perPerson: 66 });
    expect(await data(tipTool, { bill: 100, tipPercent: 0, people: 3 })).toMatchObject({ perPerson: 33.33 });
    await fails(tipTool, { bill: 100, people: 0 });
  });

  it('margem e markup', async () => {
    expect(await data(marginTool, { mode: 'fromPrice', cost: 60, price: 100, percent: 0 })).toMatchObject({ profit: 40, marginPercent: 40, markupPercent: 66.67 });
    expect(await data(marginTool, { mode: 'priceFromMargin', cost: 75, price: 0, percent: 25 })).toMatchObject({ price: 100, marginPercent: 25 });
    expect(await data(marginTool, { mode: 'priceFromMarkup', cost: 80, price: 0, percent: 50 })).toMatchObject({ price: 120 });
    await fails(marginTool, { mode: 'priceFromMargin', cost: 10, price: 0, percent: 100 }, '100%');
  });

  it('ROI e taxas equivalentes', async () => {
    expect(await data(roiTool, { invested: 10000, finalValue: 12500, months: 12 })).toMatchObject({ gain: 2500, roiPercent: 25, yearlyPercent: 25 });
    expect(await data(roiTool, { invested: 1000, finalValue: 500 })).toMatchObject({ roiPercent: -50, gain: -500 });
    const r = await data(roiTool, { invested: 1000, finalValue: 1210, months: 24 });
    expect(r.monthlyPercent).toBeCloseTo(((1.21 ** (1 / 24)) - 1) * 100, 3);
  });

  it('comissão com DSR', async () => {
    expect(await data(commissionTool, { sales: 20000, ratePercent: 3, fixedSalary: 1500, workingDays: 25, restDays: 5 })).toEqual({ commission: 600, dsr: 120, total: 2220 });
    expect(await data(commissionTool, { sales: 1000, ratePercent: 10 })).toEqual({ commission: 100, total: 100 });
    await fails(commissionTool, { sales: 1, ratePercent: 1, workingDays: 0, restDays: 4 });
  });
});

describe('geometria', () => {
  it('áreas de figuras conhecidas', () => {
    expect(computeArea('circle', { a: 2 }).area).toBeCloseTo(12.5663706144, 9);
    expect(computeArea('triangleSides', { a: 3, b: 4, c: 5 })).toEqual({ area: 6, perimeter: 12 });
    expect(computeArea('trapezoid', { a: 6, b: 4, c: 3 }).area).toBe(15);
    expect(computeArea('rhombus', { a: 6, b: 4 }).area).toBe(12);
    expect(computeArea('parallelogram', { a: 5, b: 2 }).area).toBe(10);
    expect(computeArea('square', { a: 3 })).toEqual({ area: 9, perimeter: 12 });
    expect(computeArea('sector', { a: 1, b: 360 }).area).toBeCloseTo(Math.PI, 9);
    expect(computeArea('ellipse', { a: 3, b: 3 }).perimeter).toBeCloseTo(2 * Math.PI * 3, 8); // elipse = círculo
    expect(computeArea('ellipse', { a: 5, b: 3 }).perimeter).toBeCloseTo(25.5270, 3);
  });

  it('erros: faltam medidas, triângulo impossível, ângulo', async () => {
    expect(() => computeArea('triangleSides', { a: 1, b: 2, c: 10 })).toThrow('não formam');
    expect(() => computeArea('rectangle', { a: 1 })).toThrow('B');
    expect(() => computeArea('sector', { a: 1, b: 400 })).toThrow('360');
    await fails(areaTool, { shape: 'rectangle', a: -1, b: 2 });
    await fails(areaTool, { shape: 'rectangle', a: 0, b: 2 });
  });

  it('volumes e litros', async () => {
    expect(computeVolume('sphere', 'm', { a: 1 }).volume).toBeCloseTo(4.18879020479, 9);
    expect(computeVolume('cylinder', 'dm', { a: 1, b: 1 }).liters).toBeCloseTo(Math.PI, 9);
    expect(computeVolume('cone', 'm', { a: 3, b: 4 }).volume).toBeCloseTo(12 * Math.PI, 9);
    expect(computeVolume('pyramid', 'm', { a: 3, b: 3, c: 3 }).volume).toBe(9);
    expect(computeVolume('triangularPrism', 'cm', { a: 4, b: 3, c: 10 }).volume).toBe(60);
    expect(computeVolume('cube', 'cm', { a: 10 })).toEqual({ volume: 1000, liters: 1 });
    expect(computeVolume('cube', 'mm', { a: 100 }).liters).toBe(1);
    expect(computeVolume('box', 'm', { a: 2, b: 1.5, c: 1 })).toEqual({ volume: 3, liters: 3000 });
    expect(() => computeVolume('box', 'm', { a: 1, b: 1 })).toThrow('C');
    await fails(volumeTool, { shape: 'cube', unit: 'parsec', a: 1 });
  });
});

describe('matemática financeira', () => {
  it('juros simples com conversão de unidades', async () => {
    expect(await data(simpleInterestTool, { capital: 1000, rate: 2, ratePeriod: 'month', time: 12, timePeriod: 'month' })).toEqual({ interest: 240, amount: 1240 });
    expect(await data(simpleInterestTool, { capital: 1000, rate: 2, ratePeriod: 'month', time: 1, timePeriod: 'year' })).toEqual({ interest: 240, amount: 1240 });
    expect(await data(simpleInterestTool, { capital: 1000, rate: 24, ratePeriod: 'year', time: 360, timePeriod: 'day' })).toEqual({ interest: 240, amount: 1240 });
    expect(await data(simpleInterestTool, { capital: 0, rate: 5, ratePeriod: 'month', time: 5, timePeriod: 'month' })).toEqual({ interest: 0, amount: 0 });
  });

  it('juros compostos, aportes e taxas equivalentes', async () => {
    expect(compoundInterest(1000, 1, 12, 0).amount).toBeCloseTo(1126.825, 3);
    expect(compoundInterest(0, 1, 12, 500)).toMatchObject({ invested: 6000 });
    expect(compoundInterest(0, 1, 12, 500).amount).toBeCloseTo(6341.2515, 3);
    expect(compoundInterest(0, 0, 10, 100).amount).toBe(1000); // taxa zero
    expect(compoundInterest(1000, 2, 0, 0).amount).toBe(1000);
    const r = await data(compoundInterestTool, { capital: 1000, contribution: 0, rate: 1, ratePeriod: 'month', time: 1, timePeriod: 'year' });
    expect(r).toMatchObject({ amount: 1126.83, equivalentMonthlyRate: 1, equivalentYearlyRate: 12.6825 });
    const y = await data(compoundInterestTool, { capital: 1000, contribution: 0, rate: 12.6825, ratePeriod: 'year', time: 12, timePeriod: 'month' });
    expect(y.equivalentMonthlyRate).toBeCloseTo(1, 3);
    await fails(compoundInterestTool, { capital: 1, rate: 1, ratePeriod: 'month', time: 2000, timePeriod: 'month' });
  });

  it('Price e SAC: o cronograma fecha', () => {
    for (const system of ['price', 'sac'] as const) {
      const rows = amortizationSchedule(10000, 1.5, 24, system);
      expect(rows).toHaveLength(24);
      expect(rows.reduce((a, r) => a + r.amortization, 0)).toBeCloseTo(10000, 6);
      expect(rows[23]?.balance).toBe(0);
      for (const r of rows) expect(r.payment).toBeCloseTo(r.interest + r.amortization, 8);
    }
    const price = amortizationSchedule(10000, 1.5, 24, 'price');
    expect(price.every((r) => Math.abs(r.payment - (price[0] as { payment: number }).payment) < 1e-9)).toBe(true);
    const sac = amortizationSchedule(10000, 1.5, 24, 'sac');
    for (let i = 1; i < sac.length; i++) expect((sac[i] as { payment: number }).payment).toBeLessThan((sac[i - 1] as { payment: number }).payment);
    expect(sac.reduce((a, r) => a + r.payment, 0)).toBeLessThan(price.reduce((a, r) => a + r.payment, 0)); // SAC custa menos juros
    expect(pmt(10000, 1, 12)).toBeCloseTo(888.4879, 3);
    expect(pmt(1200, 0, 12)).toBe(100);
  });

  it('financiamento: cronograma resumido e limites', async () => {
    const short = await data(loanTool, { amount: 10000, monthlyRate: 1, months: 12, system: 'price' });
    expect((short.schedule as string[]).length).toBe(12);
    const long = await data(loanTool, { amount: 300000, monthlyRate: 0.8, months: 360, system: 'sac' });
    expect(long.schedule as string[]).toHaveLength(16);
    expect((long.schedule as string[])[12]).toBe('…');
    await fails(loanTool, { amount: 1000, monthlyRate: 1, months: 481, system: 'price' });
    await fails(loanTool, { amount: 0, monthlyRate: 1, months: 12, system: 'price' });
  });

  it('parcelamento: taxa implícita faz ida e volta', async () => {
    for (const [rate, n] of [[0.5, 6], [3, 10], [8, 24]] as const) {
      const p = pmt(1000, rate, n);
      expect(implicitRate(1000, p, n)).toBeCloseTo(rate, 6);
    }
    expect(implicitRate(1000, 100, 10)).toBe(0);
    expect(implicitRate(1000, 90, 10)).toBeNull();
    expect((await data(installmentTool, { mode: 'installment', cashPrice: 1200, entry: 0, months: 12, monthlyRate: 2 })).installment).toBe(113.47);
    expect(await data(installmentTool, { mode: 'installment', cashPrice: 1200, entry: 200, months: 10, monthlyRate: 0 })).toMatchObject({ installment: 100, totalInterest: 0 });
    expect(await data(installmentTool, { mode: 'implicitRate', cashPrice: 1000, entry: 0, months: 10, monthlyRate: 0, installmentValue: 120 })).toMatchObject({ totalPaid: 1200, totalInterest: 200 });
    await fails(installmentTool, { mode: 'installment', cashPrice: 1000, entry: 1000, months: 3, monthlyRate: 0 }, 'entrada');
    await fails(installmentTool, { mode: 'implicitRate', cashPrice: 1000, entry: 0, months: 10, monthlyRate: 0 }, 'parcela');
    await fails(installmentTool, { mode: 'implicitRate', cashPrice: 1000, entry: 0, months: 10, monthlyRate: 0, installmentValue: 50 }, 'somam menos');
  });

  it('cartão: rotativo cresce, e pagamento abaixo dos juros é recusado', async () => {
    expect(await data(creditCardInterestTool, { balance: 1000, monthlyRate: 10, months: 12 })).toMatchObject({ finalBalance: 3138.43 });
    await fails(creditCardInterestTool, { balance: 1000, monthlyRate: 10, months: 12, monthlyPayment: 100 }, 'juros do primeiro mês');
    const paid = await data(creditCardInterestTool, { balance: 1000, monthlyRate: 10, months: 1, monthlyPayment: 200 });
    expect(paid.monthsToPayOff).toBe(8);
    expect((paid.totalPaid as number)).toBeGreaterThan(1000);
  });

  it('consignado: margem e empréstimo máximo coerentes', async () => {
    expect(presentValue(pmt(5000, 2, 24), 2, 24)).toBeCloseTo(5000, 6);
    const r = await data(payrollLoanTool, { amount: 10000, monthlyRate: 1.8, months: 48, income: 3000, marginPercent: 35 });
    expect(r).toMatchObject({ maxInstallment: 1050, fitsMargin: true });
    expect(pmt(r.maxLoan as number, 1.8, 48)).toBeCloseTo(1050, 1);
    const tight = await data(payrollLoanTool, { amount: 50000, monthlyRate: 1.8, months: 12, income: 2000, marginPercent: 35 });
    expect(tight.fitsMargin).toBe(false);
    expect((await data(payrollLoanTool, { amount: 1000, monthlyRate: 2, months: 12 })).maxInstallment).toBeUndefined();
  });

  it('inflação acumulada', async () => {
    expect(accumulate([1, 1, 1])).toBeCloseTo(3.0301, 4);
    expect(accumulate([10, -10])).toBeCloseTo(-1, 6);
    expect(await data(inflationTool, { amount: 1000, rates: '10 -10' })).toMatchObject({ accumulatedPercent: -1, correctedValue: 990 });
    expect(await data(inflationTool, { amount: 1000, rates: '0,5; 0,4; 0,6' })).toMatchObject({ months: 3 });
    await fails(inflationTool, { amount: 1, rates: '' }, 'taxas');
    await fails(inflationTool, { amount: 1, rates: '-100' }, '-100');
  });
});

describe('cotidiano', () => {
  it('combustível', async () => {
    expect(await data(fuelEfficiencyTool, { distance: 400, liters: 40, pricePerLiter: 6 })).toEqual({ kmPerLiter: 10, litersPer100km: 10, costPerKm: 0.6, totalCost: 240 });
    expect(await data(ethanolOrGasolineTool, { gasolinePrice: 6, ethanolPrice: 4.2, threshold: 70 })).toMatchObject({ ratioPercent: 70 });
    expect(String((await data(ethanolOrGasolineTool, { gasolinePrice: 6, ethanolPrice: 4.3, threshold: 70 })).recommendation)).toContain('Gasolina');
    expect(String((await data(ethanolOrGasolineTool, { gasolinePrice: 6, ethanolPrice: 4, threshold: 70 })).recommendation)).toContain('Etanol');
    const byKm = await data(ethanolOrGasolineTool, { gasolinePrice: 6, ethanolPrice: 4, threshold: 70, gasolineKmPerLiter: 12, ethanolKmPerLiter: 7 });
    expect(byKm).toMatchObject({ gasolineCostPerKm: 0.5, ethanolCostPerKm: 0.571 });
    expect(String(byKm.recommendation)).toContain('Gasolina');
  });

  it('viagem: ida e volta dobra distância mas não os pedágios informados', async () => {
    const one = await data(tripCostTool, { distance: 500, kmPerLiter: 10, fuelPrice: 6, tolls: 40, otherCosts: 10, people: 2, roundTrip: false });
    expect(one).toMatchObject({ liters: 50, fuelCost: 300, totalCost: 350, perPerson: 175 });
    const two = await data(tripCostTool, { distance: 500, kmPerLiter: 10, fuelPrice: 6, tolls: 40, otherCosts: 10, people: 2, roundTrip: true, averageSpeed: 100 });
    expect(two).toMatchObject({ liters: 100, fuelCost: 600, totalCost: 650, travelTime: '10 h 00 min' });
  });

  it('água: soma dos hábitos', async () => {
    const r = await data(waterUseTool, { people: 2, showerMinutes: 10, showerLitersPerMinute: 10, flushes: 5, litersPerFlush: 6, washLoadsPerWeek: 7, litersPerWash: 100, otherLitersPerPersonDay: 40 });
    expect(r).toMatchObject({ litersPerDay: 440, litersPerPersonDay: 220, cubicMetersPerMonth: 13.2 });
    expect((await data(waterUseTool, { people: 1, tariffPerCubicMeter: 10 })).monthlyCost).toBeGreaterThan(0);
  });

  it('energia: leitura das linhas e custo', async () => {
    expect(parseAppliances('TV; 100; 5; 30\nLuz; 10,5; 2')).toEqual([
      { name: 'TV', watts: 100, hoursPerDay: 5, daysPerMonth: 30 },
      { name: 'Luz', watts: 10.5, hoursPerDay: 2, daysPerMonth: 30 },
    ]);
    const r = await data(electricityTool, { appliances: 'A; 1000; 1; 30\nB; 100; 10; 30', tariff: 1 });
    expect(r).toMatchObject({ totalKwh: 60, monthlyCost: 60 });
    expect((r.breakdown as string[])[0]).toContain('A:'); // 30 kWh vs 30 kWh: ordem estável
    await fails(electricityTool, { appliances: 'só nome' }, 'Linha 1');
    await fails(electricityTool, { appliances: 'A; abc; 1; 1' }, 'potência');
    await fails(electricityTool, { appliances: 'A; 100; 25; 1' }, '24');
    await fails(electricityTool, { appliances: 'A; 100; 1; 32' }, '31');
    await fails(electricityTool, { appliances: '' }, 'ao menos um');
  });

  it('download: unidades e duração', async () => {
    expect(await data(downloadTimeTool, { size: 1, unit: 'GB', speedMbps: 100, efficiency: 100 })).toMatchObject({ seconds: 80, effectiveMBps: 12.5, time: '01 min 20 s' });
    expect((await data(downloadTimeTool, { size: 1, unit: 'TB', speedMbps: 1000, efficiency: 100 })).seconds).toBe(8000);
    expect(formatDuration(3725)).toBe('1 h 02 min 05 s');
    expect(formatDuration(59)).toBe('59 s');
    expect(formatDuration(3600)).toBe('1 h 00 min 00 s');
  });

  it('tinta: embalagens cobrem a necessidade com sobra menor que 0,9 L', () => {
    for (let needed = 0.1; needed < 80; needed += 1.37) {
      const { totalLiters } = paintCans(needed);
      expect(totalLiters).toBeGreaterThanOrEqual(needed - 1e-9);
      expect(totalLiters - needed).toBeLessThan(0.9 + 1e-9);
    }
    expect(paintCans(18).counts).toEqual({ '18 L': 1, '3,6 L': 0, '0,9 L': 0 });
  });

  it('piso, concreto, pizza e churrasco', async () => {
    expect(await data(flooringTool, { roomLength: 5, roomWidth: 4, tileLengthCm: 60, tileWidthCm: 60, lossPercent: 10, boxCoverage: 2.5 })).toMatchObject({ roomArea: 20, pieces: 62, boxes: 9 });
    const m = concreteMix(1, 2, 3, 0.5);
    // Volumes absolutos somam 1 m³ (1000 L).
    expect(m.cementKg / 3.15 + m.sandKg / 2.65 + m.gravelKg / 2.7 + m.waterLiters).toBeCloseTo(1000, 6);
    expect(m.cementKg).toBeCloseTo(372.67, 1);
    const c = await data(concreteTool, { length: 4, width: 3, thickness: 0.1, sand: 2, gravel: 3, waterCement: 0.5, marginPercent: 0 });
    expect(c).toMatchObject({ volumeM3: 1.2 });
    expect(c.cementBags50kg).toBe(9);
    expect(await data(pizzaTool, { people: 6, slicesPerPerson: 3, slicesPerPizza: 8 })).toMatchObject({ pizzas: 3, slices: 18 });
    const cmp = await data(pizzaTool, { people: 1, slicesPerPerson: 1, slicesPerPizza: 8, diameterA: 30, priceA: 40, diameterB: 35, priceB: 52 });
    expect(String(cmp.bestValue)).toContain('Pizza B');
    expect(await data(barbecueTool, { adults: 10, children: 4, appetite: 'normal' })).toMatchObject({ meatKg: 4.8, sausageKg: 1.4, charcoalKg: 4.8 });
    await fails(barbecueTool, { adults: 0, children: 0 }, 'convidado');
  });

  it('horas trabalhadas: turnos, meia-noite e saldo', async () => {
    expect(parseWorkedMinutes('08:00-12:00 13:00-17:30')).toMatchObject({ totalMinutes: 510, days: 1 });
    expect(parseWorkedMinutes('22:00-06:00').totalMinutes).toBe(480);
    expect(parseWorkedMinutes('08:00 às 12:00, 13:00 as 17:00').totalMinutes).toBe(480);
    const r = await data(workedHoursTool, { entries: '08:00-12:00 13:00-17:30\n09:00-12:00 13:00-18:00', expectedPerDay: '08:00' });
    expect(r).toMatchObject({ total: '16:30', decimalHours: 16.5, balance: '+0:30', days: 2, averagePerDay: '8:15' });
    expect((await data(workedHoursTool, { entries: '08:00-12:00', expectedPerDay: '08:00' })).balance).toBe('-4:00');
    await fails(workedHoursTool, { entries: '08:00-25:00' }, 'inválido');
    await fails(workedHoursTool, { entries: 'trabalhei o dia todo' }, 'Linha 1');
    await fails(workedHoursTool, { entries: '' }, 'ao menos um');
  });
});

describe('datas e calendário', () => {
  it('soma de meses respeita o fim do mês', () => {
    expect(addMonthsClamped(d('2024-01-31'), 1)).toEqual(d('2024-02-29'));
    expect(addMonthsClamped(d('2023-01-31'), 1)).toEqual(d('2023-02-28'));
    expect(addMonthsClamped(d('2024-03-31'), -1)).toEqual(d('2024-02-29'));
    expect(addMonthsClamped(d('2024-11-15'), 3)).toEqual(d('2025-02-15'));
    expect(addMonthsClamped(d('2024-02-29'), 12)).toEqual(d('2025-02-28'));
    expect(addMonthsClamped(d('2024-01-15'), -13)).toEqual(d('2022-12-15'));
  });

  it('calculadora de datas', async () => {
    expect(await data(dateCalculatorTool, { date: '2024-01-01', operation: 'add', days: 30 })).toMatchObject({ result: '2024-01-31', resultBr: '31/01/2024', weekday: 'quarta-feira', daysFromStart: 30 });
    expect(await data(dateCalculatorTool, { date: '2024-03-01', operation: 'subtract', days: 1 })).toMatchObject({ result: '2024-02-29' });
    expect(await data(dateCalculatorTool, { date: '2024-01-31', operation: 'add', months: 1, days: 0 })).toMatchObject({ result: '2024-02-29' });
    expect(await data(dateCalculatorTool, { date: '2024-12-25', operation: 'add', years: 1, weeks: 1, days: 0 })).toMatchObject({ result: '2026-01-01' });
    await fails(dateCalculatorTool, { date: '2023-02-30' }, 'inválida');
    await fails(dateCalculatorTool, { date: '0100-01-01', operation: 'subtract', years: 200, days: 0 }, 'fora do intervalo');
  });

  it('Páscoa de anos conhecidos', () => {
    expect(easter(2024)).toEqual(d('2024-03-31'));
    expect(easter(2025)).toEqual(d('2025-04-20'));
    expect(easter(2026)).toEqual(d('2026-04-05'));
    expect(easter(2000)).toEqual(d('2000-04-23'));
    expect(easter(2038)).toEqual(d('2038-04-25'));
    expect(easter(2019)).toEqual(d('2019-04-21'));
  });

  it('feriados nacionais móveis e a regra do 20/11', () => {
    const h = (y: number) => Object.fromEntries(brazilianHolidays(y).map((x) => [x.name, `${x.date.year}-${String(x.date.month).padStart(2, '0')}-${String(x.date.day).padStart(2, '0')}`]));
    expect(h(2025)['Sexta-feira Santa']).toBe('2025-04-18');
    expect(h(2025)['Carnaval (segunda-feira)']).toBe('2025-03-03');
    expect(h(2025)['Carnaval (terça-feira)']).toBe('2025-03-04');
    expect(h(2025)['Corpus Christi']).toBe('2025-06-19');
    expect(h(2024)['Sexta-feira Santa']).toBe('2024-03-29');
    expect(h(2024)['Consciência Negra']).toBe('2024-11-20');
    expect(h(2023)['Consciência Negra']).toBeUndefined();
    expect(brazilianHolidays(2025).filter((x) => !x.optional)).toHaveLength(10);
  });

  it('dias úteis', async () => {
    expect(await data(businessDaysTool, { start: '2025-06-02', end: '2025-06-06' })).toMatchObject({ businessDays: 5, weekendDays: 0 });
    expect(await data(businessDaysTool, { start: '2025-04-21', end: '2025-04-25' })).toMatchObject({ businessDays: 4, holidaysOnBusinessDays: ['21/04/2025 — Tiradentes'] });
    expect((await data(businessDaysTool, { start: '2025-04-14', end: '2025-04-18' })).businessDays).toBe(4); // Sexta-feira Santa
    expect((await data(businessDaysTool, { start: '2025-06-16', end: '2025-06-20' })).businessDays).toBe(5); // Corpus Christi é facultativo
    expect((await data(businessDaysTool, { start: '2025-06-16', end: '2025-06-20', optionalHolidays: true })).businessDays).toBe(4);
    expect((await data(businessDaysTool, { start: '2025-06-02', end: '2025-06-08', saturdayIsBusinessDay: true })).businessDays).toBe(6);
    expect((await data(businessDaysTool, { start: '2025-06-02', end: '2025-06-06', extraHolidays: '03/06/2025, 2025-06-04' })).businessDays).toBe(3);
    expect(await data(businessDaysTool, { start: '2025-06-07', end: '2025-06-08' })).toMatchObject({ businessDays: 0, weekendDays: 2 });
    expect((await data(businessDaysTool, { start: '2025-06-02', end: '2025-06-02' })).businessDays).toBe(1);
    await fails(businessDaysTool, { start: '2025-06-10', end: '2025-06-01' }, 'posterior');
    await fails(businessDaysTool, { start: '2025-06-01', end: '2025-06-02', extraHolidays: 'natal' }, 'inválida');
    await fails(businessDaysTool, { start: '1900-01-01', end: '2025-01-01' }, '100 anos');
  });

  it('idade: dia bissexto e aniversário', async () => {
    expect(ageBetween(d('2000-02-29'), d('2024-02-28'))).toMatchObject({ years: 23, months: 11, days: 30 });
    expect(ageBetween(d('2000-02-29'), d('2024-02-29'))).toMatchObject({ years: 24, months: 0, days: 0 });
    expect(ageBetween(d('1990-03-10'), d('2024-06-15'))).toMatchObject({ years: 34, months: 3, days: 5 });
    expect(ageBetween(d('2024-06-15'), d('2024-06-15'))).toMatchObject({ years: 0, months: 0, days: 0, totalDays: 0 });
    expect(await data(ageTool, { birthDate: '1990-03-10', referenceDate: '2024-06-15' })).toMatchObject({ nextBirthday: '10/03/2025', daysToNextBirthday: 268, birthWeekday: 'sábado' });
    expect(await data(ageTool, { birthDate: '1990-03-10', referenceDate: '2024-03-10' })).toMatchObject({ years: 34, daysToNextBirthday: 0 });
    expect(await data(ageTool, { birthDate: '2000-02-29', referenceDate: '2023-03-01' })).toMatchObject({ nextBirthday: '29/02/2024' });
    expect(await data(ageTool, { birthDate: '2000-02-29', referenceDate: '2025-03-01' })).toMatchObject({ nextBirthday: '28/02/2026' });
    await fails(ageTool, { birthDate: '2030-01-01', referenceDate: '2024-01-01' }, 'anterior');
    expect((await run(ageTool, { birthDate: '1990-03-10' })).ok).toBe(true); // usa hoje
  });

  it('ciclos de sono', async () => {
    const r = await data(sleepCycleTool, { mode: 'wake', time: '07:00', fallAsleepMinutes: 15 });
    expect(r.suggestions).toEqual(['Dormir às 21:45 — 6 ciclos (9 h de sono)', 'Dormir às 23:15 — 5 ciclos (7.5 h de sono)', 'Dormir às 00:45 — 4 ciclos (6 h de sono)', 'Dormir às 02:15 — 3 ciclos (4.5 h de sono)']);
    const s = await data(sleepCycleTool, { mode: 'sleep', time: '23:00', fallAsleepMinutes: 0 });
    expect((s.suggestions as string[])[0]).toBe('Acordar às 08:00 — 6 ciclos (9 h de sono)');
    await fails(sleepCycleTool, { time: '25:00' });
    await fails(sleepCycleTool, { time: '7h' });
  });
});

describe('saúde', () => {
  it('IMC e classificação nos limites', async () => {
    expect(await data(bmiTool, { weightKg: 70, heightCm: 170 })).toMatchObject({ bmi: 24.2, category: 'Peso normal' });
    expect(bmiCategory(18.49)).toBe('Magreza leve');
    expect(bmiCategory(18.5)).toBe('Peso normal');
    expect(bmiCategory(24.99)).toBe('Peso normal');
    expect(bmiCategory(25)).toBe('Sobrepeso');
    expect(bmiCategory(30)).toBe('Obesidade grau I');
    expect(bmiCategory(35)).toBe('Obesidade grau II');
    expect(bmiCategory(40)).toBe('Obesidade grau III');
    expect(bmiCategory(15)).toBe('Magreza grave');
    expect((await data(bmiTool, { weightKg: 70, heightCm: 170 })).healthyRange).toBe('53.5 kg a 72 kg');
    await fails(bmiTool, { weightKg: 70, heightCm: 20 });
    await fails(bmiTool, { weightKg: 0, heightCm: 170 });
  });

  it('TMB, Harris-Benedict e gasto diário', async () => {
    expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780);
    expect(mifflinStJeor('female', 70, 170, 30)).toBe(1451.5);
    const r = await data(bmrTool, { sex: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'moderate' });
    expect(r).toMatchObject({ bmrMifflin: 1780, dailyNeed: 2759 });
    expect(r.bmrHarrisBenedict).toBeCloseTo(1854.3, 0);
  });

  it('calorias: metas, piso de segurança e exercício', async () => {
    const lose = await data(caloriesTool, { mode: 'daily', sex: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'sedentary', goal: 'lose' });
    expect(lose).toMatchObject({ maintenance: 2136, target: 1636 });
    const floor = await data(caloriesTool, { mode: 'daily', sex: 'female', weightKg: 45, heightCm: 155, age: 50, activity: 'sedentary', goal: 'lose' });
    expect(floor.target).toBe(1200);
    expect(String(floor.warning)).toContain('1200');
    expect((await data(caloriesTool, { mode: 'daily', sex: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'sedentary', goal: 'gain' })).target).toBe(2436);
    expect(await data(caloriesTool, { mode: 'activity', sex: 'male', weightKg: 80, heightCm: 180, age: 30, exercise: 'running10', minutes: 60 })).toMatchObject({ burned: 784 });
  });

  it('peso ideal e IMC', async () => {
    const m = idealWeights('male', 180);
    expect(m.devine).toBeCloseTo(50 + 2.3 * (180 / 2.54 - 60), 8);
    expect(idealWeights('female', 152.4).devine).toBeCloseTo(45.5, 8);
    expect(idealWeights('female', 152.4).hamwi).toBeCloseTo(45.5, 8);
    const r = await data(idealWeightTool, { sex: 'female', heightCm: 165 });
    expect(r.devine).toBeCloseTo(56.9, 1);
    expect(String(r.note)).not.toContain('1,52 m');
    expect(String((await data(idealWeightTool, { sex: 'female', heightCm: 140 })).note)).toContain('1,52 m');
  });

  it('macronutrientes fecham as calorias', async () => {
    const r = await data(macrosTool, { calories: 2000, preset: 'balanced' });
    expect(r).toMatchObject({ carbsGrams: 250, proteinGrams: 100, fatGrams: 67 });
    for (const preset of ['balanced', 'lowCarb', 'highProtein', 'endurance']) {
      const x = await data(macrosTool, { calories: 2500, preset });
      expect((x.carbsGrams as number) * 4 + (x.proteinGrams as number) * 4 + (x.fatGrams as number) * 9).toBeCloseTo(2500, -1);
    }
    expect(await data(macrosTool, { calories: 2000, preset: 'custom', carbsPercent: 40, proteinPercent: 40, fatPercent: 20 })).toMatchObject({ carbsGrams: 200, proteinGrams: 200, fatGrams: 44 });
    await fails(macrosTool, { calories: 2000, preset: 'custom', carbsPercent: 50, proteinPercent: 50, fatPercent: 20 }, '120');
  });

  it('gravidez: DPP, idade gestacional e trimestres', async () => {
    expect(await data(pregnancyTool, { lastPeriod: '2024-01-01', cycleLength: 28, referenceDate: '2024-03-11' })).toMatchObject({ dueDate: '07/10/2024', gestationalAge: '10 semanas e 0 dias', daysUntilDue: 210, trimester: '1º trimestre (até a 13ª semana e 6 dias)' });
    expect((await data(pregnancyTool, { lastPeriod: '2024-01-01', cycleLength: 32, referenceDate: '2024-03-11' })).dueDate).toBe('11/10/2024');
    const week = async (days: number) => String((await data(pregnancyTool, { lastPeriod: '2024-01-01', referenceDate: new Date(Date.UTC(2024, 0, 1 + days)).toISOString().slice(0, 10) })).trimester);
    expect(await week(13 * 7 + 6)).toContain('1º');
    expect(await week(14 * 7)).toContain('2º');
    expect(await week(27 * 7 + 6)).toContain('2º');
    expect(await week(28 * 7)).toContain('3º');
    await fails(pregnancyTool, { lastPeriod: '2024-01-01', referenceDate: '2023-12-01' }, 'anterior');
    await fails(pregnancyTool, { lastPeriod: '2024-01-01', referenceDate: '2025-01-01' }, '44 semanas');
    await fails(pregnancyTool, { lastPeriod: '2024-01-01', cycleLength: 10 });
  });

  it('ovulação e ciclo menstrual', async () => {
    expect(await data(ovulationTool, { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, referenceDate: '2024-01-02' })).toMatchObject({ nextOvulation: '15/01/2024', fertileWindow: '10/01/2024 a 16/01/2024', nextPeriod: '29/01/2024' });
    expect((await data(ovulationTool, { lastPeriod: '2024-01-01', cycleLength: 35, lutealPhase: 14, referenceDate: '2024-01-02' })).nextOvulation).toBe('22/01/2024');
    // Depois da janela fértil, passa para o ciclo seguinte.
    expect((await data(ovulationTool, { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, referenceDate: '2024-01-20' })).nextOvulation).toBe('12/02/2024');
    const c = await data(menstrualCycleTool, { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, periodLength: 5, cycles: 3, referenceDate: '2024-01-10' });
    expect(c.nextPeriod).toBe('29/01/2024');
    expect((c.upcomingPeriods as string[])[0]).toBe('29/01/2024 a 02/02/2024');
    expect((c.upcomingPeriods as string[])).toHaveLength(3);
    expect((c.phases as string[])[0]).toContain('01/01/2024 a 05/01/2024');
    expect((c.phases as string[])[2]).toContain('15/01/2024');
    // Referência já no ciclo seguinte.
    expect((await data(menstrualCycleTool, { lastPeriod: '2024-01-01', cycleLength: 28, lutealPhase: 14, periodLength: 5, cycles: 1, referenceDate: '2024-02-10' })).nextPeriod).toBe('26/02/2024');
  });

  it('idade do cachorro', async () => {
    expect(dogAgeInHumanYears(1, 'epigenetic', 'small')).toBe(31);
    expect(dogAgeInHumanYears(5, 'epigenetic', 'medium')).toBeCloseTo(56.75, 2);
    expect(dogAgeInHumanYears(1, 'size', 'small')).toBe(15);
    expect(dogAgeInHumanYears(2, 'size', 'large')).toBe(24);
    expect(dogAgeInHumanYears(5, 'size', 'small')).toBe(36);
    expect(dogAgeInHumanYears(5, 'size', 'medium')).toBe(39);
    expect(dogAgeInHumanYears(5, 'size', 'large')).toBe(42);
    expect(dogAgeInHumanYears(0.5, 'size', 'small')).toBe(7.5);
    expect(await data(dogAgeTool, { dogYears: 5, size: 'medium' })).toMatchObject({ bySize: 39, epigenetic: 56.8, lifeStage: 'Adulto' });
    await fails(dogAgeTool, { dogYears: 0.1, size: 'small' });
  });
});

describe('numerologia, ascendente e ENEM', () => {
  it('redução e números mestres', () => {
    expect(reduceNumber(29)).toBe(11);
    expect(reduceNumber(29, false)).toBe(2);
    expect(reduceNumber(22)).toBe(22);
    expect(reduceNumber(38)).toBe(11);
    expect(reduceNumber(9)).toBe(9);
    expect(reduceNumber(10)).toBe(1);
  });

  it('números do nome (tabela pitagórica) ignoram acentos e pontuação', () => {
    expect(nameNumbers('Maria')).toEqual({ expression: 6, soul: 11, personality: 4 });
    expect(nameNumbers('MÁRIA!')).toEqual(nameNumbers('Maria'));
    expect(nameNumbers('Maria', false)).toEqual({ expression: 6, soul: 2, personality: 4 });
    expect(nameNumbers('Ana')).toMatchObject({ expression: 7 });
    expect(nameNumbers('Rhythm').soul).toBe(0);
    expect(() => nameNumbers('123 !!')).toThrow('letras');
    expect(lifePathNumber(1990, 3, 10)).toBe(5); // dia 10→1, mês 3, ano 1990→1; 1+3+1
  });

  it('ferramenta de numerologia', async () => {
    const r = await data(numerologyTool, { name: 'Maria', birthDate: '1990-03-10' });
    expect(r.expression).toContain('6');
    expect(r.lifePath).toBeDefined();
    await fails(numerologyTool, { name: '' }, 'letras');
    await fails(numerologyTool, { name: 'Ana', birthDate: '1990-02-30' });
  });

  it('Sol: equinócio e solstício', () => {
    expect(Math.min(sunLongitude(Date.UTC(2024, 2, 20, 3, 6)), 360 - sunLongitude(Date.UTC(2024, 2, 20, 3, 6)))).toBeLessThan(0.3);
    expect(sunLongitude(Date.UTC(2024, 5, 20, 20, 51))).toBeCloseTo(90, 0);
    expect(sunLongitude(Date.UTC(2024, 8, 22, 12, 44))).toBeCloseTo(180, 0);
    expect(sunLongitude(Date.UTC(2024, 11, 21, 9, 21))).toBeCloseTo(270, 0);
  });

  it('ascendente ao nascer do Sol coincide com a posição do Sol', () => {
    // Londres, 20/03/2024, nascer do Sol por volta das 06:03 UTC.
    const asc = ascendantLongitude(Date.UTC(2024, 2, 20, 6, 3), 51.5, -0.12);
    const sun = sunLongitude(Date.UTC(2024, 2, 20, 6, 3));
    const diff = Math.abs(((asc - sun + 540) % 360) - 180);
    expect(diff).toBeLessThan(6);
    // Solstício de junho em São Paulo, nascer por volta das 06:50 local (09:50 UTC).
    const asc2 = ascendantLongitude(Date.UTC(2024, 5, 20, 9, 50), -23.55, -46.63);
    const sun2 = sunLongitude(Date.UTC(2024, 5, 20, 9, 50));
    expect(Math.abs(((asc2 - sun2 + 540) % 360) - 180)).toBeLessThan(8);
  });

  it('ascendente percorre o zodíaco inteiro em um dia sideral', () => {
    let previous = ascendantLongitude(Date.UTC(2024, 0, 1, 0, 0), -23.55, -46.63);
    let wraps = 0;
    for (let h = 1; h <= 24; h++) {
      const now = ascendantLongitude(Date.UTC(2024, 0, 1, h, 0), -23.55, -46.63);
      if (now < previous) wraps++;
      else expect(now - previous).toBeLessThan(120);
      previous = now;
    }
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it('ENEM: médias e erros', async () => {
    expect(await data(enemTool, { languages: 600, humanities: 650, nature: 700, math: 800, essay: 900, weightLanguages: 2, weightHumanities: 1, weightNature: 1, weightMath: 3, weightEssay: 3 })).toMatchObject({ simpleAverage: 730, weightedAverage: 765 });
    expect(await data(enemTool, {})).toMatchObject({ simpleAverage: 600, weightedAverage: 600 });
    await fails(enemTool, { weightLanguages: 0, weightHumanities: 0, weightNature: 0, weightMath: 0, weightEssay: 0 }, 'pesos');
    await fails(enemTool, { languages: 1001 });
  });
});

// ---------------- folha de pagamento ----------------

describe('INSS', () => {
  const t2026 = INSS_TABLES[2026]!;

  it('limites de faixa de 2026', () => {
    expect(calcInss(1621, 2026).contribution).toBe(121.58);
    expect(calcInss(2902.84, 2026).contribution).toBe(236.94);
    expect(calcInss(4354.27, 2026).contribution).toBe(411.11);
    expect(calcInss(8475.55, 2026).contribution).toBe(988.09);
    expect(calcInss(50000, 2026)).toMatchObject({ contribution: 988.09, atCeiling: true, base: 8475.55 });
    expect(calcInss(0, 2026)).toMatchObject({ contribution: 0, effectiveRate: 0 });
  });

  it('coincide com a soma faixa a faixa (±1 centavo) e nunca diminui', () => {
    const progressive = (gross: number) => {
      let total = 0;
      let lower = 0;
      for (const b of t2026.brackets) {
        const upper = Math.min(gross, b.upTo);
        if (upper > lower) total += (upper - lower) * b.rate;
        lower = b.upTo;
      }
      return total;
    };
    let previous = 0;
    for (let g = 0; g <= 10000; g += 37.31) {
      const c = calcInss(g, 2026).contribution;
      expect(Math.abs(c - progressive(Math.min(g, t2026.ceiling)))).toBeLessThanOrEqual(0.011);
      expect(c).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = c;
    }
  });

  it('2025 tem tabela própria e anos sem tabela são recusados com mensagem', async () => {
    expect(calcInss(1518, 2025).contribution).toBe(113.85);
    expect(calcInss(10000, 2025).contribution).toBeCloseTo(951.63, 1);
    expect(() => calcInss(3000, 2019)).toThrow('2019');
    await fails(inssTool, { gross: 3000, category: 'employee', year: 2019 }, 'Competências disponíveis');
  });

  it('categorias do INSS', async () => {
    expect(await data(inssTool, { gross: 10000, category: 'employee', year: 2026 })).toMatchObject({ contribution: 988.09, ceiling: 8475.55 });
    expect(await data(inssTool, { gross: 5000, category: 'autonomous', year: 2026 })).toMatchObject({ contribution: 1000, effectiveRate: 20 });
    expect((await data(inssTool, { gross: 500, category: 'autonomous', year: 2026 })).base).toBe(1621);
    expect((await data(inssTool, { gross: 99999, category: 'autonomous', year: 2026 })).base).toBe(8475.55);
    expect((await data(inssTool, { gross: 9999, category: 'simplified', year: 2026 })).contribution).toBe(178.31);
    expect((await data(inssTool, { gross: 9999, category: 'mei', year: 2026 })).contribution).toBe(81.05);
    expect((await data(inssTool, { gross: 2000, category: 'employee', year: '2025' as unknown as number })).source).toContain('nº 6');
  });
});

describe('imposto de renda na fonte (2026)', () => {
  it('isenção, faixas e dependentes', () => {
    expect(calcIrrf({ gross: 2428.8, inss: 0, year: 2026 }).tax).toBe(0);
    expect(calcIrrf({ gross: 3000, inss: 248.6, year: 2026 })).toMatchObject({ tax: 0, deductionKind: 'simplified', deductionUsed: 607.2 });
    expect(calcIrrf({ gross: 7000, inss: 800, year: 2026 })).toMatchObject({ deductionKind: 'legal', taxableBase: 6200 });
    // Dependentes reduzem a base em R$ 189,59 cada.
    const a = calcIrrf({ gross: 9000, inss: 988.09, dependents: 0, year: 2026 });
    const b = calcIrrf({ gross: 9000, inss: 988.09, dependents: 2, year: 2026 });
    expect(a.taxableBase - b.taxableBase).toBeCloseTo(379.18, 2);
    expect(a.tax - b.tax).toBeCloseTo(379.18 * 0.275, 1);
    expect(calcIrrf({ gross: 9000, inss: 988.09, year: 2026 }).reducer).toBe(0);
  });

  it('exemplo oficial da Alterdata: base 5.257,80 e redução 194,09', () => {
    const r = calcIrrf({ gross: 5892.33, inss: 634.53, year: 2026 });
    expect(r).toMatchObject({ taxableBase: 5257.8, reducer: 194.09 });
    expect(r.tableTax).toBeCloseTo(537.17, 2);
    expect(Math.abs(r.tax - 343.07)).toBeLessThanOrEqual(0.011);
  });

  it('a redução é contínua nos limites de R$ 5.000 e R$ 7.350 e o imposto nunca diminui', () => {
    expect(calcIrrf({ gross: 5000, inss: 501.51, year: 2026 }).tax).toBe(0);
    expect(calcIrrf({ gross: 5000.01, inss: 501.51, year: 2026 }).reducer).toBeCloseTo(312.89, 1);
    expect(calcIrrf({ gross: 7350, inss: 900, year: 2026 }).reducer).toBeLessThan(0.01);
    expect(calcIrrf({ gross: 7350.01, inss: 900, year: 2026 }).reducer).toBe(0);
    let previous = 0;
    for (let g = 1000; g <= 20000; g += 25) {
      const tax = calcIrrf({ gross: g, inss: calcInss(g, 2026).contribution, year: 2026 }).tax;
      expect(tax, `bruto ${g}`).toBeGreaterThanOrEqual(previous - 0.011);
      previous = tax;
    }
  });

  it('o líquido nunca diminui quando o bruto aumenta', () => {
    let previous = 0;
    for (let g = 1000; g <= 20000; g += 25) {
      const net = calcNetSalary({ gross: g, dependents: 0, pension: 0, transportDiscount: 0, other: 0, deduction: 'auto', year: 2026 }).net;
      expect(net, `bruto ${g}`).toBeGreaterThanOrEqual(previous - 0.021);
      previous = net;
    }
  });

  it('ferramenta: INSS opcional, modos de dedução e competência', async () => {
    expect(await data(incomeTaxTool, { gross: 5000, year: 2026 })).toMatchObject({ tax: 0, inssUsed: 501.51 });
    expect((await data(incomeTaxTool, { gross: 9000, inss: 988.09, year: 2026 })).tax).toBeGreaterThan(1000);
    expect((await data(incomeTaxTool, { gross: 4000, year: 2026, deduction: 'legal' })).deductionKind).toBe('deduções legais');
    expect(Object.keys(IR_TABLES)).toEqual(['2026']);
    await fails(incomeTaxTool, { gross: 5000, year: 2024 }, 'Competências disponíveis');
  });
});

describe('salário líquido, 13º, férias, FGTS e adicionais', () => {
  it('salário líquido', async () => {
    expect(await data(netSalaryTool, { gross: 3000, year: 2026 })).toMatchObject({ inss: 248.6, irrf: 0, net: 2751.4, fgtsDeposit: 240 });
    const high = await data(netSalaryTool, { gross: 10000, year: 2026 });
    expect(high).toMatchObject({ inss: 988.09 });
    expect(high.irrf).toBeCloseTo(calcIrrf({ gross: 10000, inss: 988.09, year: 2026 }).tax, 2);
    expect(high.net).toBeCloseTo(10000 - 988.09 - (high.irrf as number), 2);
    const vt = await data(netSalaryTool, { gross: 3000, transportVoucher: true, transportCost: 100, year: 2026 });
    expect(vt.transportDiscount).toBe(100);
    expect((await data(netSalaryTool, { gross: 3000, transportVoucher: true, year: 2026 })).transportDiscount).toBe(180);
    expect((await data(netSalaryTool, { gross: 3000, pension: 500, otherDiscounts: 100, year: 2026 })).net).toBeCloseTo(3000 - 248.6 - 500 - 100, 2);
  });

  it('vale-transporte: limite de 6%', async () => {
    expect(await data(transportVoucherTool, { baseSalary: 3000, dailyCost: 12, workDays: 22 })).toEqual({ monthlyCost: 264, employeeDiscount: 180, employerCost: 84, maxDiscount: 180 });
    expect(await data(transportVoucherTool, { baseSalary: 3000, dailyCost: 5, workDays: 20 })).toMatchObject({ employeeDiscount: 100, employerCost: 0 });
  });

  it('horas extras e adicional noturno', async () => {
    expect(await data(overtimeTool, { salary: 2200, monthlyHours: 220, hours50: 10, hours100: 5, percent50: 50, percent100: 100 })).toMatchObject({ hourlyRate: 10, overtime50: 150, overtime100: 100, overtimeTotal: 250 });
    expect((await data(overtimeTool, { salary: 2200, hours50: 10, percent50: 60 })).overtime50).toBe(160);
    await fails(overtimeTool, { salary: 2200, percent50: 40 });
    await fails(overtimeTool, { salary: 2200, workingDays: 0, restDays: 5 }, 'dias úteis');
    const n = await data(nightShiftTool, { salary: 2200, monthlyHours: 220, nightHours: 42, percent: 20 });
    expect(n).toMatchObject({ paidNightHours: 48, additional: 96, reducedHourPay: 60, total: 156 });
    // Cada hora de relógio rende 60/52,5 de hora paga: 37,14% a mais com 20% de adicional.
    expect(((await data(nightShiftTool, { salary: 2200, nightHours: 1 })).total as number)).toBeCloseTo(3.71, 2);
  });

  it('13º salário proporcional e parcelas', async () => {
    const r = await data(thirteenthTool, { salary: 3000, months: 6, year: 2026 });
    expect(r).toMatchObject({ gross: 1500, firstInstallment: 750 });
    expect(r.net).toBeCloseTo(1500 - (r.inss as number) - (r.irrf as number), 2);
    expect((await data(thirteenthTool, { salary: 3000, averageVariable: 600, months: 12, year: 2026 })).gross).toBe(3600);
    await fails(thirteenthTool, { salary: 3000, months: 13 });
    await fails(thirteenthTool, { salary: 3000, months: 0 });
  });

  it('férias: faltas, abono e tributos', async () => {
    for (const [faltas, dias] of [[0, 30], [5, 30], [6, 24], [14, 24], [15, 18], [23, 18], [24, 12], [32, 12], [33, 0]] as const) {
      expect(vacationDaysForAbsences(faltas)).toBe(dias);
    }
    const basic = await data(vacationTool, { salary: 3000, year: 2026 });
    expect(basic).toMatchObject({ daysEntitled: 30, vacationPay: 3000, constitutionalThird: 1000, gross: 4000 });
    const sold = await data(vacationTool, { salary: 3000, sellDays: true, year: 2026 });
    expect(sold).toMatchObject({ daysEnjoyed: 20, vacationPay: 2000, constitutionalThird: 666.67, soldDaysPay: 1333.33 });
    // O abono pecuniário não sofre INSS nem IR: a base tributável é só férias + 1/3.
    expect(sold.inss).toBe(calcInss(2666.67, 2026).contribution);
    expect((await data(vacationTool, { salary: 3000, absences: 10, year: 2026 })).daysEntitled).toBe(24);
    await fails(vacationTool, { salary: 3000, absences: 40 }, 'perde');
  });

  it('FGTS: depósitos, rendimento e multa', async () => {
    expect(await data(fgtsTool, { salary: 3000, months: 12, yearlyRate: 0 })).toMatchObject({ monthlyDeposit: 240, projectedBalance: 2880, penalty: 1152, withdrawable: 4032 });
    const grown = await data(fgtsTool, { salary: 3000, months: 12, yearlyRate: 3 });
    expect(grown.projectedBalance).toBeGreaterThan(2880);
    expect(grown.projectedBalance).toBeLessThan(2880 * 1.03);
    expect(await data(fgtsTool, { salary: 3000, currentBalance: 10000, months: 0, yearlyRate: 3, dismissal: 'agreement' })).toMatchObject({ penalty: 2000, withdrawable: 10000 });
    expect(await data(fgtsTool, { salary: 3000, currentBalance: 10000, months: 0, dismissal: 'other' })).toMatchObject({ penalty: 0, withdrawable: 0 });
  });
});

describe('rescisão trabalhista', () => {
  const base = {
    salary: 3000, averageVariable: 0, admission: d('2022-03-01'), termination: d('2026-06-15'), type: 'without_cause' as const,
    notice: 'indemnified' as const, overdueVacationPeriods: 0, fgtsBalance: 10000, dependents: 0, deduction: 'auto' as const, year: 2026, domestic: false,
  };
  const line = (r: ReturnType<typeof calcTermination>, fragment: string) => r.lines.find((l) => l.label.includes(fragment));

  it('aviso prévio proporcional e contagem de meses', () => {
    expect(noticeDaysFor(0)).toBe(30);
    expect(noticeDaysFor(4)).toBe(42);
    expect(noticeDaysFor(20)).toBe(90);
    expect(noticeDaysFor(40)).toBe(90);
    expect(fullYears(d('2022-03-01'), d('2026-02-28'))).toBe(3);
    expect(fullYears(d('2022-03-01'), d('2026-03-01'))).toBe(4);
    expect(monthsBetweenCounting15(d('2026-03-01'), d('2026-07-27'))).toBe(5);
    expect(monthsBetweenCounting15(d('2026-03-01'), d('2026-07-10'))).toBe(4);
  });

  it('dispensa sem justa causa, aviso indenizado (verbas calculadas à mão)', () => {
    const r = calcTermination(base);
    expect(r.noticeDays).toBe(42);
    expect(line(r, 'Saldo')?.value).toBe(1500);
    expect(line(r, 'Aviso prévio')?.value).toBe(4200);
    expect(line(r, '13º')?.value).toBe(1750); // 7/12: projeção até 27/07
    expect(line(r, 'Férias proporcionais (5/12)')?.value).toBe(1250);
    expect(line(r, '1/3 constitucional sobre as férias proporcionais')?.value).toBe(416.67);
    expect(line(r, 'INSS sobre o saldo')?.value).toBe(112.5);
    expect(line(r, 'INSS sobre o 13º')?.value).toBe(133.18);
    expect(r.gross).toBe(9116.67);
    expect(r.net).toBeCloseTo(9116.67 - 112.5 - 133.18, 2);
    // Multa de 40% sobre o saldo mais 8% das verbas.
    expect(r.fgtsPenalty).toBe(round2(0.4 * (10000 + 0.08 * (1500 + 1750 + 4200))));
    expect(r.fgtsWithdrawable).toBeCloseTo(r.fgtsPenalty + 10000 + 0.08 * 7450, 2);
  });

  it('aviso trabalhado não gera pagamento de aviso nem projeção', () => {
    const r = calcTermination({ ...base, notice: 'worked' });
    expect(line(r, 'Aviso')).toBeUndefined();
    expect(line(r, '13º')?.value).toBe(1500); // 6/12 (jun, 15 dias conta)
    expect(r.noticeDays).toBe(0);
  });

  it('pedido de demissão: sem multa; aviso não cumprido é descontado', () => {
    const r = calcTermination({ ...base, type: 'resignation', notice: 'indemnified' });
    expect(r.fgtsPenalty).toBe(0);
    expect(r.fgtsWithdrawable).toBe(0);
    expect(line(r, 'Aviso prévio não cumprido')?.value).toBe(3000);
    expect(line(r, '13º')).toBeDefined();
    const worked = calcTermination({ ...base, type: 'resignation', notice: 'worked' });
    expect(line(worked, 'Aviso prévio não cumprido')).toBeUndefined();
  });

  it('justa causa: só saldo de salário e férias vencidas', () => {
    const r = calcTermination({ ...base, type: 'cause', overdueVacationPeriods: 1 });
    expect(r.lines.some((l) => l.label.includes('13º'))).toBe(false);
    expect(r.lines.some((l) => l.label.includes('proporcionais'))).toBe(false);
    expect(line(r, 'Férias vencidas')?.value).toBe(3000);
    expect(line(r, '1/3 constitucional sobre as férias vencidas')?.value).toBe(1000);
    expect(r.fgtsPenalty).toBe(0);
  });

  it('acordo (art. 484-A): aviso pela metade, multa de 20% e saque de 80%', () => {
    const r = calcTermination({ ...base, type: 'agreement' });
    expect(r.noticeDays).toBe(21);
    expect(line(r, 'Aviso prévio')?.value).toBe(2100);
    const total = 10000 + 0.08 * (1500 + (line(r, '13º')?.value ?? 0) + 2100);
    expect(r.fgtsPenalty).toBeCloseTo(total * 0.2, 1);
    expect(r.fgtsWithdrawable).toBeCloseTo(total * 0.8 + total * 0.2, 1);
  });

  it('término de contrato a prazo: sem aviso e sem multa, mas saca o FGTS', () => {
    const r = calcTermination({ ...base, type: 'fixed_term' });
    expect(r.noticeDays).toBe(0);
    expect(r.fgtsPenalty).toBe(0);
    expect(r.fgtsWithdrawable).toBeGreaterThan(10000);
  });

  it('férias vencidas somam 1/3 e a data inválida é recusada', () => {
    expect(() => calcTermination({ ...base, termination: d('2020-01-01') })).toThrow('anterior');
    const r = calcTermination({ ...base, overdueVacationPeriods: 2, type: 'without_cause' });
    expect(line(r, 'Férias vencidas (2 períodos)')?.value).toBe(6000);
  });

  it('empregado doméstico: fundo de 3,2% no lugar da multa; acordo não coberto', () => {
    const r = calcTermination({ ...base, admission: d('2023-01-10'), termination: d('2026-06-20'), domestic: true });
    expect(r.fgtsPenalty).toBe(0);
    expect(r.compensatoryFund).toBe(round2(0.032 * 3000 * 41));
    expect(r.fgtsWithdrawable).toBeGreaterThan(r.compensatoryFund);
    expect(() => calcTermination({ ...base, type: 'agreement', domestic: true })).toThrow('doméstico');
    expect(calcTermination({ ...base, domestic: true, compensatoryFundBalance: 500 }).compensatoryFund).toBe(500);
  });

  it('ferramentas validam a entrada e devolvem texto formatado', async () => {
    const r = await data(terminationTool, { salary: 3000, admission: '2022-03-01', termination: '2026-06-15', type: 'without_cause', notice: 'indemnified', fgtsBalance: 10000, year: 2026 });
    expect(r.noticeDays).toBe(42);
    expect((r.breakdown as string[])[0]).toBe('+ Saldo de salário (15 dias): R$ 1.500,00');
    await fails(terminationTool, { admission: '2022-03-01', termination: '2021-01-01' }, 'anterior');
    await fails(terminationTool, { admission: '2022-03-01', termination: '2026-06-15', year: 2020 }, 'Competências');
    await fails(domesticTerminationTool, { admission: '2022-03-01', termination: '2026-06-15', type: 'agreement' }, 'doméstico');
    const dom = await data(domesticTerminationTool, { salary: 2000, admission: '2023-01-10', termination: '2026-06-20', type: 'without_cause', year: 2026 });
    expect(String(dom.note)).toContain('3,2%');
  });
});

describe('aposentadoria', () => {
  it('tabelas de pontos e de idade mínima progressiva', () => {
    expect(pointsRequired('male', 2019)).toBe(96);
    expect(pointsRequired('male', 2026)).toBe(103);
    expect(pointsRequired('male', 2028)).toBe(105);
    expect(pointsRequired('male', 2040)).toBe(105);
    expect(pointsRequired('female', 2019)).toBe(86);
    expect(pointsRequired('female', 2026)).toBe(93);
    expect(pointsRequired('female', 2033)).toBe(100);
    expect(pointsRequired('female', 2050)).toBe(100);
    expect(progressiveAgeRequired('female', 2019)).toBe(56);
    expect(progressiveAgeRequired('female', 2026)).toBe(59.5);
    expect(progressiveAgeRequired('female', 2031)).toBe(62);
    expect(progressiveAgeRequired('female', 2045)).toBe(62);
    expect(progressiveAgeRequired('male', 2019)).toBe(61);
    expect(progressiveAgeRequired('male', 2026)).toBe(64.5);
    expect(progressiveAgeRequired('male', 2027)).toBe(65);
    expect(progressiveAgeRequired('male', 2035)).toBe(65);
  });

  it('homem de 66 anos com 36 de contribuição já atende a regra permanente', () => {
    const input = { sex: 'male' as const, birth: d('1960-01-01'), contributionMonths: 36 * 12, reference: d('2026-06-01'), insuredBeforeReform: true };
    const now = evaluateRetirement(input);
    expect(now.rules[0]?.eligible).toBe(true); // regra permanente
    expect(now.rules[2]?.eligible).toBe(true); // idade mínima progressiva (64,5 em 2026)
    expect(now.rules[1]?.eligible).toBe(false); // pontos: 102,4 < 103
    expect(now.rules[1]?.missing).toContain('pontos');
    expect(earliestRetirement(input)?.monthsAhead).toBe(0);
  });

  it('quem se filiou depois da reforma só tem a regra permanente', () => {
    const input = { sex: 'female' as const, birth: d('1990-01-01'), contributionMonths: 12 * 10, reference: d('2026-01-01'), insuredBeforeReform: false };
    const rules = evaluateRetirement(input).rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]?.eligible).toBe(false);
    const earliest = earliestRetirement(input);
    expect(earliest?.date.year).toBe(2052); // 62 anos de idade
  });

  it('mulher de 56 anos com 30 de contribuição: a primeira data fica por volta de 2032', () => {
    const input = { sex: 'female' as const, birth: d('1970-01-01'), contributionMonths: 30 * 12, reference: d('2026-01-01'), insuredBeforeReform: true };
    const e = earliestRetirement(input);
    expect(e).not.toBeNull();
    expect(e!.date.year).toBeGreaterThanOrEqual(2031);
    expect(e!.date.year).toBeLessThanOrEqual(2032);
  });

  it('o tempo de contribuição insuficiente é apontado no motivo', () => {
    const r = evaluateRetirement({ sex: 'male', birth: d('1960-01-01'), contributionMonths: 10 * 12, reference: d('2026-06-01'), insuredBeforeReform: true });
    expect(r.rules[0]?.eligible).toBe(false);
    expect(r.rules[0]?.missing).toContain('contribuição');
  });

  it('ferramenta: valor estimado e erros', async () => {
    const r = await data(retirementTool, { sex: 'male', birthDate: '1960-01-01', contributionYears: 36, contributionMonths: 0, insuredBeforeReform: true, averageSalary: 5000, referenceDate: '2026-06-01' });
    expect(String(r.estimatedBenefit)).toContain('92%');
    expect(String(r.estimatedBenefit)).toContain('4.600,00');
    expect((r.rules as string[])[0]).toMatch(/^Atende: /);
    const low = await data(retirementTool, { sex: 'male', birthDate: '1960-01-01', contributionYears: 36, insuredBeforeReform: true, averageSalary: 1000, referenceDate: '2026-06-01' });
    expect(String(low.estimatedBenefit)).toContain('1.621,00'); // piso: salário mínimo
    await fails(retirementTool, { birthDate: '2030-01-01', referenceDate: '2026-01-01' }, 'anterior');
  });
});

describe('PJ e pró-labore', () => {
  const base = { revenue12: undefined, proLabore: 3000, expenses: 0, dependents: 0, year: 2026 };

  it('Simples: alíquota efetiva por faixa (Anexos III e V)', () => {
    expect(calcPj({ ...base, monthlyRevenue: 10000, regime: 'simples_iii' })).toMatchObject({ effectiveRate: 6, tax: 600 });
    expect(calcPj({ ...base, monthlyRevenue: 10000, regime: 'simples_v' })).toMatchObject({ effectiveRate: 15.5, tax: 1550 });
    expect(calcPj({ ...base, monthlyRevenue: 30000, regime: 'simples_iii' }).effectiveRate).toBe(8.6); // RBT12 de 360 mil
    expect(calcPj({ ...base, monthlyRevenue: 5000, revenue12: 700_000, regime: 'simples_iii' }).effectiveRate).toBeCloseTo(((700000 * 0.135 - 17640) / 700000) * 100, 2);
    expect(() => calcPj({ ...base, monthlyRevenue: 500_000, regime: 'simples_iii' })).toThrow('4,8 milhões');
  });

  it('Fator R decide o anexo', () => {
    const iii = calcPj({ ...base, monthlyRevenue: 10000, proLabore: 3000, regime: 'simples_factor_r' });
    expect(iii).toMatchObject({ annex: 'III', factorR: 30 });
    const v = calcPj({ ...base, monthlyRevenue: 10000, proLabore: 1621, regime: 'simples_factor_r' });
    expect(v).toMatchObject({ annex: 'V', factorR: 16.21, effectiveRate: 15.5 });
    expect(v.notes.join(' ')).toContain('Anexo V');
  });

  it('pró-labore: INSS de 11%, IR e distribuição de lucros', () => {
    const r = calcPj({ ...base, monthlyRevenue: 10000, regime: 'simples_iii', expenses: 500 });
    expect(r.inss).toBe(330);
    expect(r.irrf).toBe(0);
    expect(r.distribution).toBe(10000 - 600 - 3000 - 500);
    expect(r.personalNet).toBe(round2(3000 - 330 + 5900));
    expect(calcPj({ ...base, monthlyRevenue: 20000, proLabore: 12000, regime: 'simples_iii' }).inss).toBe(round2(8475.55 * 0.11)); // teto
    expect(calcPj({ ...base, monthlyRevenue: 3000, proLabore: 1000, regime: 'simples_iii' }).notes.join(' ')).toContain('abaixo do salário mínimo');
    expect(calcPj({ ...base, monthlyRevenue: 5000, proLabore: 4000, expenses: 2000, regime: 'simples_iii' }).notes.join(' ')).toContain('não há lucro');
  });

  it('MEI: DAS fixo por atividade e limite anual', () => {
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_services' }).tax).toBe(86.05);
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_commerce' }).tax).toBe(82.05);
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_both' }).tax).toBe(87.05);
    expect(calcPj({ ...base, monthlyRevenue: 8000, regime: 'mei_services' }).notes.join(' ')).toContain('limite');
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_services' }).notes).toHaveLength(0);
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_services' }).personalNet).toBe(4913.95);
    expect(calcPj({ ...base, monthlyRevenue: 5000, regime: 'mei_services', year: 2025 }).tax).toBe(80.9);
  });

  it('ferramenta: fonte e erros', async () => {
    const r = await data(pjSalaryTool, { monthlyRevenue: 10000, proLabore: 3000, expenses: 0, regime: 'simples_iii', dependents: 0, year: 2026 });
    expect(r).toMatchObject({ tax: 600, effectiveRate: 6, inss: 330 });
    expect(String(r.source)).toContain('Lei Complementar 123');
    await fails(pjSalaryTool, { monthlyRevenue: 0, regime: 'simples_iii', year: 2026 }, 'faturamento');
    await fails(pjSalaryTool, { monthlyRevenue: 1000, regime: 'foo' });
  });
});
