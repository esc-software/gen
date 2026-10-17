import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { secureRandomInt, secureShuffle } from '@esc/gen-utils';

const AMBIGUOUS = new Set('Il1O0o|');

const CLASSES = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/',
} as const;

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface GeneratedPassword {
  password: string;
  entropyBits: number;
}

/**
 * Gera uma senha com `crypto.getRandomValues`. Garante ao menos um caractere de cada
 * classe selecionada e embaralha o resultado.
 */
export function generatePassword(options: PasswordOptions): GeneratedPassword {
  const pools = (Object.keys(CLASSES) as (keyof typeof CLASSES)[])
    .filter((name) => options[name])
    .map((name) => [...CLASSES[name]].filter((c) => !(options.excludeAmbiguous && AMBIGUOUS.has(c))));

  if (pools.length === 0) throw new RangeError('Selecione ao menos um tipo de caractere');
  if (options.length < pools.length) throw new RangeError('O tamanho é menor que o número de tipos selecionados');

  const all = pools.flat();
  const chars = pools.map((pool) => pool[secureRandomInt(pool.length)] as string);
  while (chars.length < options.length) chars.push(all[secureRandomInt(all.length)] as string);

  const entropyBits = Math.round(options.length * Math.log2(all.length) * 10) / 10;
  return { password: secureShuffle(chars).join(''), entropyBits };
}

export const passwordTool = defineTool({
  id: 'senha',
  name: 'Gerador de Senhas',
  description: 'Gera senhas fortes e aleatórias, com os tipos de caractere que você escolher',
  category: 'geradores',
  keywords: ['senha', 'password', 'segura', 'forte', 'aleatória', 'wifi'],
  icon: '🔑',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      length: z.number().int().min(4).max(128).default(16),
      lowercase: z.boolean().default(true),
      uppercase: z.boolean().default(true),
      digits: z.boolean().default(true),
      symbols: z.boolean().default(true),
      excludeAmbiguous: z.boolean().default(false),
    })
    .refine((v) => v.lowercase || v.uppercase || v.digits || v.symbols, {
      path: ['lowercase'],
      message: 'Selecione ao menos um tipo de caractere',
    }),
  outputSchema: z.object({ password: z.string(), entropyBits: z.number() }),
  execute: (options) => generatePassword(options),
  fields: {
    length: { label: 'Tamanho', help: 'De 4 a 128 caracteres. Para contas importantes, use 16 ou mais.' },
    lowercase: { label: 'Letras minúsculas' },
    uppercase: { label: 'Letras maiúsculas' },
    digits: { label: 'Números' },
    symbols: { label: 'Símbolos' },
    excludeAmbiguous: { label: 'Evitar caracteres ambíguos (I, l, 1, O, 0, o, |)' },
  },
  outputLabels: { password: 'Senha', entropyBits: 'Entropia estimada (bits)' },
  examples: [{ description: 'Senha de 24 caracteres sem símbolos', input: { length: 24, symbols: false } }],
  documentation:
    'A senha é gerada no seu dispositivo com o gerador criptograficamente seguro do sistema e nunca é enviada a um servidor. A entropia é uma estimativa (tamanho × log2 do alfabeto) e supõe que a senha não foi escolhida por você. Use um gerenciador de senhas para guardá-las e não reutilize senhas.',
});
