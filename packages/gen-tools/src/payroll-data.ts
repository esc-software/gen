import { ToolError } from '@esc/gen-core';

/**
 * Tabelas oficiais usadas pelas calculadoras trabalhistas e tributárias.
 *
 * Para atualizar: acrescente a nova competência aqui (valores, fonte e data da conferência)
 * e adicione o ano a `SUPPORTED_*`. A lógica de cálculo não precisa mudar.
 * Competências sem tabela cadastrada são recusadas com uma mensagem clara.
 */

export interface InssBracket {
  /** Limite superior da faixa (R$). */
  upTo: number;
  /** Alíquota em fração (0,075 = 7,5%). */
  rate: number;
  /** Parcela a deduzir (R$), conforme a portaria. */
  deduction: number;
}

export interface InssTable {
  year: number;
  /** Teto do salário de contribuição (R$). */
  ceiling: number;
  brackets: InssBracket[];
  source: string;
  verifiedOn: string;
}

export const INSS_TABLES: Record<number, InssTable> = {
  2025: {
    year: 2025,
    ceiling: 8157.41,
    brackets: [
      { upTo: 1518.0, rate: 0.075, deduction: 0 },
      { upTo: 2793.88, rate: 0.09, deduction: 22.77 },
      { upTo: 4190.83, rate: 0.12, deduction: 106.59 },
      { upTo: 8157.41, rate: 0.14, deduction: 190.4 },
    ],
    source: 'Portaria Interministerial MPS/MF nº 6, de 10/01/2025',
    verifiedOn: '2026-10-16',
  },
  2026: {
    year: 2026,
    ceiling: 8475.55,
    brackets: [
      { upTo: 1621.0, rate: 0.075, deduction: 0 },
      { upTo: 2902.84, rate: 0.09, deduction: 24.32 },
      { upTo: 4354.27, rate: 0.12, deduction: 111.4 },
      { upTo: 8475.55, rate: 0.14, deduction: 198.49 },
    ],
    source: 'Portaria Interministerial MPS/MF nº 13, de 09/01/2026',
    verifiedOn: '2026-10-16',
  },
};

export interface IrBracket {
  upTo: number;
  rate: number;
  deduction: number;
}

export interface IrTable {
  year: number;
  brackets: IrBracket[];
  /** Dedução por dependente (R$ por mês). */
  dependentDeduction: number;
  /** Desconto simplificado mensal (R$), alternativo às deduções legais. */
  simplifiedDeduction: number;
  /** Redução da Lei 15.270/2025 sobre o rendimento tributável bruto. */
  reducer: { fullUpTo: number; fullAmount: number; phaseOutUpTo: number; constant: number; factor: number };
  source: string;
  verifiedOn: string;
}

export const IR_TABLES: Record<number, IrTable> = {
  2026: {
    year: 2026,
    brackets: [
      { upTo: 2428.8, rate: 0, deduction: 0 },
      { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
      { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
      { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
      { upTo: Infinity, rate: 0.275, deduction: 908.73 },
    ],
    dependentDeduction: 189.59,
    simplifiedDeduction: 607.2,
    reducer: { fullUpTo: 5000, fullAmount: 312.89, phaseOutUpTo: 7350, constant: 978.62, factor: 0.133145 },
    source: 'Lei 15.191/2025 (tabela) e Lei 15.270/2025 (redução)',
    verifiedOn: '2026-10-16',
  },
};

/** Salário mínimo nacional por ano (R$). */
export const MINIMUM_WAGE: Record<number, number> = {
  2025: 1518,
  2026: 1621,
};

export const SUPPORTED_INSS_YEARS = Object.keys(INSS_TABLES).map(Number);
export const SUPPORTED_IR_YEARS = Object.keys(IR_TABLES).map(Number);

export function inssTable(year: number): InssTable {
  const table = INSS_TABLES[year];
  if (!table) {
    throw new ToolError(`Não há tabela do INSS cadastrada para ${year}. Competências disponíveis: ${SUPPORTED_INSS_YEARS.join(', ')}.`);
  }
  return table;
}

export function irTable(year: number): IrTable {
  const table = IR_TABLES[year];
  if (!table) {
    throw new ToolError(`Não há tabela do imposto de renda cadastrada para ${year}. Competências disponíveis: ${SUPPORTED_IR_YEARS.join(', ')}.`);
  }
  return table;
}

export function minimumWage(year: number): number {
  const wage = MINIMUM_WAGE[year];
  if (wage === undefined) throw new ToolError(`Não há salário mínimo cadastrado para ${year}. Competências disponíveis: ${Object.keys(MINIMUM_WAGE).join(', ')}.`);
  return wage;
}

/** Valores de referência da regra de transição da aposentadoria (EC 103/2019). */
export const RETIREMENT = {
  /** Pontos exigidos em 2019 e acréscimo anual, com teto. */
  points: { female: { start: 86, cap: 100 }, male: { start: 96, cap: 105 } },
  /** Idade mínima progressiva: em 2019 e acréscimo de 6 meses por ano, com teto. */
  progressiveAge: { female: { start: 56, cap: 62 }, male: { start: 61, cap: 65 } },
  contributionYears: { female: 30, male: 35 },
  permanentAge: { female: 62, male: 65 },
  permanentMinContribution: { female: 15, male: 20 },
  source: 'Emenda Constitucional 103/2019, arts. 15, 16 e 19',
  verifiedOn: '2026-10-16',
} as const;

/** Anexos III e V do Simples Nacional (LC 123/2006, redação da LC 155/2016). */
export interface SimplesBracket {
  upTo: number;
  rate: number;
  deduction: number;
}

export const SIMPLES_ANEXO_III: SimplesBracket[] = [
  { upTo: 180_000, rate: 0.06, deduction: 0 },
  { upTo: 360_000, rate: 0.112, deduction: 9_360 },
  { upTo: 720_000, rate: 0.135, deduction: 17_640 },
  { upTo: 1_800_000, rate: 0.16, deduction: 35_640 },
  { upTo: 3_600_000, rate: 0.21, deduction: 125_640 },
  { upTo: 4_800_000, rate: 0.33, deduction: 648_000 },
];

export const SIMPLES_ANEXO_V: SimplesBracket[] = [
  { upTo: 180_000, rate: 0.155, deduction: 0 },
  { upTo: 360_000, rate: 0.18, deduction: 4_500 },
  { upTo: 720_000, rate: 0.195, deduction: 9_900 },
  { upTo: 1_800_000, rate: 0.205, deduction: 17_100 },
  { upTo: 3_600_000, rate: 0.23, deduction: 62_100 },
  { upTo: 4_800_000, rate: 0.305, deduction: 540_000 },
];

export const SIMPLES_SOURCE = 'Lei Complementar 123/2006, Anexos III e V (LC 155/2016)';
