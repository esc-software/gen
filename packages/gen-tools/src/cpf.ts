import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { secureRandomInt } from '@esc/gen-utils';

/** Dígitos verificadores de uma base de 9 dígitos (módulo 11). */
export function calculateCPFCheckDigits(base: string): { first: number; second: number } {
  if (!/^\d{9}$/.test(base)) {
    throw new RangeError('A base do CPF deve ter exatamente 9 dígitos numéricos');
  }
  const digits = [...base].map(Number);
  const check = (values: number[]) => {
    const sum = values.reduce((acc, d, i) => acc + d * (values.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = check(digits);
  const second = check([...digits, first]);
  return { first, second };
}

export function formatCPF(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/** Gera um CPF sintético com dígitos verificadores corretos (não pertence a uma pessoa real). */
export function generateCPF(): string {
  let base: string;
  do {
    base = String(secureRandomInt(1_000_000_000)).padStart(9, '0');
  } while (/^(\d)\1{8}$/.test(base));
  const { first, second } = calculateCPFCheckDigits(base);
  return `${base}${first}${second}`;
}

export interface CPFValidation {
  valid: boolean;
  message: string;
}

/** Validação sintática: tamanho, dígitos repetidos e dígitos verificadores. Não consulta a Receita Federal. */
export function validateCPF(input: string): CPFValidation {
  const digits = input.replace(/[.\-\s]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, message: 'O CPF deve conter apenas números, pontos e hífen' };
  if (digits.length !== 11) return { valid: false, message: 'O CPF deve ter 11 dígitos' };
  if (/^(\d)\1{10}$/.test(digits)) {
    return { valid: false, message: 'CPF inválido: todos os dígitos são iguais' };
  }
  const { first, second } = calculateCPFCheckDigits(digits.slice(0, 9));
  const firstOk = Number(digits[9]) === first;
  const secondOk = Number(digits[10]) === second;
  if (firstOk && secondOk) return { valid: true, message: 'CPF válido (formato e dígitos verificadores)' };
  if (!firstOk && !secondOk) return { valid: false, message: 'CPF inválido: dígitos verificadores incorretos' };
  return {
    valid: false,
    message: `CPF inválido: ${firstOk ? 'segundo' : 'primeiro'} dígito verificador incorreto`,
  };
}

export const cpfTool = defineTool({
  id: 'cpf',
  name: 'Gerador e Validador de CPF',
  description: 'Gera CPFs sintéticos para testes e valida CPFs pelos dígitos verificadores',
  category: 'geradores',
  keywords: ['cpf', 'validar', 'gerar', 'documento', 'cadastro de pessoas físicas'],
  icon: '🪪',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      action: z.enum(['generate', 'validate', 'format']).default('generate'),
      cpf: z.string().max(32).optional(),
    })
    .refine((v) => v.action === 'generate' || (v.cpf ?? '').trim() !== '', {
      path: ['cpf'],
      message: 'Informe o CPF',
    }),
  outputSchema: z.object({ cpf: z.string(), valid: z.boolean(), message: z.string() }),
  execute: ({ action, cpf }) => {
    if (action === 'generate') {
      const digits = generateCPF();
      return {
        cpf: formatCPF(digits),
        valid: true,
        message: 'CPF sintético gerado. Não pertence a uma pessoa real.',
      };
    }
    const raw = (cpf ?? '').trim();
    const result = validateCPF(raw);
    const digits = raw.replace(/\D/g, '');
    const shown = result.valid || (action === 'format' && digits.length === 11) ? formatCPF(digits) : raw;
    return { cpf: shown, ...result };
  },
  fields: {
    action: { label: 'Ação', optionLabels: { generate: 'Gerar', validate: 'Validar', format: 'Formatar' } },
    cpf: { label: 'CPF', placeholder: '529.982.247-25', help: 'Usado em Validar e Formatar.' },
  },
  outputLabels: { cpf: 'CPF', valid: 'Válido', message: 'Mensagem' },
  examples: [
    { description: 'CPF válido', input: { action: 'validate', cpf: '529.982.247-25' }, output: { cpf: '529.982.247-25', valid: true, message: 'CPF válido (formato e dígitos verificadores)' } },
    { description: 'Dígitos repetidos', input: { action: 'validate', cpf: '11111111111' }, output: { cpf: '11111111111', valid: false, message: 'CPF inválido: todos os dígitos são iguais' } },
    { description: 'Formatar', input: { action: 'format', cpf: '52998224725' }, output: { cpf: '529.982.247-25', valid: true, message: 'CPF válido (formato e dígitos verificadores)' } },
  ],
  documentation:
    'O gerador produz números sintéticos com dígitos verificadores corretos, úteis para testar validações e formulários; eles não correspondem a documentos emitidos nem a pessoas reais. O validador verifica apenas a sintaxe (tamanho, dígitos repetidos e dígitos verificadores) e não confirma que o CPF existe ou está regular.',
});
