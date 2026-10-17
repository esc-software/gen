import { z } from 'zod';
import { md5 } from '@noble/hashes/legacy';
import { defineTool } from '@esc/gen-core';

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

const WEB_CRYPTO_NAMES = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' } as const;

export async function hashBytes(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
  // MD5 não existe na Web Crypto; usa @noble/hashes (auditada). Os demais usam a API nativa.
  if (algorithm === 'md5') return md5(bytes);
  const digest = await crypto.subtle.digest(WEB_CRYPTO_NAMES[algorithm], new Uint8Array(bytes));
  return new Uint8Array(digest);
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function hashText(
  text: string,
  algorithm: HashAlgorithm,
  encoding: 'hex' | 'base64' = 'hex'
): Promise<string> {
  const digest = await hashBytes(new TextEncoder().encode(text), algorithm);
  return encoding === 'hex' ? toHex(digest) : toBase64(digest);
}

export const hashTool = defineTool({
  id: 'hash',
  name: 'Gerador de Hash',
  description: 'Calcula MD5, SHA-1, SHA-256, SHA-384 e SHA-512 de um texto',
  category: 'geradores',
  keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'checksum', 'digest'],
  icon: '#️⃣',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    text: z.string().max(5_000_000),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha384', 'sha512']).default('sha256'),
    encoding: z.enum(['hex', 'base64']).default('hex'),
  }),
  outputSchema: z.object({ hash: z.string(), algorithm: z.string(), note: z.string().optional() }),
  execute: async ({ text, algorithm, encoding }) => ({
    hash: await hashText(text, algorithm, encoding),
    algorithm,
    ...(algorithm === 'md5' || algorithm === 'sha1'
      ? { note: 'MD5 e SHA-1 não são seguros contra colisões; use apenas para verificar integridade sem adversários.' }
      : {}),
  }),
  fields: {
    text: { label: 'Texto', multiline: true },
    algorithm: { label: 'Algoritmo', optionLabels: { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' } },
    encoding: { label: 'Formato da saída', optionLabels: { hex: 'Hexadecimal', base64: 'Base64' } },
  },
  outputLabels: { hash: 'Hash', algorithm: 'Algoritmo', note: 'Aviso' },
  examples: [
    {
      description: 'SHA-256 de "abc"',
      input: { text: 'abc', algorithm: 'sha256', encoding: 'hex' },
      output: { hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', algorithm: 'sha256' },
    },
  ],
  documentation:
    'Um hash é uma impressão digital de tamanho fixo: o mesmo texto sempre gera o mesmo resultado e não há como recuperar o texto original a partir dele. Não é criptografia reversível. O texto é codificado em UTF-8 antes do cálculo. Não use hashes simples (MD5, SHA-*) para guardar senhas; use algoritmos próprios para isso, como Argon2, scrypt ou bcrypt.',
});
