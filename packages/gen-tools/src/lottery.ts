import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { secureShuffle } from '@esc/gen-utils';

/** Regras numéricas das loterias da Caixa: quantidade de dezenas do volante e quantas podem ser marcadas. */
export const LOTTERY_GAMES = {
  megasena: { name: 'Mega-Sena', from: 1, to: 60, min: 6, max: 20 },
  quina: { name: 'Quina', from: 1, to: 80, min: 5, max: 15 },
  lotofacil: { name: 'Lotofácil', from: 1, to: 25, min: 15, max: 20 },
  diadesorte: { name: 'Dia de Sorte', from: 1, to: 31, min: 7, max: 15 },
  duplasena: { name: 'Dupla Sena', from: 1, to: 50, min: 6, max: 15 },
  lotomania: { name: 'Lotomania', from: 0, to: 99, min: 50, max: 50 },
} as const;
export type LotteryGame = keyof typeof LOTTERY_GAMES;

const pad = (n: number) => String(n).padStart(2, '0');

/** Sorteia `count` dezenas distintas, em ordem crescente, com aleatoriedade criptográfica. */
export function pickNumbers(game: LotteryGame, count?: number): number[] {
  const rule = LOTTERY_GAMES[game];
  const size = count ?? rule.min;
  if (!Number.isInteger(size) || size < rule.min || size > rule.max) {
    throw new ToolError(rule.min === rule.max ? `${rule.name} usa exatamente ${rule.min} dezenas` : `${rule.name} aceita de ${rule.min} a ${rule.max} dezenas por aposta`);
  }
  const pool = Array.from({ length: rule.to - rule.from + 1 }, (_, i) => rule.from + i);
  return secureShuffle(pool).slice(0, size).sort((a, b) => a - b);
}

export const lotteryTool = defineTool({
  id: 'gerador-loteria',
  name: 'Gerador de Números da Loteria',
  description: 'Sorteia dezenas para Mega-Sena, Quina, Lotofácil, Dia de Sorte, Dupla Sena e Lotomania, quantas apostas você quiser',
  category: 'geradores',
  keywords: ['loteria', 'mega sena', 'megasena', 'quina', 'lotofácil', 'lotofacil', 'dia de sorte', 'dupla sena', 'lotomania', 'sorteio', 'números', 'palpite', 'aposta', 'surpresinha'],
  icon: '🎰',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    game: z.enum(['megasena', 'quina', 'lotofacil', 'diadesorte', 'duplasena', 'lotomania']).default('megasena'),
    count: z.number().int().min(1).max(50).optional(),
    bets: z.number().int().min(1).max(50).default(1),
  }),
  outputSchema: z.object({ game: z.string(), rule: z.string(), bets: z.array(z.string()), note: z.string() }),
  execute: ({ game, count, bets }) => {
    const rule = LOTTERY_GAMES[game];
    const size = count ?? rule.min;
    const lines = Array.from({ length: bets }, () => pickNumbers(game, size).map(pad).join(' '));
    return {
      game: rule.name,
      rule: `${size} dezenas de ${pad(rule.from)} a ${pad(rule.to)}`,
      bets: lines,
      note: 'Cada sorteio é aleatório e independente: nenhum conjunto de números tem mais chance que outro, e esta ferramenta não aumenta as suas chances. As apostas válidas são feitas só nas casas lotéricas ou nos canais oficiais da Caixa, por maiores de 18 anos. Jogue com responsabilidade.',
    };
  },
  fields: {
    game: {
      label: 'Jogo',
      optionLabels: { megasena: 'Mega-Sena (6 de 60)', quina: 'Quina (5 de 80)', lotofacil: 'Lotofácil (15 de 25)', diadesorte: 'Dia de Sorte (7 de 31)', duplasena: 'Dupla Sena (6 de 50)', lotomania: 'Lotomania (50 de 100)' },
    },
    count: { label: 'Dezenas por aposta (opcional)', help: 'Se vazio, usa o mínimo do jogo. Mega-Sena: 6 a 20; Quina: 5 a 15; Lotofácil: 15 a 20; Dia de Sorte: 7 a 15; Dupla Sena: 6 a 15; Lotomania: 50.' },
    bets: { label: 'Quantidade de apostas' },
  },
  outputLabels: { game: 'Jogo', rule: 'Regra', bets: 'Apostas', note: 'Importante' },
  examples: [{ description: 'Uma aposta simples da Mega-Sena', input: { game: 'megasena', bets: 1 }, output: { game: 'Mega-Sena', rule: '6 dezenas de 01 a 60' } }],
  documentation:
    'Sorteia dezenas distintas com o gerador criptograficamente seguro do sistema e as mostra em ordem crescente, com dois dígitos. Segue a quantidade de dezenas do volante de cada jogo (a Lotomania usa 50 dezenas de 00 a 99). É só um gerador de palpites ("surpresinha"): não prevê resultados nem aumenta a chance de ganhar, e não registra a aposta. Para apostar, use uma casa lotérica ou os canais oficiais da Caixa.',
});
