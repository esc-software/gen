import { ToolError } from '@esc/gen-core';
import { bytesToBase64 } from '@esc/gen-core';
import { FormulaError, Workbook, addr, dateToSerial, numberToCol, type CellValue } from './xl-formula.js';

export type Fmt = 'money' | 'date' | 'percent' | 'int' | 'number' | 'text';
export type Style = 'title' | 'header' | 'input' | 'sample' | 'total' | 'label' | 'section' | 'note' | 'calc';

export interface CellSpec {
  /** Valor digitado. Datas usam {date: [ano, mês, dia]}. */
  v?: string | number | null | { date: [number, number, number] };
  /** Fórmula (sem o "="). O valor em cache é calculado pelo motor de fórmulas. */
  f?: string;
  fmt?: Fmt;
  style?: Style;
}

export interface ValidationSpec {
  /** Intervalo, como "C2:C101". */
  ref: string;
  /** Intervalo de origem da lista, como "Listas!$A$2:$A$11". */
  source: string;
}

export interface SheetSpec {
  name: string;
  widths: number[];
  cells: Map<string, CellSpec>;
  freezeRow?: number;
  validations: ValidationSpec[];
  tabColor?: string;
  /** Larguras de linha especiais ou mesclagens. */
  merges: string[];
  /** Folha que o CSV deve exportar (a tabela principal). */
  primary?: boolean;
}

export class Sheet {
  readonly spec: SheetSpec;

  constructor(name: string, widths: number[], options: { primary?: boolean; tabColor?: string } = {}) {
    if (name.length > 31 || /[\\/?*[\]:]/.test(name)) throw new Error(`Nome de planilha inválido: ${name}`);
    this.spec = { name, widths, cells: new Map(), validations: [], merges: [], ...(options.primary ? { primary: true } : {}), ...(options.tabColor ? { tabColor: options.tabColor } : {}) };
  }

  put(col: number, row: number, cell: CellSpec): this {
    this.spec.cells.set(addr(col, row), cell);
    return this;
  }

  /** Escreve uma linha de células a partir da coluna 1. */
  row(row: number, cells: (CellSpec | string | number | null)[], defaults: Partial<CellSpec> = {}): this {
    cells.forEach((c, i) => {
      if (c === null) return;
      const spec: CellSpec = typeof c === 'object' ? { ...defaults, ...c } : { ...defaults, v: c };
      this.put(i + 1, row, spec);
    });
    return this;
  }

  validate(ref: string, source: string): this {
    this.spec.validations.push({ ref, source });
    return this;
  }

  freeze(row: number): this {
    this.spec.freezeRow = row;
    return this;
  }

  merge(ref: string): this {
    this.spec.merges.push(ref);
    return this;
  }
}

export interface WorkbookSpec {
  title: string;
  sheets: SheetSpec[];
}

// ---------- cálculo dos valores em cache ----------

export type Computed = Map<string, Map<string, CellValue>>;

const serial = (v: { date: [number, number, number] }) => dateToSerial(v.date[0], v.date[1], v.date[2]);

export function computeWorkbook(spec: WorkbookSpec): Computed {
  const wb = new Workbook();
  for (const sheet of spec.sheets) wb.addSheet(sheet.name);
  for (const sheet of spec.sheets) {
    for (const [address, cell] of sheet.cells) {
      if (cell.f !== undefined) wb.set(sheet.name, address, { formula: cell.f });
      else if (cell.v !== undefined) wb.set(sheet.name, address, { value: typeof cell.v === 'object' && cell.v !== null ? serial(cell.v) : cell.v });
    }
  }
  const out: Computed = new Map();
  for (const sheet of spec.sheets) {
    const values = new Map<string, CellValue>();
    for (const [address, cell] of sheet.cells) {
      if (cell.f === undefined) continue;
      try {
        values.set(address, wb.get(sheet.name, address));
      } catch (e) {
        const code = e instanceof FormulaError ? e.code : String(e);
        throw new Error(`Fórmula com erro em ${sheet.name}!${address} (=${cell.f}): ${code}`);
      }
    }
    out.set(sheet.name, values);
  }
  return out;
}

// ---------- XLSX ----------

const NUM_FORMATS: Record<Fmt, string> = {
  money: '"R$" #,##0.00',
  date: 'dd/mm/yyyy',
  percent: '0.0%',
  int: '0',
  number: '#,##0.00',
  text: '@',
};

const COLORS = { primary: 'FF0F766E', headerText: 'FFFFFFFF', input: 'FFFFFBEB', calc: 'FFF1F5F9', total: 'FFE2E8F0', sample: 'FF6B7280', section: 'FFCCFBF1', border: 'FFCBD5E1' };

