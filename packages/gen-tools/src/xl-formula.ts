/**
 * Motor mínimo de fórmulas no estilo Excel, usado para calcular os valores em cache das planilhas
 * geradas (e para conferi-las nos testes). Suporta só o que as planilhas do Gen usam.
 */

export type CellValue = number | string | boolean | null;

export class FormulaError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FormulaError';
  }
}

export interface CellInput {
  /** Valor digitado ou fórmula (sem o "="). */
  value?: CellValue;
  formula?: string;
}

export type SheetData = Map<string, CellInput>;

// ---------- endereços ----------

export function colToNumber(col: string): number {
  let n = 0;
  for (const c of col) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

export function numberToCol(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export const addr = (col: number, row: number) => `${numberToCol(col)}${row}`;

// ---------- datas (sistema 1900 do Excel) ----------

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function dateToSerial(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - EXCEL_EPOCH) / 86_400_000);
}

export function serialToDate(serial: number): { year: number; month: number; day: number } {
  const d = new Date(EXCEL_EPOCH + Math.floor(serial) * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ---------- análise sintática ----------

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; sheet: string | null; col: number; row: number }
  | { t: 'range'; sheet: string | null; c1: number; r1: number; c2: number; r2: number }
  | { t: 'un'; op: '-' | '+'; a: Node }
  | { t: 'pct'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'fn'; name: string; args: Node[] };

interface Tok {
  k: 'num' | 'str' | 'id' | 'op' | 'end';
  v: string;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] as string)) j++;
      out.push({ k: 'num', v: src.slice(i, j) });
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new FormulaError('#NAME?');
      out.push({ k: 'str', v: s });
      i = j + 1;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new FormulaError('#NAME?');
      out.push({ k: 'id', v: src.slice(i, j + 1) });
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j] as string)) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        out.push({ k: 'op', v: two });
        i += 2;
      } else if ('+-*/^&=<>(),:!%'.includes(c)) {
        out.push({ k: 'op', v: c });
        i++;
      } else throw new FormulaError('#NAME?');
    }
  }
  out.push({ k: 'end', v: '' });
  return out;
}

class Parser {
  private p = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek = () => this.toks[this.p] as Tok;
  private next = () => this.toks[this.p++] as Tok;
  private isOp = (v: string) => this.peek().k === 'op' && this.peek().v === v;

  parse(): Node {
    const n = this.comparison();
    if (this.peek().k !== 'end') throw new FormulaError('#NAME?');
    return n;
  }

  private comparison(): Node {
    let a = this.concat();
    while (['=', '<>', '<', '>', '<=', '>='].some((o) => this.isOp(o))) {
      const op = this.next().v;
      a = { t: 'bin', op, a, b: this.concat() };
    }
    return a;
  }

  private concat(): Node {
    let a = this.additive();
    while (this.isOp('&')) {
      this.next();
      a = { t: 'bin', op: '&', a, b: this.additive() };
    }
    return a;
  }

  private additive(): Node {
    let a = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().v;
      a = { t: 'bin', op, a, b: this.term() };
    }
    return a;
  }

  private term(): Node {
    let a = this.power();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.next().v;
      a = { t: 'bin', op, a, b: this.power() };
    }
    return a;
  }

  private power(): Node {
    let a = this.unary();
    while (this.isOp('^')) {
      this.next();
      a = { t: 'bin', op: '^', a, b: this.unary() };
    }
    return a;
  }

  private unary(): Node {
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.next().v as '-' | '+';
      return { t: 'un', op, a: this.unary() };
    }
    let a = this.primary();
    while (this.isOp('%')) {
      this.next();
      a = { t: 'pct', a };
    }
    return a;
  }

  private primary(): Node {
    const t = this.next();
    if (t.k === 'num') return { t: 'num', v: Number(t.v) };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const n = this.comparison();
      if (!this.isOp(')')) throw new FormulaError('#NAME?');
      this.next();
      return n;
    }
    if (t.k === 'id') {
      const up = t.v.toUpperCase();
      if (this.isOp('(') && !t.v.startsWith("'")) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.comparison());
          while (this.isOp(',')) {
            this.next();
            args.push(this.comparison());
          }
        }
        if (!this.isOp(')')) throw new FormulaError('#NAME?');
        this.next();
        return { t: 'fn', name: up, args };
      }
      if (up === 'TRUE') return { t: 'bool', v: true };
      if (up === 'FALSE') return { t: 'bool', v: false };
      let sheet: string | null = null;
      let ref = t.v;
      if (this.isOp('!')) {
        this.next();
        sheet = t.v.startsWith("'") ? t.v.slice(1, -1) : t.v;
        const r = this.next();
        if (r.k !== 'id') throw new FormulaError('#REF!');
        ref = r.v;
      }
      const a = parseAddr(ref);
      if (this.isOp(':')) {
        this.next();
        const r2 = this.next();
        if (r2.k !== 'id') throw new FormulaError('#REF!');
        const b = parseAddr(r2.v);
        return { t: 'range', sheet, c1: Math.min(a.col, b.col), r1: Math.min(a.row, b.row), c2: Math.max(a.col, b.col), r2: Math.max(a.row, b.row) };
      }
      return { t: 'ref', sheet, col: a.col, row: a.row };
    }
    throw new FormulaError('#NAME?');
  }
}

