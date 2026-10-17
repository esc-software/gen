import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { secureRandomString } from '@esc/gen-utils';

const ALPHABETS = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  hex: '0123456789abcdef',
  numeric: '0123456789',
} as const;

export type TokenCharset = keyof typeof ALPHABETS;

export function generateToken(length = 32, charset: TokenCharset = 'alphanumeric'): string {
  return secureRandomString(ALPHABETS[charset], length);
}

export const tokenTool = defineTool({
  id: 'token',
  name: 'Gerador de Token',
  description: 'Gera tokens aleatórios seguros com o tamanho e o conjunto de caracteres escolhidos',
  category: 'geradores',
  keywords: ['token', 'aleatório', 'segredo', 'chave', 'api key'],
  icon: '🎫',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    length: z.number().int().min(1).max(512).default(32),
    charset: z.enum(['alphanumeric', 'hex', 'numeric']).default('alphanumeric'),
  }),
  outputSchema: z.object({ token: z.string() }),
  execute: ({ length, charset }) => ({ token: generateToken(length, charset) }),
  fields: {
    length: { label: 'Tamanho', help: 'De 1 a 512 caracteres.' },
    charset: {
      label: 'Caracteres',
      optionLabels: { alphanumeric: 'Letras e números', hex: 'Hexadecimal', numeric: 'Somente números' },
    },
  },
  outputLabels: { token: 'Token' },
  examples: [{ description: 'Token de 16 caracteres hexadecimais', input: { length: 16, charset: 'hex' } }],
  documentation:
    'Usa o gerador criptograficamente seguro do sistema (crypto.getRandomValues) sem viés de distribuição. O token é gerado localmente e nunca enviado a um servidor.',
});
