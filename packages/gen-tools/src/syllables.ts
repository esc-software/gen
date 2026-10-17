import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { extractWords } from './counters.js';

const VOWELS = 'aeiouáéíóúâêôãõàüy';
/** Vogais "fortes": formam hiato quando vizinhas entre si (ex.: po-e-ta, le-ão). */
const STRONG = new Set('aeoáéóâêôãõà');
/** Vogais fracas acentuadas: o acento indica hiato (sa-í-da, pa-ís). */
const ACCENTED_WEAK = new Set('íú');

const isVowel = (c: string) => VOWELS.includes(c);

function splitsBetween(a: string, b: string): boolean {
  // Ditongo nasal (mão, põe): ã/õ seguidos de o/e permanecem juntos.
  if ((a === 'ã' || a === 'õ') && (b === 'o' || b === 'e')) return false;
  if (ACCENTED_WEAK.has(a) || ACCENTED_WEAK.has(b)) return true;
  return STRONG.has(a) && STRONG.has(b);
}

/**
 * Estimativa do número de sílabas de uma palavra em português, por regras de
 * ditongo e hiato. Não usa dicionário, então casos ambíguos (como "ideia" ou "rainha")
 * podem divergir da separação gramatical.
 */
export function countSyllablesPt(word: string): number {
  // O "u" mudo de "qu"/"gu" antes de e/i não forma sílaba (queijo, guerra).
  const letters = word
    .toLocaleLowerCase()
    .replace(/[^a-záéíóúâêôãõàüy]/g, '')
    .replace(/(qu|gu)(?=[eéêií])/g, (m) => m[0] as string);
  if (letters === '') return 0;

  let count = 0;
  let previous = '';
  for (const c of letters) {
    if (isVowel(c)) {
      if (previous === '' || !isVowel(previous) || splitsBetween(previous, c)) count++;
    }
    previous = c;
  }
  // Palavras sem vogal (como "tv", "cd") são lidas soletradas: ao menos uma sílaba.
  return Math.max(count, 1);
}

export function countSyllables(text: string) {
  const words = extractWords(text);
  const perWord = words.map((w) => ({ word: w, syllables: countSyllablesPt(w) }));
  const total = perWord.reduce((sum, w) => sum + w.syllables, 0);
  return { syllables: total, words: words.length, perWord };
}

export const syllableCounterTool = defineTool({
  id: 'contador-silabas',
  name: 'Contador de Sílabas',
  description: 'Estima o número de sílabas de palavras e textos em português',
  category: 'contadores',
  keywords: ['sílabas', 'silabas', 'contar', 'português', 'poesia', 'métrica', 'versos'],
  icon: '🗣️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: z.string().max(200_000) }),
  outputSchema: z.object({
    syllables: z.number(),
    words: z.number(),
    breakdown: z.array(z.string()),
  }),
  execute: ({ text }) => {
    const { syllables, words, perWord } = countSyllables(text);
    return {
      syllables,
      words,
      breakdown: perWord.slice(0, 200).map((w) => `${w.word}: ${w.syllables}`),
    };
  },
  fields: {
    text: { label: 'Texto', multiline: true, placeholder: 'coração, saída, queijo…', help: 'Contagem aproximada, para português.' },
  },
  outputLabels: { syllables: 'Sílabas (estimativa)', words: 'Palavras', breakdown: 'Por palavra' },
  examples: [
    {
      description: 'Hiatos, ditongos e "qu"',
      input: { text: 'saída coração queijo mãe' },
      output: {
        syllables: 9,
        words: 4,
        breakdown: ['saída: 3', 'coração: 3', 'queijo: 2', 'mãe: 1'],
      },
    },
  ],
  documentation:
    'A contagem é uma estimativa baseada em regras (separação de ditongos e hiatos, "qu"/"gu" antes de e/i, acentos), sem dicionário nem análise de tonicidade. Funciona bem para a maioria das palavras, mas pode errar em casos ambíguos, em palavras estrangeiras e em siglas. Não use como única fonte para métrica poética ou tarefas escolares que exijam a separação gramatical exata.',
});
