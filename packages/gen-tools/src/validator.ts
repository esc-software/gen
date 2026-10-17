import { z } from 'zod';
import { defineTool, type CategoryId, type Tool } from '@esc/gen-core';

export type Detail = string | number | boolean;

export interface ValidationOutcome {
  valid: boolean;
  /** Motivo da aceitação ou da rejeição. */
  message: string;
  /** Informações extras mostradas ao lado do veredito (tipo, formato, partes...). */
  details?: Record<string, Detail>;
}

export interface ValidatorSpec {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  icon: string;
  /** Rótulo do campo de entrada, por exemplo "CPF". */
  label: string;
  placeholder?: string;
  help?: string;
  category?: CategoryId;
  maxLength?: number;
  multiline?: boolean;
  documentation: string;
  /** Rótulos legíveis para as chaves de `details`. */
  detailLabels?: Record<string, string>;
  examples: { description: string; value: string; valid: boolean }[];
  validate: (value: string) => ValidationOutcome | Promise<ValidationOutcome>;
}

/**
 * Cria um validador "ao vivo": o usuário digita e vê o veredito na hora. A saída é
 * `{ valid, message, ...details }`. Validadores conferem a sintaxe e não provam existência.
 */
export function defineValidator(spec: ValidatorSpec): Tool {
  return defineTool({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category ?? 'validadores',
    keywords: spec.keywords,
    icon: spec.icon,
    modes: ['browser', 'node'],
    live: true,
    inputSchema: z.object({ value: z.string().max(spec.maxLength ?? 256) }),
    outputSchema: z
      .object({ valid: z.boolean(), message: z.string() })
      .catchall(z.union([z.string(), z.number(), z.boolean()])),
    execute: async ({ value }) => {
      const { valid, message, details } = await spec.validate(value);
      return { valid, message, ...(details ?? {}) };
    },
    fields: {
      value: {
        label: spec.label,
        ...(spec.placeholder ? { placeholder: spec.placeholder } : {}),
        ...(spec.help ? { help: spec.help } : {}),
        ...(spec.multiline ? { multiline: true } : {}),
      },
    },
    outputLabels: { valid: 'Válido', message: 'Mensagem', ...(spec.detailLabels ?? {}) },
    examples: spec.examples.map((e) => ({
      description: e.description,
      input: { value: e.value },
      output: { valid: e.valid },
    })),
    documentation: spec.documentation,
  });
}

/** Mantém apenas os dígitos. */
export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Verdadeiro se todos os caracteres são iguais (ex.: "1111111"). */
export const allSame = (value: string): boolean => value.length > 0 && /^(.)\1*$/s.test(value);
