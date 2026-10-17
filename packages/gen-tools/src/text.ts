import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { removeDiacritics } from './slug.js';

export type TextOperation =
  | 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant'
  | 'invert' | 'reverse' | 'collapse' | 'trim-lines' | 'remove-blank' | 'sort' | 'unique';

/** Separa em palavras: letras/números e fronteiras camelCase, ignorando pontuação e separadores. */
export function splitWords(text: string): string[] {
  return (
    text
      .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

const capitalize = (w: string) => (w === '' ? w : w[0]!.toLocaleUpperCase() + w.slice(1).toLocaleLowerCase());

const lines = (text: string) => text.split(/\r\n|\r|\n/);

export function convertText(text: string, operation: TextOperation): string {
  switch (operation) {
    case 'upper':
      return text.toLocaleUpperCase();
    case 'lower':
      return text.toLocaleLowerCase();
    case 'title':
      return text.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toLocaleUpperCase());
    case 'sentence':
      return text.toLocaleLowerCase().replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toLocaleUpperCase());
    case 'camel':
      return splitWords(text).map((w, i) => (i === 0 ? w.toLocaleLowerCase() : capitalize(w))).join('');
    case 'pascal':
      return splitWords(text).map(capitalize).join('');
    case 'snake':
      return splitWords(text).map((w) => w.toLocaleLowerCase()).join('_');
    case 'kebab':
      return splitWords(text).map((w) => w.toLocaleLowerCase()).join('-');
    case 'constant':
      return splitWords(text).map((w) => w.toLocaleUpperCase()).join('_');
    case 'invert':
      return [...text].map((c) => (c === c.toLocaleUpperCase() ? c.toLocaleLowerCase() : c.toLocaleUpperCase())).join('');
    case 'reverse':
      return [...(typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(text)].map((s) => s.segment) : [...text])].reverse().join('');
    case 'collapse':
      return text.replace(/[ \t]+/g, ' ').replace(/ ?(\r\n|\r|\n) ?/g, '$1').trim();
    case 'trim-lines':
      return lines(text).map((l) => l.trim()).join('\n');
    case 'remove-blank':
      return lines(text).filter((l) => l.trim() !== '').join('\n');
    case 'sort':
      return lines(text).sort((a, b) => a.localeCompare(b, 'pt-BR')).join('\n');
    case 'unique':
      return [...new Set(lines(text))].join('\n');
  }
}

const OPERATIONS: Record<TextOperation, string> = {
  upper: 'MAIÚSCULAS',
  lower: 'minúsculas',
  title: 'Cada Palavra Em Maiúscula',
  sentence: 'Primeira letra de cada frase',
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  kebab: 'kebab-case',
  constant: 'CONSTANT_CASE',
  invert: 'iNVERTER cAIXA',
  reverse: 'Inverter o texto (de trás para frente)',
  collapse: 'Remover espaços excedentes',
  'trim-lines': 'Remover espaços nas pontas de cada linha',
  'remove-blank': 'Remover linhas em branco',
  sort: 'Ordenar linhas (A-Z)',
  unique: 'Remover linhas repetidas',
};

export const textConverterTool = defineTool({
  id: 'conversor-texto',
  name: 'Conversor de Texto',
  description: 'Maiúsculas, minúsculas, capitalização, camelCase, snake_case, limpeza de espaços e linhas',
  category: 'conversores',
  keywords: ['texto', 'maiúsculas', 'minúsculas', 'capitalizar', 'camelcase', 'snake_case', 'kebab', 'espaços', 'linhas', 'ordenar'],
  icon: '🔠',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(2_000_000),
    operation: z.enum(Object.keys(OPERATIONS) as [TextOperation, ...TextOperation[]]).default('upper'),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: ({ text, operation }) => ({ result: convertText(text, operation) }),
  fields: {
    text: { label: 'Texto', multiline: true },
    operation: { label: 'Transformação', optionLabels: OPERATIONS },
  },
  outputLabels: { result: 'Resultado' },
  examples: [
    { description: 'snake_case', input: { text: 'Olá Mundo Bonito', operation: 'snake' }, output: { result: 'olá_mundo_bonito' } },
    { description: 'camelCase a partir de PascalCase', input: { text: 'MeuNomeCompleto', operation: 'camel' }, output: { result: 'meuNomeCompleto' } },
  ],
  documentation:
    'As transformações respeitam acentos e outros alfabetos. camelCase, snake_case e kebab-case separam palavras por espaços, pontuação e mudanças de maiúsculas. "Primeira letra de cada frase" considera ponto, exclamação, interrogação e reticências. A ordenação segue o alfabeto português.',
});

export const removeAccentsTool = defineTool({
  id: 'remover-acentos',
  name: 'Removedor de Acentos',
  description: 'Remove acentos, cedilhas e outros sinais diacríticos de um texto',
  category: 'conversores',
  keywords: ['acentos', 'remover', 'diacríticos', 'cedilha', 'texto', 'normalizar'],
  icon: '🧹',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: z.string().max(2_000_000) }),
  outputSchema: z.object({ result: z.string(), changed: z.number() }),
  execute: ({ text }) => {
    const result = removeDiacritics(text);
    // Conta os caracteres (pontos de código) que mudam ao perder o acento.
    const changed = [...text].filter((c) => removeDiacritics(c) !== c).length;
    return { result, changed };
  },
  fields: { text: { label: 'Texto', multiline: true, placeholder: 'Ação, coração, Ávila…' } },
  outputLabels: { result: 'Texto sem acentos', changed: 'Caracteres alterados' },
  examples: [{ description: 'Frase com acentos', input: { text: 'Ação, coração e Ávila' }, output: { result: 'Acao, coracao e Avila' } }],
  documentation:
    'Decompõe cada letra (Unicode NFD) e descarta os sinais combinantes, além de trocar letras especiais como ß, æ e ø. Mantém maiúsculas e minúsculas. Alfabetos sem equivalente latino (grego, cirílico) não são transliterados.',
});
