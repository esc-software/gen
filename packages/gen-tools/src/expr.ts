import { ToolError } from '@esc/gen-core';

/**
 * Avaliador de expressões matemáticas por descida recursiva. Não usa `eval` nem `Function`:
 * só reconhece números, operadores, parênteses, constantes e funções de uma lista fixa.
 */

export type AngleMode = 'radians' | 'degrees';

export interface EvalOptions {
  angle: AngleMode;
  /** Habilita funções e constantes científicas. */
  scientific: boolean;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string };

const MAX_LENGTH = 500;
const MAX_DEPTH = 100;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const text = input;
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    if (/\s/.test(c)) {
      i++; // espaços separam símbolos: "1 2" são dois números, não doze
    } else if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9.,]/.test(text[j] as string)) j++;
      // Aceita vírgula como separador decimal (padrão brasileiro).
      const raw = text.slice(i, j).replace(',', '.');
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) throw new ToolError(`Número inválido: "${text.slice(i, j)}"`);
      let value = Number(raw);
      // Notação científica, como 1e3.
      const exp = /^[eE][+-]?\d+/.exec(text.slice(j));
      if (exp) {
        value = Number(raw + exp[0]);
        j += exp[0].length;
      }
      tokens.push({ type: 'num', value });
      i = j;
    } else if (/[A-Za-zπ√]/.test(c)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9π√_]/.test(text[j] as string)) j++;
      tokens.push({ type: 'id', value: text.slice(i, j).toLowerCase() });
      i = j;
    } else if ('+-*/^%()!×÷'.includes(c)) {
      tokens.push({ type: 'op', value: c === '×' ? '*' : c === '÷' ? '/' : c });
      i++;
    } else {
      throw new ToolError(`Caractere não permitido: "${c}"`);
    }
  }
  return tokens;
}

const FUNCTIONS: Record<string, { arity: 1; fn: (x: number, o: EvalOptions) => number }> = {
  sin: { arity: 1, fn: (x, o) => Math.sin(o.angle === 'degrees' ? (x * Math.PI) / 180 : x) },
  cos: { arity: 1, fn: (x, o) => Math.cos(o.angle === 'degrees' ? (x * Math.PI) / 180 : x) },
  tan: { arity: 1, fn: (x, o) => Math.tan(o.angle === 'degrees' ? (x * Math.PI) / 180 : x) },
  asin: { arity: 1, fn: (x, o) => (o.angle === 'degrees' ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)) },
  acos: { arity: 1, fn: (x, o) => (o.angle === 'degrees' ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)) },
  atan: { arity: 1, fn: (x, o) => (o.angle === 'degrees' ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)) },
  sqrt: { arity: 1, fn: (x) => Math.sqrt(x) },
  raiz: { arity: 1, fn: (x) => Math.sqrt(x) },
  cbrt: { arity: 1, fn: (x) => Math.cbrt(x) },
  ln: { arity: 1, fn: (x) => Math.log(x) },
  log: { arity: 1, fn: (x) => Math.log10(x) },
  log2: { arity: 1, fn: (x) => Math.log2(x) },
  exp: { arity: 1, fn: (x) => Math.exp(x) },
  abs: { arity: 1, fn: (x) => Math.abs(x) },
  floor: { arity: 1, fn: (x) => Math.floor(x) },
  ceil: { arity: 1, fn: (x) => Math.ceil(x) },
  round: { arity: 1, fn: (x) => Math.round(x) },
  fat: { arity: 1, fn: (x) => factorial(x) },
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new ToolError('O fatorial só existe para inteiros não negativos');
  if (n > 170) throw new ToolError('Fatorial grande demais (o máximo é 170!)');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly options: EvalOptions
  ) {}

  parse(): number {
    if (this.tokens.length === 0) throw new ToolError('Digite uma expressão');
    const value = this.expression();
    if (this.pos < this.tokens.length) throw new ToolError(`Expressão inválida perto de "${this.describe(this.tokens[this.pos] as Token)}"`);
    return value;
  }

  private describe(t: Token): string {
    return String(t.value);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t?.type === 'op' && t.value === value;
  }

  // expressão := termo (("+" | "-") termo)*
  private expression(): number {
    let left = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as Token).value;
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  // termo := potência (("*" | "/" | "%") potência)* — "%" é o resto da divisão
  private term(): number {
    let left = this.power();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.tokens[this.pos++] as Token).value;
      const right = this.power();
      if (op === '*') left *= right;
      else if (right === 0) throw new ToolError('Divisão por zero');
      else left = op === '/' ? left / right : left % right;
    }
    return left;
  }

  // potência := ("-" | "+")* pós-fixo ("^" potência)?  — associativa à direita; -2^2 = -4
  private power(): number {
    if (this.isOp('-')) {
      this.pos++;
      return -this.power();
    }
    if (this.isOp('+')) {
      this.pos++;
      return this.power();
    }
    const base = this.postfix();
    if (this.isOp('^')) {
      this.pos++;
      return base ** this.power();
    }
    return base;
  }

  // pós-fixo := primário "!"*
  private postfix(): number {
    let value = this.primary();
    while (this.isOp('!')) {
      if (!this.options.scientific) throw new ToolError('Fatorial só está disponível na calculadora científica');
      this.pos++;
      value = factorial(value);
    }
    return value;
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new ToolError('A expressão terminou antes do esperado');
    if (t.type === 'num') {
      this.pos++;
      return t.value;
    }
    if (t.type === 'op' && t.value === '(') {
      if (++this.depth > MAX_DEPTH) throw new ToolError('Parênteses aninhados demais');
      this.pos++;
      const value = this.expression();
      if (!this.isOp(')')) throw new ToolError('Falta fechar um parêntese');
      this.pos++;
      this.depth--;
      return value;
    }
    if (t.type === 'id') {
      if (!this.options.scientific) throw new ToolError(`"${t.value}" só está disponível na calculadora científica`);
      this.pos++;
      if (t.value in CONSTANTS) return CONSTANTS[t.value] as number;
      const def = FUNCTIONS[t.value === '√' ? 'sqrt' : t.value];
      if (!def) throw new ToolError(`Função ou constante desconhecida: "${t.value}"`);
      if (!this.isOp('(')) throw new ToolError(`Use parênteses após "${t.value}", como ${t.value}(2)`);
      this.pos++;
      if (++this.depth > MAX_DEPTH) throw new ToolError('Parênteses aninhados demais');
      const arg = this.expression();
      if (!this.isOp(')')) throw new ToolError('Falta fechar um parêntese');
      this.pos++;
      this.depth--;
      return def.fn(arg, this.options);
    }
    throw new ToolError(`Expressão inválida perto de "${this.describe(t)}"`);
  }
}

export function evaluate(expression: string, options: EvalOptions): number {
  if (expression.length > MAX_LENGTH) throw new ToolError(`Expressão longa demais (máximo ${MAX_LENGTH} caracteres)`);
  const value = new Parser(tokenize(expression), options).parse();
  if (Number.isNaN(value)) throw new ToolError('Resultado indefinido (por exemplo, raiz de número negativo)');
  if (!Number.isFinite(value)) throw new ToolError('Resultado grande demais');
  return value;
}

/** Remove ruído de ponto flutuante (0,1 + 0,2) mantendo até 12 algarismos significativos. */
export function tidy(n: number): number {
  return Number(n.toPrecision(12));
}
