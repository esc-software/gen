import { describe, expect, it } from 'vitest';
import { FormulaError, Workbook, colToNumber, dateToSerial, evaluateFormula, numberToCol, serialToDate } from './xl-formula.js';

const ev = evaluateFormula;

describe('endereços e datas', () => {
  it('colunas ida e volta', () => {
    expect(colToNumber('A')).toBe(1);
    expect(colToNumber('Z')).toBe(26);
    expect(colToNumber('AA')).toBe(27);
    expect(colToNumber('AZ')).toBe(52);
    expect(numberToCol(28)).toBe('AB');
    for (const n of [1, 26, 27, 52, 53, 702, 703, 16384]) expect(colToNumber(numberToCol(n))).toBe(n);
  });

  it('números de série do Excel', () => {
    expect(dateToSerial(2024, 1, 1)).toBe(45292);
    expect(dateToSerial(2000, 1, 1)).toBe(36526);
    expect(serialToDate(45292)).toEqual({ year: 2024, month: 1, day: 1 });
    expect(serialToDate(dateToSerial(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
  });
});

describe('expressões', () => {
  it('precedência e operadores como no Excel', () => {
    expect(ev('2+3*4')).toBe(14);
    expect(ev('(2+3)*4')).toBe(20);
    expect(ev('2^3^2')).toBe(64); // associativa à esquerda no Excel
    expect(ev('-2^2')).toBe(4); // o menos unário vem antes da potência no Excel
    expect(ev('10/4')).toBe(2.5);
    expect(ev('50%')).toBe(0.5);
    expect(ev('200*10%')).toBe(20);
    expect(ev('"a"&"b"&1')).toBe('ab1');
    expect(ev('1<2')).toBe(true);
    expect(ev('"abc"="ABC"')).toBe(true);
    expect(ev('2<>3')).toBe(true);
    expect(ev('3>=3')).toBe(true);
    expect(ev('"a"&"""q"""')).toBe('a"q"');
  });

  it('erros do Excel', () => {
    expect(() => ev('1/0')).toThrow(FormulaError);
    expect(() => ev('"x"+1')).toThrow('#VALUE!');
    expect(() => ev('FOO(1)')).toThrow('#NAME?');
    expect(() => ev('1+')).toThrow('#NAME?');
    expect(ev('IFERROR(1/0,"erro")')).toBe('erro');
    expect(ev('IFERROR(5,"erro")')).toBe(5);
  });

  it('referências, intervalos e células vazias', () => {
    const cells = { A1: 10, A2: 20, A3: null, A4: 'texto', B1: 3 };
    expect(ev('A1+A2', cells)).toBe(30);
    expect(ev('SUM(A1:A4)', cells)).toBe(30); // texto e vazios são ignorados em intervalos
    expect(ev('SUM(A1:A2,B1,5)', cells)).toBe(38);
    expect(ev('A3+1', cells)).toBe(1);
    expect(ev('A3&"x"', cells)).toBe('x');
    expect(ev('A1*$B$1', cells)).toBe(30);
    expect(ev('AVERAGE(A1:A2)', cells)).toBe(15);
    expect(ev('MAX(A1:A3)', cells)).toBe(20);
    expect(ev('MIN(A1:A2)', cells)).toBe(10);
    expect(ev('COUNTA(A1:A4)', cells)).toBe(3);
    expect(ev('ISBLANK(A3)', cells)).toBe(true);
    expect(ev('ABS(-3)+INT(2.9)', cells)).toBe(5);
  });

  it('IF, AND, OR', () => {
    expect(ev('IF(1>2,"a","b")')).toBe('b');
    expect(ev('IF(2>1,"a")')).toBe('a');
    expect(ev('IF(1>2,"a")')).toBe(false);
    expect(ev('AND(1,1,0)')).toBe(false);
    expect(ev('OR(0,0,1)')).toBe(true);
  });

  it('ROUND meio para cima, com negativos e dígitos negativos', () => {
    expect(ev('ROUND(2.675,2)')).toBe(2.68);
    expect(ev('ROUND(1.005,2)')).toBe(1.01);
    expect(ev('ROUND(-2.5,0)')).toBe(-3);
    expect(ev('ROUND(1234,-2)')).toBe(1200);
  });
});

describe('SUMIF, COUNTIF e critérios', () => {
  const cells = { A1: 'Moradia', A2: 'Lazer', A3: 'moradia', A4: 'Saúde', B1: 100, B2: 50, B3: 25, B4: 10, C1: 5, C2: 15, C3: 30, C4: 45 };

  it('igualdade sem diferenciar maiúsculas e curingas', () => {
    expect(ev('SUMIF(A1:A4,"Moradia",B1:B4)', cells)).toBe(125);
    expect(ev('SUMIF(A1:A4,"mor*",B1:B4)', cells)).toBe(125);
    expect(ev('SUMIF(A1:A4,"?azer",B1:B4)', cells)).toBe(50);
    expect(ev('COUNTIF(A1:A4,"moradia")', cells)).toBe(2);
    expect(ev('SUMIF(A1:A4,A4,B1:B4)', cells)).toBe(10);
    expect(ev('SUMIF(A1:A4,"<>Moradia",B1:B4)', cells)).toBe(60);
  });

  it('operadores numéricos e concatenação no critério', () => {
    expect(ev('COUNTIF(B1:B4,">20")', cells)).toBe(3);
    expect(ev('COUNTIF(B1:B4,">="&B2)', cells)).toBe(2);
    expect(ev('COUNTIF(C1:C4,">"&C3)+1', cells)).toBe(2); // posição em ordem decrescente
    expect(ev('SUMIF(B1:B4,"<=25")', cells)).toBe(35);
    expect(ev('COUNTIF(B1:B4,50)', cells)).toBe(1);
  });
});

describe('funções financeiras e de data', () => {
  it('PMT com os mesmos sinais do Excel', () => {
    expect(ev('ROUND(PMT(0.01,12,10000),2)')).toBe(-888.49);
    expect(ev('ROUND(PMT(0.01,12,-10000),2)')).toBe(888.49);
    expect(ev('PMT(0,10,1000)')).toBe(-100);
  });

  it('DATE, YEAR, MONTH, DAY e EDATE', () => {
    expect(ev('DATE(2024,1,1)')).toBe(45292);
    expect(ev('DATE(2024,14,1)')).toBe(dateToSerial(2025, 2, 1)); // meses excedentes avançam o ano
    expect(ev('YEAR(45292)')).toBe(2024);
    expect(ev('MONTH(45292)')).toBe(1);
    expect(ev('DAY(45322)')).toBe(31);
    expect(ev(`EDATE(${dateToSerial(2024, 1, 31)},1)`)).toBe(dateToSerial(2024, 2, 29));
    expect(ev(`EDATE(${dateToSerial(2024, 3, 31)},-1)`)).toBe(dateToSerial(2024, 2, 29));
    expect(ev(`EDATE(${dateToSerial(2024, 11, 15)},3)`)).toBe(dateToSerial(2025, 2, 15));
  });
});

describe('pasta de trabalho', () => {
  it('referências entre planilhas, inclusive com aspas no nome', () => {
    const wb = new Workbook();
    wb.addSheet('Dados');
    wb.addSheet('Resumo Geral');
    wb.set('Dados', 'A1', { value: 5 });
    wb.set('Dados', 'A2', { value: 7 });
    wb.set('Resumo Geral', 'A1', { formula: 'SUM(Dados!A1:A2)*2' });
    wb.set('Dados', 'B1', { formula: "'Resumo Geral'!A1+1" });
    expect(wb.get('Resumo Geral', 'A1')).toBe(24);
    expect(wb.get('Dados', 'B1')).toBe(25);
  });

  it('recalcula ao mudar uma entrada e detecta ciclos e planilhas inexistentes', () => {
    const wb = new Workbook();
    wb.addSheet('S');
    wb.set('S', 'A1', { value: 1 });
    wb.set('S', 'A2', { formula: 'A1*10' });
    expect(wb.get('S', 'A2')).toBe(10);
    wb.set('S', 'A1', { value: 2 });
    expect(wb.get('S', 'A2')).toBe(20);
    wb.set('S', 'B1', { formula: 'B2+1' });
    wb.set('S', 'B2', { formula: 'B1+1' });
    expect(() => wb.get('S', 'B1')).toThrow('#CIRC!');
    wb.set('S', 'C1', { formula: 'Inexistente!A1' });
    expect(() => wb.get('S', 'C1')).toThrow('#REF!');
  });
});