export async function buildXlsx(spec: WorkbookSpec): Promise<{ base64: string; computed: Computed }> {
  const ExcelJS = (await import('exceljs')).default;
  const computed = computeWorkbook(spec);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gen · ESC Software';
  wb.title = spec.title;
  wb.created = new Date(Date.UTC(2000, 0, 1));
  wb.calcProperties.fullCalcOnLoad = true;

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: sheet.freezeRow ? [{ state: 'frozen', ySplit: sheet.freezeRow }] : [], ...(sheet.tabColor ? { properties: { tabColor: { argb: sheet.tabColor } } } : {}) });
    sheet.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    const results = computed.get(sheet.name) as Map<string, CellValue>;

    for (const [address, cell] of sheet.cells) {
      const c = ws.getCell(address);
      if (cell.f !== undefined) {
        const result = results.get(address) ?? null;
        c.value = { formula: cell.f, result: (result === null ? '' : result) as string | number | boolean };
      } else if (cell.v !== undefined && cell.v !== null) {
        c.value = typeof cell.v === 'object' ? new Date(Date.UTC(cell.v.date[0], cell.v.date[1] - 1, cell.v.date[2])) : cell.v;
      }
      if (cell.fmt) c.numFmt = NUM_FORMATS[cell.fmt];
      const border = { style: 'thin' as const, color: { argb: COLORS.border } };
      switch (cell.style) {
        case 'title': c.font = { bold: true, size: 16, color: { argb: COLORS.primary } }; break;
        case 'section': c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.section } }; break;
        case 'header':
          c.font = { bold: true, color: { argb: COLORS.headerText } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
          c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          c.border = { top: border, left: border, bottom: border, right: border };
          break;
        case 'input': c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.input } }; c.border = { top: border, left: border, bottom: border, right: border }; break;
        case 'calc': c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.calc } }; c.border = { top: border, left: border, bottom: border, right: border }; break;
        case 'sample': c.font = { italic: true, color: { argb: COLORS.sample } }; c.border = { top: border, left: border, bottom: border, right: border }; break;
        case 'total': c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.total } }; c.border = { top: { style: 'medium' }, bottom: border, left: border, right: border }; break;
        case 'label': c.font = { bold: true }; break;
        case 'note': c.font = { color: { argb: COLORS.sample } }; c.alignment = { wrapText: true, vertical: 'top' }; break;
      }
    }

    for (const m of sheet.merges) ws.mergeCells(m);
    for (const v of sheet.validations) {
      const [start, end] = v.ref.split(':') as [string, string];
      const startCell = /^([A-Z]+)(\d+)$/.exec(start) as RegExpExecArray;
      const endCell = /^([A-Z]+)(\d+)$/.exec(end ?? start) as RegExpExecArray;
      for (let r = Number(startCell[2]); r <= Number(endCell[2]); r++) {
        ws.getCell(`${startCell[1]}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [v.source], showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Escolha um item da lista.' };
      }
    }
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { base64: bytesToBase64(new Uint8Array(buffer)), computed };
}

// ---------- CSV ----------

/** Neutraliza "injeção de fórmula": texto iniciado por = + - @ vira texto literal ao abrir no Excel. */
export function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvField(value: string, delimiter = ';'): string {
  return new RegExp(`[${delimiter}"\\r\\n]`).test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function plainValue(cell: CellSpec, computedValue: CellValue | undefined): string {
  const v: CellValue | { date: [number, number, number] } | undefined = cell.f !== undefined ? (computedValue ?? null) : (cell.v ?? null);
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return `${String(v.date[2]).padStart(2, '0')}/${String(v.date[1]).padStart(2, '0')}/${v.date[0]}`;
  if (typeof v === 'number') {
    if (cell.fmt === 'date') {
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
    if (cell.fmt === 'percent') return String(Math.round(v * 10000) / 100).replace('.', ',') + '%';
    return String(Math.round(v * 1e8) / 1e8).replace('.', ',');
  }
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  return csvText(v);
}

/** CSV (separador ";" e vírgula decimal, com BOM) de uma planilha, com os valores já calculados. */
export function sheetToCsv(spec: WorkbookSpec, computed: Computed, sheetName?: string): string {
  const sheet = sheetName ? spec.sheets.find((s) => s.name === sheetName) : (spec.sheets.find((s) => s.primary) ?? spec.sheets[0]);
  if (!sheet) throw new ToolError('Planilha não encontrada');
  const values = computed.get(sheet.name) as Map<string, CellValue>;
  let maxRow = 0;
  let maxCol = 0;
  for (const address of sheet.cells.keys()) {
    const m = /^([A-Z]+)(\d+)$/.exec(address) as RegExpExecArray;
    maxRow = Math.max(maxRow, Number(m[2]));
    let col = 0;
    for (const ch of m[1] as string) col = col * 26 + ch.charCodeAt(0) - 64;
    maxCol = Math.max(maxCol, col);
  }
  const lines: string[] = [];
  for (let r = 1; r <= maxRow; r++) {
    const fields: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const a = `${numberToCol(c)}${r}`;
      const cell = sheet.cells.get(a);
      fields.push(cell ? csvField(plainValue(cell, values.get(a))) : '');
    }
    if (fields.some((f) => f !== '')) lines.push(fields.join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
