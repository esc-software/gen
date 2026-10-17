import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { secureRandomString } from '@esc/gen-utils';

// ---------- CNH ----------

/** Dígitos verificadores da CNH a partir dos 9 primeiros dígitos. */
export function calculateCNHCheckDigits(base: string): { first: number; second: number } {
  if (!/^\d{9}$/.test(base)) throw new RangeError('A base da CNH deve ter exatamente 9 dígitos');
  const digits = [...base].map(Number);
  let sum = digits.reduce((acc, d, i) => acc + d * (9 - i), 0);
  let first = sum % 11;
  let discount = 0;
  if (first >= 10) {
    first = 0;
    discount = 2;
  }
  sum = digits.reduce((acc, d, i) => acc + d * (i + 1), 0);
  const x = sum % 11;
  let second = x >= discount ? x - discount : x + 11 - discount;
  if (second >= 10) second = 0;
  return { first, second };
}

export interface DocumentValidation {
  valid: boolean;
  message: string;
  /** Somente dígitos, quando o formato é reconhecido. */
  digits?: string;
}

export function validateCNH(input: string): DocumentValidation {
  const digits = input.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, message: 'A CNH deve conter apenas números' };
  if (digits.length !== 11) return { valid: false, message: 'A CNH deve ter 11 dígitos' };
  if (/^(\d)\1{10}$/.test(digits)) return { valid: false, message: 'CNH inválida: todos os dígitos são iguais' };
  const { first, second } = calculateCNHCheckDigits(digits.slice(0, 9));
  if (Number(digits[9]) === first && Number(digits[10]) === second) {
    return { valid: true, message: 'CNH válida (formato e dígitos verificadores)', digits };
  }
  return { valid: false, message: 'CNH inválida: dígitos verificadores incorretos' };
}

export function generateCNH(): string {
  let base: string;
  do {
    base = secureRandomString('0123456789', 9);
  } while (/^(\d)\1{8}$/.test(base));
  const { first, second } = calculateCNHCheckDigits(base);
  return `${base}${first}${second}`;
}

// ---------- PIS/PASEP ----------

const PIS_WEIGHTS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function calculatePISCheckDigit(base: string): number {
  if (!/^\d{10}$/.test(base)) throw new RangeError('A base do PIS/PASEP deve ter exatamente 10 dígitos');
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * (PIS_WEIGHTS[i] as number), 0);
  const result = 11 - (sum % 11);
  return result >= 10 ? 0 : result;
}

