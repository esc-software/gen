import { z } from 'zod';
import { defineTool } from '@esc/gen-core';

const MAX_TEXT = 5_000_000;
const textSchema = z.string().max(MAX_TEXT);
const textHint = { label: 'Texto', multiline: true, placeholder: 'Digite ou cole o texto aqui' };

/** Palavra: letras e números (qualquer alfabeto), com apóstrofo ou hífen no meio ("d'água", "guarda-chuva"). */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function extractWords(text: string): string[] {
  return text.match(WORD) ?? [];
}

export function countWords(text: string) {
  const words = extractWords(text);
  const unique = new Set(words.map((w) => w.toLocaleLowerCase()));
  return {
    words: words.length,
    uniqueWords: unique.size,
    // 200 palavras por minuto é uma média aproximada de leitura silenciosa em português.
    readingSeconds: Math.round((words.length / 200) * 60),
  };
}

function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  }
  return [...text];
}

export function countCharacters(text: string) {
  const parts = graphemes(text);
  return {
    graphemes: parts.length,
    graphemesWithoutSpaces: parts.filter((g) => !/^\s+$/u.test(g)).length,
    codePoints: [...text].length,
    utf16Units: text.length,
    utf8Bytes: new TextEncoder().encode(text).length,
  };
}

export function countLines(text: string) {
  if (text === '') return { lines: 0, nonEmptyLines: 0, emptyLines: 0 };
  const lines = text.split(/\r\n|\r|\n/);
  // Uma quebra final não cria uma linha nova.
  if (lines[lines.length - 1] === '') lines.pop();
  const nonEmpty = lines.filter((l) => l.trim() !== '').length;
  return { lines: lines.length, nonEmptyLines: nonEmpty, emptyLines: lines.length - nonEmpty };
}

export const wordCounterTool = defineTool({
  id: 'contador-palavras',
  name: 'Contador de Palavras',
  description: 'Conta palavras, palavras únicas e estima o tempo de leitura enquanto você digita',
  category: 'contadores',
  keywords: ['palavras', 'contar', 'texto', 'redação', 'leitura'],
  icon: '🔤',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: textSchema }),
  outputSchema: z.object({ words: z.number(), uniqueWords: z.number(), readingSeconds: z.number() }),
  execute: ({ text }) => countWords(text),
  fields: { text: textHint },
  outputLabels: { words: 'Palavras', uniqueWords: 'Palavras únicas', readingSeconds: 'Tempo de leitura (segundos)' },
  examples: [
    {
      description: 'Frase simples',
      input: { text: 'O guarda-chuva é d’água, o GUARDA-CHUVA!' },
      output: { words: 6, uniqueWords: 4, readingSeconds: 2 },
    },
  ],
  documentation:
    'Uma palavra é uma sequência de letras ou números de qualquer alfabeto; hífen e apóstrofo entre letras mantêm a palavra unida ("guarda-chuva" conta como uma). Pontuação e espaços repetidos são ignorados e linhas vazias não contam. As palavras únicas ignoram maiúsculas. O tempo de leitura assume cerca de 200 palavras por minuto e é só uma estimativa.',
});

export const characterCounterTool = defineTool({
  id: 'contador-caracteres',
  name: 'Contador de Caracteres',
  description: 'Conta caracteres, com e sem espaços, e mostra pontos de código, unidades UTF-16 e bytes',
  category: 'contadores',
  keywords: ['caracteres', 'contar', 'texto', 'letras', 'twitter', 'limite', 'bytes'],
  icon: '🔡',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: textSchema }),
  outputSchema: z.object({
    graphemes: z.number(),
    graphemesWithoutSpaces: z.number(),
    codePoints: z.number(),
    utf16Units: z.number(),
    utf8Bytes: z.number(),
  }),
  execute: ({ text }) => countCharacters(text),
  fields: { text: textHint },
  outputLabels: {
    graphemes: 'Caracteres (como são vistos)',
    graphemesWithoutSpaces: 'Caracteres sem espaços',
    codePoints: 'Pontos de código Unicode',
    utf16Units: 'Unidades UTF-16 (length em JavaScript)',
    utf8Bytes: 'Bytes em UTF-8',
  },
  examples: [
    {
      description: 'Acento escrito separado da letra',
      input: { text: 'cafe\u0301 ok' },
      output: { graphemes: 7, graphemesWithoutSpaces: 6, codePoints: 8, utf16Units: 8, utf8Bytes: 9 },
    },
  ],
  documentation:
    'O número principal conta o que o leitor enxerga como um caractere (grafema): "é" escrito com acento separado e emojis compostos contam como um só. Os demais números mostram outras formas de medir o mesmo texto, úteis para limites de campos e de APIs: pontos de código Unicode, unidades UTF-16 (o length do JavaScript) e bytes em UTF-8.',
});

export const lineCounterTool = defineTool({
  id: 'contador-linhas',
  name: 'Contador de Linhas',
  description: 'Conta as linhas de um texto, separando as vazias das preenchidas',
  category: 'contadores',
  keywords: ['linhas', 'contar', 'texto', 'quebras de linha', 'parágrafos'],
  icon: '📏',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: textSchema }),
  outputSchema: z.object({ lines: z.number(), nonEmptyLines: z.number(), emptyLines: z.number() }),
  execute: ({ text }) => countLines(text),
  fields: { text: textHint },
  outputLabels: { lines: 'Linhas', nonEmptyLines: 'Linhas preenchidas', emptyLines: 'Linhas vazias' },
  examples: [
    {
      description: 'Três linhas, uma vazia',
      input: { text: 'primeira\n\nterceira\n' },
      output: { lines: 3, nonEmptyLines: 2, emptyLines: 1 },
    },
  ],
  documentation:
    'Reconhece quebras de linha dos três estilos (\\n, \\r\\n e \\r). Uma linha com apenas espaços conta como vazia. Uma quebra de linha no final do texto não cria uma linha extra, e um texto vazio tem zero linhas.',
});
