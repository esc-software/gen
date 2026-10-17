import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  let binary: string;
  try {
    binary = atob(base64.replace(/\s+/g, ''));
  } catch {
    throw new ToolError('A entrada não é um Base64 válido');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ToolError('O conteúdo decodificado não é texto UTF-8 válido');
  }
}

export const base64Tool = defineTool({
  id: 'base64',
  name: 'Conversor Base64',
  description: 'Codifica texto em Base64 e decodifica Base64 em texto (UTF-8)',
  category: 'conversores',
  keywords: ['base64', 'codificar', 'decodificar', 'encode', 'decode'],
  icon: '🔄',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    action: z.enum(['encode', 'decode']).default('encode'),
    text: z.string().max(1_000_000),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: ({ action, text }) => ({
    result: action === 'encode' ? encodeBase64(text) : decodeBase64(text),
  }),
  fields: {
    action: { label: 'Ação', optionLabels: { encode: 'Codificar', decode: 'Decodificar' } },
    text: { label: 'Texto', multiline: true },
  },
  outputLabels: { result: 'Resultado' },
  examples: [
    { input: { action: 'encode', text: 'Hello World' }, output: { result: 'SGVsbG8gV29ybGQ=' } },
    { input: { action: 'decode', text: 'SGVsbG8gV29ybGQ=' }, output: { result: 'Hello World' } },
    { input: { action: 'encode', text: 'ação' }, output: { result: 'YcOnw6Nv' } },
  ],
  documentation:
    'Base64 representa bytes como texto ASCII. Não é criptografia: qualquer pessoa pode decodificar. O texto é tratado como UTF-8, então acentos e emojis são preservados.',
});
