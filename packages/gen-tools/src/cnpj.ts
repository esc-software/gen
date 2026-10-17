import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { secureRandomInt, secureRandomString } from '@esc/gen-utils';

const WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_SECOND = [6, ...WEIGHTS_FIRST];
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Valor de um caractere do CNPJ: código ASCII menos 48 ("0" = 0, "A" = 17). */
const charValue = (c: string) => c.charCodeAt(0) - 48;

function checkDigit(chars: string, weights: number[]): number {
  const sum = [...chars].reduce((acc, c, i) => acc + charValue(c) * (weights[i] as number), 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Dígitos verificadores de uma base de 12 caracteres (numéricos ou, a partir de 2026, alfanuméricos). */
export function calculateCNPJCheckDigits(base: string): { first: number; second: number } {
  if (!/^[0-9A-Z]{12}$/.test(base)) {
    throw new RangeError('A base do CNPJ deve ter 12 caracteres (dígitos ou letras maiúsculas)');
  }
  const first = checkDigit(base, WEIGHTS_FIRST);
  const second = checkDigit(base + first, WEIGHTS_SECOND);
  return { first, second };
}

export function formatCNPJ(value: string): string {
  return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12, 14)}`;
}

/** Gera um CNPJ sintético (matriz, filial 0001) com dígitos verificadores corretos. */
export function generateCNPJ(alphanumeric = false): string {
  const alphabet = alphanumeric ? ALPHANUMERIC : '0123456789';
  let root: string;
  do {
    root = secureRandomString(alphabet, 8);
  } while (/^(.)\1{7}$/.test(root));
  // Em CNPJs alfanuméricos, garante ao menos uma letra para que o exemplo seja realmente alfanumérico.
  if (alphanumeric && !/[A-Z]/.test(root)) {
    const letters = ALPHANUMERIC.slice(10);
    const at = secureRandomInt(8);
    root = root.slice(0, at) + letters[secureRandomInt(letters.length)] + root.slice(at + 1);
  }
  const base = `${root}0001`;
  const { first, second } = calculateCNPJCheckDigits(base);
  return `${base}${first}${second}`;
}

export interface CNPJValidation {
  valid: boolean;
  message: string;
  /** Valor sem máscara, em maiúsculas, quando o formato é reconhecido. */
  normalized?: string;
}

/** Validação sintática (tamanho, caracteres e dígitos verificadores). Não consulta a Receita Federal. */
export function validateCNPJ(input: string): CNPJValidation {
  const value = input.replace(/[.\-/\s]/g, '').toUpperCase();
  if (!/^[0-9A-Z]+$/.test(value)) {
    return { valid: false, message: 'O CNPJ deve conter apenas letras, números, pontos, barra e hífen' };
  }
  if (value.length !== 14) return { valid: false, message: 'O CNPJ deve ter 14 caracteres' };
  if (!/^[0-9A-Z]{12}\d{2}$/.test(value)) {
    return { valid: false, message: 'Os dois últimos caracteres (dígitos verificadores) devem ser números' };
  }
  if (/^(\d)\1{13}$/.test(value)) {
    return { valid: false, message: 'CNPJ inválido: todos os dígitos são iguais' };
  }
  const { first, second } = calculateCNPJCheckDigits(value.slice(0, 12));
  const firstOk = Number(value[12]) === first;
  const secondOk = Number(value[13]) === second;
  if (firstOk && secondOk) {
    return { valid: true, message: 'CNPJ válido (formato e dígitos verificadores)', normalized: value };
  }
  if (!firstOk && !secondOk) return { valid: false, message: 'CNPJ inválido: dígitos verificadores incorretos' };
  return {
    valid: false,
    message: `CNPJ inválido: ${firstOk ? 'segundo' : 'primeiro'} dígito verificador incorreto`,
  };
}

export const cnpjTool = defineTool({
  id: 'cnpj',
  name: 'Gerador e Validador de CNPJ',
  description: 'Gera CNPJs sintéticos para testes e valida CNPJs, inclusive o novo formato alfanumérico',
  category: 'geradores',
  keywords: ['cnpj', 'validar', 'gerar', 'empresa', 'documento', 'alfanumérico'],
  icon: '🏢',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      action: z.enum(['generate', 'validate', 'format']).default('generate'),
      cnpj: z.string().max(32).optional(),
      alphanumeric: z.boolean().default(false),
    })
    .refine((v) => v.action === 'generate' || (v.cnpj ?? '').trim() !== '', {
      path: ['cnpj'],
      message: 'Informe o CNPJ',
    }),
  outputSchema: z.object({ cnpj: z.string(), valid: z.boolean(), message: z.string() }),
  execute: ({ action, cnpj, alphanumeric }) => {
    if (action === 'generate') {
      return {
        cnpj: formatCNPJ(generateCNPJ(alphanumeric)),
        valid: true,
        message: 'CNPJ sintético gerado. Não pertence a uma empresa real.',
      };
    }
    const raw = (cnpj ?? '').trim();
    const result = validateCNPJ(raw);
    const { normalized } = result;
    const canFormat = normalized !== undefined && (result.valid || action === 'format');
    return {
      cnpj: canFormat ? formatCNPJ(normalized) : raw,
      valid: result.valid,
      message: result.message,
    };
  },
  fields: {
    action: {
      label: 'Ação',
      optionLabels: { generate: 'Gerar', validate: 'Validar', format: 'Formatar' },
    },
    cnpj: { label: 'CNPJ', placeholder: '11.222.333/0001-81', help: 'Usado em Validar e Formatar.' },
    alphanumeric: { label: 'Gerar no formato alfanumérico (a partir de 2026)' },
  },
  outputLabels: { cnpj: 'CNPJ', valid: 'Válido', message: 'Mensagem' },
  examples: [
    {
      description: 'CNPJ válido',
      input: { action: 'validate', cnpj: '11.222.333/0001-81' },
      output: { cnpj: '11.222.333/0001-81', valid: true, message: 'CNPJ válido (formato e dígitos verificadores)' },
    },
    {
      description: 'CNPJ alfanumérico válido',
      input: { action: 'validate', cnpj: '12.ABC.345/01DE-35' },
      output: { cnpj: '12.ABC.345/01DE-35', valid: true, message: 'CNPJ válido (formato e dígitos verificadores)' },
    },
    {
      description: 'Dígitos repetidos',
      input: { action: 'validate', cnpj: '00000000000000' },
      output: { cnpj: '00000000000000', valid: false, message: 'CNPJ inválido: todos os dígitos são iguais' },
    },
  ],
  documentation:
    'O gerador produz números sintéticos com dígitos verificadores corretos (matriz, filial 0001), úteis para testar validações; eles não pertencem a empresas reais. Desde julho de 2026 o CNPJ pode conter letras nas 12 primeiras posições; os dígitos verificadores continuam numéricos e usam o valor ASCII do caractere menos 48. O validador confere apenas a sintaxe e não confirma que a empresa existe ou está ativa.',
});
