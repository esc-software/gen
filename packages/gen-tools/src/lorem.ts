import { z } from 'zod';
import { defineTool } from '@esc/gen-core';

const SENTENCES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Curabitur pretium tincidunt lacus, nulla gravida orci a odio.',
  'Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.',
  'Integer in mauris eu nibh euismod gravida.',
  'Duis ac tellus et risus vulputate vehicula.',
  'Donec lobortis risus a elit, etiam tempor.',
  'Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam.',
  'Maecenas fermentum consequat mi, donec fermentum.',
];

export interface LoremOptions {
  paragraphs: number;
  sentencesPerParagraph: number;
  startWithLorem: boolean;
}

/**
 * Texto de preenchimento determinístico: percorre o corpus de frases em ciclo.
 * Com `startWithLorem`, o primeiro parágrafo começa com a frase clássica.
 */
export function generateLorem({ paragraphs, sentencesPerParagraph, startWithLorem }: LoremOptions): string {
  // Sem `startWithLorem`, começa na terceira frase para não abrir com o texto clássico.
  const offset = startWithLorem ? 0 : 2;
  const out: string[] = [];
  let cursor = offset;
  for (let p = 0; p < paragraphs; p++) {
    const sentences: string[] = [];
    for (let s = 0; s < sentencesPerParagraph; s++) {
      sentences.push(SENTENCES[cursor % SENTENCES.length] as string);
      cursor++;
    }
    out.push(sentences.join(' '));
  }
  return out.join('\n\n');
}

export const loremTool = defineTool({
  id: 'lorem-ipsum',
  name: 'Gerador de Lorem Ipsum',
  description: 'Gera texto de preenchimento com parágrafos e frases configuráveis',
  category: 'geradores',
  keywords: ['lorem', 'ipsum', 'texto', 'preenchimento', 'placeholder'],
  icon: '📝',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    paragraphs: z.number().int().min(1).max(50).default(3),
    sentencesPerParagraph: z.number().int().min(1).max(20).default(4),
    startWithLorem: z.boolean().default(true),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: (options) => ({ text: generateLorem(options) }),
  fields: {
    paragraphs: { label: 'Parágrafos' },
    sentencesPerParagraph: { label: 'Frases por parágrafo' },
    startWithLorem: { label: 'Começar com “Lorem ipsum dolor sit amet”' },
  },
  outputLabels: { text: 'Texto' },
  examples: [
    {
      description: 'Um parágrafo de duas frases',
      input: { paragraphs: 1, sentencesPerParagraph: 2, startWithLorem: true },
      output: {
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      },
    },
  ],
  documentation:
    'Texto de preenchimento para layouts e protótipos. O resultado é determinístico: os mesmos parâmetros produzem sempre o mesmo texto. As frases são trechos do Lorem Ipsum tradicional, que não tem significado.',
});