export function formatPIS(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 8)}.${digits.slice(8, 10)}-${digits.slice(10, 11)}`;
}

export function validatePIS(input: string): DocumentValidation {
  const digits = input.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, message: 'O PIS/PASEP deve conter apenas números' };
  if (digits.length !== 11) return { valid: false, message: 'O PIS/PASEP deve ter 11 dígitos' };
  if (/^(\d)\1{10}$/.test(digits)) {
    return { valid: false, message: 'PIS/PASEP inválido: todos os dígitos são iguais' };
  }
  if (Number(digits[10]) !== calculatePISCheckDigit(digits.slice(0, 10))) {
    return { valid: false, message: 'PIS/PASEP inválido: dígito verificador incorreto' };
  }
  return { valid: true, message: 'PIS/PASEP válido (formato e dígito verificador)', digits };
}

export function generatePIS(): string {
  let base: string;
  do {
    base = secureRandomString('0123456789', 10);
  } while (/^(\d)\1{9}$/.test(base));
  return `${base}${calculatePISCheckDigit(base)}`;
}

// ---------- ferramentas ----------

const actionHint = {
  label: 'Ação',
  optionLabels: { generate: 'Gerar', validate: 'Validar' },
};

export const cnhTool = defineTool({
  id: 'cnh',
  name: 'Gerador e Validador de CNH',
  description: 'Gera números de CNH sintéticos para testes e valida os dígitos verificadores',
  category: 'validadores',
  keywords: ['cnh', 'carteira de habilitação', 'motorista', 'validar', 'gerar', 'documento'],
  icon: '🚗',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      action: z.enum(['generate', 'validate']).default('generate'),
      cnh: z.string().max(32).optional(),
    })
    .refine((v) => v.action === 'generate' || (v.cnh ?? '').trim() !== '', {
      path: ['cnh'],
      message: 'Informe a CNH',
    }),
  outputSchema: z.object({ cnh: z.string(), valid: z.boolean(), message: z.string() }),
  execute: ({ action, cnh }) => {
    if (action === 'generate') {
      return { cnh: generateCNH(), valid: true, message: 'CNH sintética gerada. Não pertence a uma pessoa real.' };
    }
    const raw = (cnh ?? '').trim();
    const result = validateCNH(raw);
    return { cnh: result.digits ?? raw, valid: result.valid, message: result.message };
  },
  fields: { action: actionHint, cnh: { label: 'CNH', placeholder: '02650306461' } },
  outputLabels: { cnh: 'CNH', valid: 'Válida', message: 'Mensagem' },
  examples: [
    {
      description: 'CNH válida',
      input: { action: 'validate', cnh: '02650306461' },
      output: { cnh: '02650306461', valid: true, message: 'CNH válida (formato e dígitos verificadores)' },
    },
    {
      description: 'Dígito incorreto',
      input: { action: 'validate', cnh: '02650306462' },
      output: { cnh: '02650306462', valid: false, message: 'CNH inválida: dígitos verificadores incorretos' },
    },
  ],
  documentation:
    'Valida o número de registro da CNH pelos dois dígitos verificadores (módulo 11) e gera números sintéticos para testes. Não consulta o Detran/Senatran: um número válido aqui não prova que existe uma habilitação com ele.',
});

export const pisTool = defineTool({
  id: 'pis-pasep',
  name: 'Gerador e Validador de PIS/PASEP',
  description: 'Gera números de PIS/PASEP sintéticos para testes e valida o dígito verificador',
  category: 'validadores',
  keywords: ['pis', 'pasep', 'nis', 'nit', 'validar', 'gerar', 'documento'],
  icon: '🧾',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      action: z.enum(['generate', 'validate']).default('generate'),
      pis: z.string().max(32).optional(),
    })
    .refine((v) => v.action === 'generate' || (v.pis ?? '').trim() !== '', {
      path: ['pis'],
      message: 'Informe o PIS/PASEP',
    }),
  outputSchema: z.object({ pis: z.string(), valid: z.boolean(), message: z.string() }),
  execute: ({ action, pis }) => {
    if (action === 'generate') {
      return {
        pis: formatPIS(generatePIS()),
        valid: true,
        message: 'PIS/PASEP sintético gerado. Não pertence a uma pessoa real.',
      };
    }
    const raw = (pis ?? '').trim();
    const result = validatePIS(raw);
    return { pis: result.digits ? formatPIS(result.digits) : raw, valid: result.valid, message: result.message };
  },
  fields: { action: actionHint, pis: { label: 'PIS/PASEP', placeholder: '123.45678.91-9' } },
  outputLabels: { pis: 'PIS/PASEP', valid: 'Válido', message: 'Mensagem' },
  examples: [
    {
      description: 'PIS válido',
      input: { action: 'validate', pis: '123.45678.91-9' },
      output: { pis: '123.45678.91-9', valid: true, message: 'PIS/PASEP válido (formato e dígito verificador)' },
    },
    {
      description: 'Dígito incorreto',
      input: { action: 'validate', pis: '12345678910' },
      output: { pis: '12345678910', valid: false, message: 'PIS/PASEP inválido: dígito verificador incorreto' },
    },
  ],
  documentation:
    'O PIS/PASEP (também usado como NIS e NIT) tem 11 dígitos, sendo o último verificador (módulo 11). A ferramenta valida apenas a sintaxe e gera números sintéticos; não confirma que o número foi emitido para alguém.',
});
