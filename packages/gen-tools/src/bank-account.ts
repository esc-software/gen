import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export type BankId = 'bb' | 'bradesco' | 'itau' | 'other';

const sum = (digits: string, weights: readonly number[]): number => [...digits].reduce((acc, d, i) => acc + Number(d) * (weights[i] as number), 0);
const digitsOnly = (s: string) => /^\d+$/.test(s);

/** Dígito do Banco do Brasil e do Bradesco (agência): 11 menos o resto; 10 vira a letra do banco e 11 vira 0. */
function mod11Letter(digits: string, weights: readonly number[], letter: 'X' | 'P'): string {
  const dv = 11 - (sum(digits, weights) % 11);
  return dv === 10 ? letter : dv === 11 ? '0' : String(dv);
}

/** Dígito da agência do Banco do Brasil (4 dígitos, pesos 5-4-3-2). */
export const bbAgencyDigit = (agency: string): string => mod11Letter(agency, [5, 4, 3, 2], 'X');
/** Dígito da conta do Banco do Brasil (até 8 dígitos, completados com zeros à esquerda; pesos 9 a 2). */
export const bbAccountDigit = (account: string): string => mod11Letter(account.padStart(8, '0'), [9, 8, 7, 6, 5, 4, 3, 2], 'X');
/** Dígito da agência do Bradesco (4 dígitos, pesos 5-4-3-2; 10 vira P). */
export const bradescoAgencyDigit = (agency: string): string => mod11Letter(agency, [5, 4, 3, 2], 'P');
/** Dígito da conta do Bradesco (até 7 dígitos; pesos 2-7-6-5-4-3-2; resto 0 dá 0 e resto 1 dá P). */
export function bradescoAccountDigit(account: string): string {
  const rest = sum(account.padStart(7, '0'), [2, 7, 6, 5, 4, 3, 2]) % 11;
  return rest === 0 ? '0' : rest === 1 ? 'P' : String(11 - rest);
}
/** Dígito da conta do Itaú: módulo 10 sobre agência (4) e conta (5), pesos 2-1 alternados, somando os algarismos dos produtos. */
export function itauAccountDigit(agency: string, account: string): string {
  const total = [...(agency + account.padStart(5, '0'))].reduce((acc, d, i) => {
    const p = Number(d) * (i % 2 === 0 ? 2 : 1);
    return acc + (p > 9 ? p - 9 : p);
  }, 0);
  return String((10 - (total % 10)) % 10);
}

interface Parsed {
  body: string;
  digit?: string;
}

/**
 * Separa o número do dígito. Com hífen, o dígito é o que vem depois dele. Sem hífen, só se considera dígito
 * quando o texto tem exatamente um caractere a mais que o tamanho máximo do número.
 */
function split(raw: string, maxBody: number, what: string): Parsed {
  const text = raw.toUpperCase().replace(/[\s.]/g, '');
  if (text === '') throw new ToolError(`Informe a ${what}`);
  const dash = text.lastIndexOf('-');
  if (dash >= 0) {
    const body = text.slice(0, dash);
    const digit = text.slice(dash + 1);
    if (!digitsOnly(body) || body.length === 0) throw new ToolError(`A ${what} deve ter só números antes do hífen`);
    if (!/^[0-9XP]$/.test(digit)) throw new ToolError(`O dígito da ${what} deve ser um número ou X/P`);
    return { body, digit };
  }
  if (digitsOnly(text)) {
    if (text.length === maxBody + 1) return { body: text.slice(0, maxBody), digit: text.slice(maxBody) };
    return { body: text };
  }
  if (text.length === maxBody + 1 && digitsOnly(text.slice(0, -1)) && /^[XP]$/.test(text.slice(-1))) return { body: text.slice(0, -1), digit: text.slice(-1) };
  throw new ToolError(`A ${what} deve ter só números (e, no máximo, X ou P no dígito)`);
}

export interface AccountCheck {
  valid: boolean;
  message: string;
  bank: string;
  agency: string;
  account: string;
  expectedAgencyDigit?: string;
  expectedAccountDigit?: string;
  checked: boolean;
}

const BANK_NAMES: Record<BankId, string> = { bb: '001 Banco do Brasil', bradesco: '237 Bradesco', itau: '341 Itaú', other: 'Outro banco' };