function parseAddr(text: string): { col: number; row: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(text);
  if (!m) throw new FormulaError('#REF!');
  return { col: colToNumber((m[1] as string).toUpperCase()), row: Number(m[2]) };
}

// ---------- avaliação ----------

type Evaluated = CellValue | CellValue[];

const isRange = (v: Evaluated): v is CellValue[] => Array.isArray(v);

function toNumber(v: CellValue): number {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new FormulaError('#VALUE!');
  return n;
}

const toText = (v: CellValue): string => (v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));

function compare(a: CellValue, b: CellValue): number {
  const an = a === null ? (typeof b === 'string' ? '' : 0) : a;
  const bn = b === null ? (typeof a === 'string' ? '' : 0) : b;
  if (typeof an === 'number' && typeof bn === 'number') return an < bn ? -1 : an > bn ? 1 : 0;
  if (typeof an === 'string' && typeof bn === 'string') {
    const x = an.toLowerCase();
    const y = bn.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  // Texto é maior que número, como no Excel.
  return typeof an === 'string' ? 1 : -1;
}

function criterionMatcher(criterion: CellValue): (v: CellValue) => boolean {
  if (typeof criterion === 'number') return (v) => typeof v === 'number' && v === criterion;
  const text = toText(criterion);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text) as RegExpExecArray;
  const op = m[1] ?? '=';
  const rhsText = m[2] as string;
  const rhsNum = rhsText.trim() !== '' && !Number.isNaN(Number(rhsText)) ? Number(rhsText) : null;
  return (v) => {
    if (rhsNum !== null) {
      if (typeof v !== 'number') return op === '<>';
      const c = v < rhsNum ? -1 : v > rhsNum ? 1 : 0;
      return { '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op] as boolean;
    }
    if (op === '=' || op === '<>') {
      const pattern = new RegExp(`^${rhsText.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
      const hit = v !== null && pattern.test(toText(v));
      return op === '=' ? (rhsText === '' ? v === null || v === '' : hit) : !hit;
    }
    const c = compare(v, rhsText);
    return { '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op] as boolean;
  };
}

export class Workbook {
  private sheets = new Map<string, SheetData>();
  private cache = new Map<string, CellValue>();
  private visiting = new Set<string>();
  private parsed = new Map<string, Node>();

  addSheet(name: string): SheetData {
    const data: SheetData = new Map();
    this.sheets.set(name, data);
    return data;
  }

  sheet(name: string): SheetData {
    const s = this.sheets.get(name);
    if (!s) throw new FormulaError('#REF!');
    return s;
  }

  set(sheet: string, address: string, input: CellInput): void {
    this.sheet(sheet).set(address, input);
    this.cache.clear();
  }

  /** Valor (já calculado) de uma célula. */
  get(sheet: string, address: string): CellValue {
    const key = `${sheet}!${address}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const cell = this.sheet(sheet).get(address);
    if (!cell) return null;
    if (cell.formula === undefined) return cell.value ?? null;
    if (this.visiting.has(key)) throw new FormulaError('#CIRC!');
    this.visiting.add(key);
    try {
      let node = this.parsed.get(key);
      if (!node) {
        node = new Parser(tokenize(cell.formula)).parse();
        this.parsed.set(key, node);
      }
      const v = this.evalNode(node, sheet);
      const scalar = isRange(v) ? (v[0] ?? null) : v;
      this.cache.set(key, scalar);
      return scalar;
    } finally {
      this.visiting.delete(key);
    }
  }

  private evalNode(n: Node, sheet: string): Evaluated {
    switch (n.t) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'ref': return this.get(n.sheet ?? sheet, addr(n.col, n.row));
      case 'range': {
        const s = n.sheet ?? sheet;
        const out: CellValue[] = [];
        for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) out.push(this.get(s, addr(c, r)));
        return out;
      }
      case 'un': {
        const v = this.scalar(n.a, sheet);
        return n.op === '-' ? -toNumber(v) : toNumber(v);
      }
      case 'pct': return toNumber(this.scalar(n.a, sheet)) / 100;
      case 'bin': return this.binary(n.op, this.scalar(n.a, sheet), this.scalar(n.b, sheet));
      case 'fn': return this.call(n.name, n.args, sheet);
    }
  }

  private scalar(n: Node, sheet: string): CellValue {
    const v = this.evalNode(n, sheet);
    return isRange(v) ? (v[0] ?? null) : v;
  }

  private binary(op: string, a: CellValue, b: CellValue): CellValue {
    switch (op) {
      case '+': return toNumber(a) + toNumber(b);
      case '-': return toNumber(a) - toNumber(b);
      case '*': return toNumber(a) * toNumber(b);
      case '/': {
        const d = toNumber(b);
        if (d === 0) throw new FormulaError('#DIV/0!');
        return toNumber(a) / d;
      }
      case '^': return toNumber(a) ** toNumber(b);
      case '&': return toText(a) + toText(b);
      case '=': return compare(a, b) === 0;
      case '<>': return compare(a, b) !== 0;
      case '<': return compare(a, b) < 0;
      case '>': return compare(a, b) > 0;
      case '<=': return compare(a, b) <= 0;
      case '>=': return compare(a, b) >= 0;
    }
    throw new FormulaError('#NAME?');
  }

  private numbersOf(args: Node[], sheet: string): number[] {
    const out: number[] = [];
    for (const a of args) {
      const v = this.evalNode(a, sheet);
      if (isRange(v)) {
        for (const x of v) if (typeof x === 'number') out.push(x);
      } else out.push(toNumber(v));
    }
    return out;
  }

  private call(name: string, args: Node[], sheet: string): Evaluated {
    const arg = (i: number) => this.scalar(args[i] as Node, sheet);
    const need = (min: number, max = min) => {
      if (args.length < min || args.length > max) throw new FormulaError('#VALUE!');
    };
    switch (name) {
      case 'SUM': return this.numbersOf(args, sheet).reduce((a, b) => a + b, 0);
      case 'AVERAGE': {
        const n = this.numbersOf(args, sheet);
        if (n.length === 0) throw new FormulaError('#DIV/0!');
        return n.reduce((a, b) => a + b, 0) / n.length;
      }
      case 'MAX': return Math.max(0, ...this.numbersOf(args, sheet));
      case 'MIN': {
        const n = this.numbersOf(args, sheet);
        return n.length ? Math.min(...n) : 0;
      }
      case 'ABS': need(1); return Math.abs(toNumber(arg(0)));
      case 'INT': need(1); return Math.floor(toNumber(arg(0)));
      case 'ROUND': {
        need(2);
        const f = 10 ** toNumber(arg(1));
        const x = toNumber(arg(0));
        return (Math.sign(x) * Math.round(Number((Math.abs(x) * f).toPrecision(15)))) / f;
      }
      case 'IF': {
        need(2, 3);
        const cond = arg(0);
        const truthy = typeof cond === 'boolean' ? cond : toNumber(cond) !== 0;
        return truthy ? arg(1) : args.length === 3 ? arg(2) : false;
      }
      case 'IFERROR': {
        need(2);
        try {
          return arg(0);
        } catch (e) {
          if (e instanceof FormulaError) return arg(1);
          throw e;
        }
      }
      case 'AND': return args.every((_, i) => toNumber(arg(i)) !== 0);
      case 'OR': return args.some((_, i) => toNumber(arg(i)) !== 0);
      case 'ISBLANK': need(1); return arg(0) === null;
      case 'COUNTA': return args.reduce((n, a) => {
        const v = this.evalNode(a, sheet);
        return n + (isRange(v) ? v.filter((x) => x !== null && x !== '').length : v === null ? 0 : 1);
      }, 0);
      case 'COUNTIF': case 'SUMIF': {
        need(2, 3);
        const range = this.evalNode(args[0] as Node, sheet);
        const match = criterionMatcher(arg(1));
        const sums = args.length === 3 ? this.evalNode(args[2] as Node, sheet) : range;
        if (!isRange(range) || !isRange(sums)) throw new FormulaError('#VALUE!');
        let total = 0;
        range.forEach((v, i) => {
          if (!match(v)) return;
          if (name === 'COUNTIF') total += 1;
          else {
            const s = sums[i];
            if (typeof s === 'number') total += s;
          }
        });
        return total;
      }
      case 'PMT': {
        need(3, 5);
        const rate = toNumber(arg(0));
        const nper = toNumber(arg(1));
        const pv = toNumber(arg(2));
        const fv = args.length >= 4 ? toNumber(arg(3)) : 0;
        if (rate === 0) return -(pv + fv) / nper;
        return -((rate * (pv * (1 + rate) ** nper + fv)) / ((1 + rate) ** nper - 1));
      }
      case 'DATE': {
        need(3);
        const [y, m, d] = [toNumber(arg(0)), toNumber(arg(1)), toNumber(arg(2))];
        return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86_400_000);
      }
      case 'YEAR': need(1); return serialToDate(toNumber(arg(0))).year;
      case 'MONTH': need(1); return serialToDate(toNumber(arg(0))).month;
      case 'DAY': need(1); return serialToDate(toNumber(arg(0))).day;
      case 'EDATE': {
        need(2);
        const { year, month, day } = serialToDate(toNumber(arg(0)));
        const total = year * 12 + (month - 1) + toNumber(arg(1));
        const y = Math.floor(total / 12);
        const m = (((total % 12) + 12) % 12) + 1;
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return dateToSerial(y, m, Math.min(day, last));
      }
    }
    throw new FormulaError('#NAME?');
  }
}

/** Calcula uma fórmula isolada (sem planilha), útil em testes. */
export function evaluateFormula(formula: string, cells: Record<string, CellValue> = {}): CellValue {
  const wb = new Workbook();
  wb.addSheet('S');
  for (const [a, v] of Object.entries(cells)) wb.set('S', a, { value: v });
  wb.set('S', 'ZZ1', { formula: formula.replace(/^=/, '') });
  return wb.get('S', 'ZZ1');
}
