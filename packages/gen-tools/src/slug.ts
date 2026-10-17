import { z } from 'zod';
import { defineTool } from '@esc/gen-core';

const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L' };

export interface SlugOptions {
  separator: '-' | '_';
  lowercase: boolean;
  maxLength?: number | undefined;
}

/** Remove acentos (decomposição Unicode) e letras especiais comuns. */
export function removeDiacritics(text: string): string {
  return text
    .replace(/[ßæÆœŒøØđĐłŁ]/g, (c) => SPECIAL[c] as string)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

export function slugify(text: string, { separator, lowercase, maxLength }: SlugOptions): string {
  const base = removeDiacritics(text);
  const cased = lowercase ? base.toLowerCase() : base;
  let slug = cased.replace(/[^A-Za-z0-9]+/g, separator).replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');
  if (maxLength !== undefined && slug.length > maxLength) {
    slug = slug.slice(0, maxLength).replace(new RegExp(`${separator}+$`), '');
  }
  return slug;
}

export const slugTool = defineTool({
  id: 'slug',
  name: 'Gerador de Slug',
  description: 'Transforma um texto em um slug para URLs: sem acentos, sem espaços e sem símbolos',
  category: 'conversores',
  keywords: ['slug', 'url', 'seo', 'permalink', 'acentos', 'texto'],
  icon: '🔗',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(10_000),
    separator: z.enum(['-', '_']).default('-'),
    lowercase: z.boolean().default(true),
    maxLength: z.number().int().min(1).max(200).optional(),
  }),
  outputSchema: z.object({ slug: z.string() }),
  execute: ({ text, separator, lowercase, maxLength }) => ({
    slug: slugify(text, { separator, lowercase, maxLength }),
  }),
  fields: {
    text: { label: 'Texto', placeholder: 'Coração, Ação & Emoção!' },
    separator: { label: 'Separador', optionLabels: { '-': 'Hífen (-)', _: 'Sublinhado (_)' } },
    lowercase: { label: 'Converter para minúsculas' },
    maxLength: { label: 'Tamanho máximo', help: 'Opcional. O corte respeita o separador.' },
  },
  outputLabels: { slug: 'Slug' },
  examples: [
    {
      description: 'Título com acentos',
      input: { text: 'Coração, Ação & Emoção!', separator: '-', lowercase: true },
      output: { slug: 'coracao-acao-emocao' },
    },
  ],
  documentation:
    'Remove acentos, troca qualquer sequência de caracteres que não sejam letras ou números pelo separador e apaga separadores nas pontas. Alfabetos que não são latinos (grego, cirílico, japonês) não têm transliteração e seus caracteres são descartados.',
});