export function checkAccount(bank: BankId, agencyRaw: string, accountRaw: string): AccountCheck {
  if (bank === 'other') {
    const a = agencyRaw.replace(/\D/g, '');
    const c = accountRaw.replace(/\D/g, '');
    const okAgency = a.length >= 3 && a.length <= 5;
    const okAccount = c.length >= 3 && c.length <= 13;
    return {
      valid: okAgency && okAccount,
      message: okAgency && okAccount ? 'Formato plausível. Para este banco não há regra pública de dígito verificador que a ferramenta possa conferir.' : 'A agência deve ter de 3 a 5 dígitos e a conta de 3 a 13 (com o dígito).',
      bank: BANK_NAMES.other,
      agency: a,
      account: c,
      checked: false,
    };
  }

  const agencyLen = 4;
  const accountMax = bank === 'bb' ? 8 : bank === 'bradesco' ? 7 : 5;
  const agency = split(agencyRaw, agencyLen, 'agência');
  const account = split(accountRaw, accountMax, 'conta');
  if (agency.body.length !== agencyLen) throw new ToolError('A agência deve ter 4 dígitos');
  if (account.body.length > accountMax) throw new ToolError(`A conta deste banco tem até ${accountMax} dígitos, fora o dígito verificador`);
  if (bank === 'itau' && agency.digit !== undefined) throw new ToolError('A agência do Itaú não tem dígito verificador');

  const expectedAgency = bank === 'bb' ? bbAgencyDigit(agency.body) : bank === 'bradesco' ? bradescoAgencyDigit(agency.body) : undefined;
  const expectedAccount = bank === 'bb' ? bbAccountDigit(account.body) : bank === 'bradesco' ? bradescoAccountDigit(account.body) : itauAccountDigit(agency.body, account.body);

  const problems: string[] = [];
  if (agency.digit !== undefined && expectedAgency !== undefined && agency.digit !== expectedAgency) problems.push(`o dígito da agência deveria ser ${expectedAgency}`);
  if (account.digit === undefined) problems.push(`faltou o dígito da conta (o calculado é ${expectedAccount})`);
  else if (account.digit !== expectedAccount) problems.push(`o dígito da conta deveria ser ${expectedAccount}`);

  const accountText = account.body.padStart(accountMax, '0');
  return {
    valid: problems.length === 0,
    message: problems.length === 0 ? 'Os dígitos verificadores conferem com a regra do banco' : `Não confere: ${problems.join('; ')}`,
    bank: BANK_NAMES[bank],
    agency: expectedAgency !== undefined ? `${agency.body}-${expectedAgency}` : agency.body,
    account: `${accountText}-${expectedAccount}`,
    ...(expectedAgency !== undefined ? { expectedAgencyDigit: expectedAgency } : {}),
    expectedAccountDigit: expectedAccount,
    checked: true,
  };
}

export const bankAccountTool = defineTool({
  id: 'conta-bancaria',
  name: 'Validador de Conta Bancária (Dígito Verificador)',
  description: 'Confere o dígito verificador da agência e da conta do Banco do Brasil, Bradesco e Itaú e calcula o dígito que falta',
  category: 'validadores',
  keywords: ['validar conta bancária', 'dígito verificador da conta', 'calcular dígito da conta', 'agência e conta', 'conta corrente', 'dígito da conta banco do brasil', 'dígito da conta bradesco', 'dígito da conta itaú'],
  icon: '🏦',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    bank: z.enum(['bb', 'bradesco', 'itau', 'other']).default('bb'),
    agency: z.string().max(20).default(''),
    account: z.string().max(24).default(''),
  }),
  outputSchema: z.object({
    valid: z.boolean(), message: z.string(), bank: z.string(), agency: z.string().optional(), account: z.string().optional(),
    expectedAgencyDigit: z.string().optional(), expectedAccountDigit: z.string().optional(), note: z.string(),
  }),
  execute: ({ bank, agency, account }) => {
    const r = checkAccount(bank, agency, account);
    return {
      valid: r.valid,
      message: r.message,
      bank: r.bank,
      agency: r.agency,
      account: r.account,
      ...(r.expectedAgencyDigit !== undefined ? { expectedAgencyDigit: r.expectedAgencyDigit } : {}),
      ...(r.expectedAccountDigit !== undefined ? { expectedAccountDigit: r.expectedAccountDigit } : {}),
      note: 'Confere só a forma (o dígito), não se a conta existe, está ativa ou é de quem você espera. Cada banco calcula o dígito do seu jeito e pode ter exceções em contas antigas ou de tipos especiais: em caso de dúvida, vale o que o banco informa.',
    };
  },
  fields: {
    bank: { label: 'Banco', optionLabels: { bb: '001 Banco do Brasil', bradesco: '237 Bradesco', itau: '341 Itaú', other: 'Outro banco (só confere o formato)' } },
    agency: { label: 'Agência', placeholder: '1584-9', help: 'Com ou sem o dígito. O Itaú não tem dígito na agência.' },
    account: { label: 'Conta com dígito', placeholder: '00210169-6', help: 'Use o hífen antes do dígito. Sem o dígito, a ferramenta calcula qual é.' },
  },
  outputLabels: {
    valid: 'Dígito confere', message: 'Resultado', bank: 'Banco', agency: 'Agência', account: 'Conta', expectedAgencyDigit: 'Dígito da agência', expectedAccountDigit: 'Dígito da conta', note: 'Observação',
  },
  examples: [
    { description: 'Banco do Brasil', input: { bank: 'bb', agency: '1584-9', account: '00210169-6' }, output: { valid: true, expectedAccountDigit: '6' } },
    { description: 'Itaú', input: { bank: 'itau', agency: '2545', account: '02366-1' }, output: { valid: true } },
  ],
  documentation:
    'Banco do Brasil: o dígito da agência (4 números, pesos 5-4-3-2) e o da conta (até 8 números, pesos 9 a 2) são 11 menos o resto da divisão da soma por 11; resto que dá 10 vira X e 11 vira 0. Bradesco: agência com os mesmos pesos (10 vira P); conta de até 7 números com pesos 2-7-6-5-4-3-2, em que resto 0 dá 0, resto 1 dá P e os demais dão 11 menos o resto. Itaú: módulo 10 sobre a agência e a conta juntas (9 números), com pesos 2 e 1 alternados, somando os algarismos dos produtos maiores que 9. As regras seguem a descrição pública de cada banco; não há padrão nacional e os bancos podem ter exceções. A ferramenta nunca consulta o banco.',
});
