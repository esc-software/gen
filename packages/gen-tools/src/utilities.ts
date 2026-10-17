import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { createRng, secureRandomInt, secureShuffle } from '@esc/gen-utils';

// ---------- formatação de tempo ----------

/** 3725000 ms → "01:02:05.000" (horas só aparecem quando necessárias). */
export function formatClock(ms: number, withMillis = true): string {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const base = `${h > 0 ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return withMillis ? `${base}.${String(total % 1000).padStart(3, '0')}` : base;
}

/** Cliques por segundo, com uma casa decimal. */
export function clicksPerSecond(clicks: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.round((clicks / seconds) * 10) / 10;
}

// ---------- roleta ----------

export const wheelTool = defineTool({
  id: 'roleta',
  name: 'Roleta de Decisão',
  description: 'Sorteia uma opção entre as que você escrever, com resultado justo e aleatório',
  category: 'utilidades',
  keywords: ['roleta', 'sorteio', 'decidir', 'escolher', 'aleatório', 'sortear nome', 'rifa'],
  icon: '🎡',
  modes: ['browser', 'node'],
  ui: 'wheel',
  inputSchema: z.object({ options: z.string().min(1, 'Escreva ao menos duas opções').max(5000) }),
  outputSchema: z.object({ winner: z.string(), index: z.number(), options: z.array(z.string()), count: z.number() }),
  execute: ({ options }) => {
    const list = options.split(/\r\n|\r|\n/).map((o) => o.trim()).filter(Boolean);
    if (list.length < 2) throw new ToolError('Escreva ao menos duas opções, uma por linha');
    if (list.length > 100) throw new ToolError('Use no máximo 100 opções');
    const index = secureRandomInt(list.length);
    return { winner: list[index] as string, index, options: list, count: list.length };
  },
  fields: { options: { label: 'Opções (uma por linha)', multiline: true, placeholder: 'Pizza\nHambúrguer\nSushi' } },
  outputLabels: { winner: 'Sorteado', index: 'Posição (a partir de 0)', options: 'Opções', count: 'Total de opções' },
  examples: [{ description: 'Três opções', input: { options: 'Pizza\nHambúrguer\nSushi' } }],
  documentation: 'O sorteio usa o gerador aleatório criptográfico do sistema e dá a mesma chance a cada linha (linhas repetidas têm mais chance, pois contam como opções separadas). A animação da roleta é só visual: o resultado é sorteado antes e a roleta para nele. Não use para sorteios com valor legal, que exigem regras e autorização próprias.',
});

// ---------- cara ou coroa ----------

export const coinTool = defineTool({
  id: 'cara-ou-coroa',
  name: 'Cara ou Coroa',
  description: 'Joga uma ou várias moedas virtuais e mostra quantas deram cara e quantas deram coroa',
  category: 'utilidades',
  keywords: ['cara ou coroa', 'moeda', 'sortear', 'decidir', 'aleatório', 'par ou ímpar'],
  icon: '🪙',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: z.number().int().min(1).max(1000).default(1) }),
  outputSchema: z.object({ results: z.array(z.enum(['cara', 'coroa'])), heads: z.number(), tails: z.number(), summary: z.string() }),
  execute: ({ count }) => {
    const results = Array.from({ length: count }, () => (secureRandomInt(2) === 0 ? ('cara' as const) : ('coroa' as const)));
    const heads = results.filter((r) => r === 'cara').length;
    return { results, heads, tails: count - heads, summary: count === 1 ? `Deu ${results[0]}.` : `${heads} cara(s) e ${count - heads} coroa(s) em ${count} lançamentos.` };
  },
  fields: { count: { label: 'Quantidade de moedas (1 a 1000)' } },
  outputLabels: { results: 'Resultados', heads: 'Caras', tails: 'Coroas', summary: 'Resumo' },
  examples: [{ description: 'Uma moeda', input: { count: 1 } }],
  documentation: 'Cada moeda é sorteada de forma independente com chance de 50% para cada lado, usando o gerador aleatório criptográfico do sistema. Em poucos lançamentos é normal a contagem ficar longe de metade e metade.',
});

// ---------- dados ----------

export const diceTool = defineTool({
  id: 'dados',
  name: 'Lançamento de Dados',
  description: 'Lança dados de 4, 6, 8, 10, 12, 20 faces ou personalizados, com modificador, para jogos de tabuleiro e RPG',
  category: 'utilidades',
  keywords: ['dados', 'dado', 'd20', 'd6', 'rpg', 'rolar dados', 'jogo', 'sortear número'],
  icon: '🎲',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: z.number().int().min(1).max(100).default(2), sides: z.number().int().min(2).max(1000).default(6), modifier: z.number().int().min(-1000).max(1000).default(0) }),
  outputSchema: z.object({ notation: z.string(), rolls: z.array(z.number()), sum: z.number(), total: z.number(), highest: z.number(), lowest: z.number() }),
  execute: ({ count, sides, modifier }) => {
    const rolls = Array.from({ length: count }, () => secureRandomInt(sides) + 1);
    const sum = rolls.reduce((a, b) => a + b, 0);
    return {
      notation: `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ''}`,
      rolls, sum, total: sum + modifier, highest: Math.max(...rolls), lowest: Math.min(...rolls),
    };
  },
  fields: { count: { label: 'Quantidade de dados' }, sides: { label: 'Faces de cada dado', help: '6 para dado comum, 20 para d20 de RPG.' }, modifier: { label: 'Modificador (soma ao total)' } },
  outputLabels: { notation: 'Notação', rolls: 'Resultados', sum: 'Soma dos dados', total: 'Total com modificador', highest: 'Maior', lowest: 'Menor' },
  examples: [{ description: '2d6', input: { count: 2, sides: 6, modifier: 0 } }],
  documentation: 'Cada dado é sorteado de forma uniforme e independente (sem viés de módulo) com o gerador aleatório criptográfico do sistema. A notação segue o padrão dos jogos: 2d6+3 = dois dados de 6 faces, somando 3.',
});

// ---------- temporizador ----------

export const timerTool = defineTool({
  id: 'temporizador',
  name: 'Temporizador',
  description: 'Contagem regressiva com alerta sonoro e visual ao terminar',
  category: 'utilidades',
  keywords: ['temporizador', 'timer', 'contagem regressiva', 'alarme', 'cozinha', 'estudo', 'pomodoro'],
  icon: '⏲️',
  modes: ['browser'],
  ui: 'countdown',
  inputSchema: z.object({ hours: z.number().int().min(0).max(99).default(0), minutes: z.number().int().min(0).max(59).default(5), seconds: z.number().int().min(0).max(59).default(0) }),
  outputSchema: z.object({ totalSeconds: z.number(), formatted: z.string() }),
  execute: ({ hours, minutes, seconds }) => {
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    if (totalSeconds < 1) throw new ToolError('Defina um tempo maior que zero');
    return { totalSeconds, formatted: formatClock(totalSeconds * 1000, false) };
  },
  fields: { hours: { label: 'Horas' }, minutes: { label: 'Minutos' }, seconds: { label: 'Segundos' } },
  outputLabels: { totalSeconds: 'Total (segundos)', formatted: 'Duração' },
  examples: [{ description: '5 minutos', input: { hours: 0, minutes: 5, seconds: 0 }, output: { totalSeconds: 300, formatted: '05:00' } }],
  documentation: 'A contagem usa o relógio do dispositivo (não o número de "ticks"), então continua correta mesmo se a aba ficar em segundo plano. O som exige que o navegador permita áudio e a aba pode atrasar a atualização visual quando está oculta, mas o fim é calculado pelo horário. Nada é enviado a servidores.',
});

// ---------- cronômetro ----------

export const stopwatchTool = defineTool({
  id: 'cronometro',
  name: 'Cronômetro',
  description: 'Cronômetro com marcação de voltas, preciso em milissegundos',
  category: 'utilidades',
  keywords: ['cronômetro', 'cronometro', 'tempo', 'voltas', 'parcial', 'treino', 'stopwatch'],
  icon: '⏱️',
  modes: ['browser'],
  ui: 'stopwatch',
  inputSchema: z.object({}),
  outputSchema: z.object({ ready: z.boolean(), precision: z.string() }),
  execute: () => ({ ready: true, precision: 'milissegundos' }),
  fields: {},
  outputLabels: { ready: 'Pronto', precision: 'Precisão' },
  examples: [{ description: 'Abrir', input: {}, output: { ready: true } }],
  documentation: 'Mede o tempo pelo relógio de alta resolução do navegador, então não perde precisão quando a aba fica em segundo plano. Marque voltas para ver o tempo de cada parcial e o acumulado. A precisão real depende do dispositivo; nada é enviado a servidores.',
});

// ---------- cliques por segundo ----------

export const clickTestTool = defineTool({
  id: 'cliques-por-segundo',
  name: 'Teste de Cliques por Segundo',
  description: 'Mede quantos cliques você consegue dar em alguns segundos (CPS)',
  category: 'utilidades',
  keywords: ['cliques por segundo', 'cps', 'teste de clique', 'click speed', 'gamer', 'velocidade do mouse'],
  icon: '🖱️',
  modes: ['browser'],
  ui: 'click-test',
  inputSchema: z.object({ duration: z.number().int().min(1).max(60).default(5) }),
  outputSchema: z.object({ duration: z.number(), instructions: z.string() }),
  execute: ({ duration }) => ({ duration, instructions: `Clique o mais rápido que puder durante ${duration} segundos. O teste começa no primeiro clique.` }),
  fields: { duration: { label: 'Duração do teste (segundos)' } },
  outputLabels: { duration: 'Duração (s)', instructions: 'Como funciona' },
  examples: [{ description: '5 segundos', input: { duration: 5 }, output: { duration: 5 } }],
  documentation: 'O teste começa no primeiro clique e termina quando o tempo acaba; o resultado é o número de cliques dividido pelos segundos. O valor depende do mouse, do sistema e da técnica; cliques automáticos não são detectados nem impedidos.',
});

// ---------- paciência (Klondike) ----------

export type Suit = 'copas' | 'ouros' | 'paus' | 'espadas';
export interface Card { suit: Suit; rank: number; faceUp: boolean }
export const SUITS: Suit[] = ['copas', 'ouros', 'paus', 'espadas'];
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (s: Suit) => s === 'copas' || s === 'ouros';

export interface SolitaireState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // 4 pilhas, uma por naipe (índice de SUITS)
  tableau: Card[][]; // 7 colunas
  drawCount: 1 | 3;
  moves: number;
}

export function newDeck(): Card[] {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, faceUp: false })));
}

/** Distribui um jogo. Com `seed`, o embaralhamento é reproduzível (útil para testes e para repetir uma mão). */
export function dealSolitaire(drawCount: 1 | 3 = 1, seed?: string): SolitaireState {
  const deck = seed ? createRng(seed).shuffle(newDeck()) : secureShuffle(newDeck());
  const tableau: Card[][] = [];
  let at = 0;
  for (let col = 0; col < 7; col++) {
    const pile = deck.slice(at, at + col + 1).map((c, i, arr) => ({ ...c, faceUp: i === arr.length - 1 }));
    tableau.push(pile);
    at += col + 1;
  }
  return { stock: deck.slice(at).map((c) => ({ ...c, faceUp: false })), waste: [], foundations: [[], [], [], []], tableau, drawCount, moves: 0 };
}

const clone = (s: SolitaireState): SolitaireState => ({ ...s, stock: s.stock.map((c) => ({ ...c })), waste: s.waste.map((c) => ({ ...c })), foundations: s.foundations.map((p) => p.map((c) => ({ ...c }))), tableau: s.tableau.map((p) => p.map((c) => ({ ...c }))) });

export function canPlaceOnTableau(card: Card, target: Card | undefined): boolean {
  if (!target) return card.rank === 13;
  return target.faceUp && isRed(card.suit) !== isRed(target.suit) && card.rank === target.rank - 1;
}

export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
}

export type Source = { from: 'waste' } | { from: 'tableau'; column: number; index: number } | { from: 'foundation'; pile: number };
export type Target = { to: 'tableau'; column: number } | { to: 'foundation' };

/** Aplica um movimento; devolve o novo estado ou null se for ilegal (o estado original nunca é alterado). */
export function applyMove(state: SolitaireState, source: Source, target: Target): SolitaireState | null {
  const s = clone(state);
  let moving: Card[];
  if (source.from === 'waste') {
    const top = s.waste[s.waste.length - 1];
    if (!top) return null;
    moving = [top];
  } else if (source.from === 'foundation') {
    const pile = s.foundations[source.pile];
    const top = pile?.[pile.length - 1];
    if (!top) return null;
    moving = [top];
  } else {
    const col = s.tableau[source.column];
    if (!col || source.index < 0 || source.index >= col.length || !col[source.index]?.faceUp) return null;
    moving = col.slice(source.index);
  }
  const first = moving[0] as Card;

  if (target.to === 'foundation') {
    if (moving.length !== 1) return null;
    const pile = s.foundations[SUITS.indexOf(first.suit)] as Card[];
    if (!canPlaceOnFoundation(first, pile)) return null;
    pile.push(first);
  } else {
    const dest = s.tableau[target.column];
    if (!dest) return null;
    if (source.from === 'tableau' && source.column === target.column) return null;
    // Cada carta da sequência movida precisa seguir a regra (já garantido por estar virada e em ordem, mas validamos).
    for (let i = 1; i < moving.length; i++) if (!canPlaceOnTableau(moving[i] as Card, moving[i - 1])) return null;
    if (!canPlaceOnTableau(first, dest[dest.length - 1])) return null;
    dest.push(...moving.map((c) => ({ ...c, faceUp: true })));
  }

  if (source.from === 'waste') s.waste.pop();
  else if (source.from === 'foundation') (s.foundations[source.pile] as Card[]).pop();
  else {
    const col = s.tableau[source.column] as Card[];
    col.splice(source.index);
    const newTop = col[col.length - 1];
    if (newTop) newTop.faceUp = true;
  }
  s.moves++;
  return s;
}

/** Compra do estoque; com o estoque vazio, recicla o descarte. */
export function drawFromStock(state: SolitaireState): SolitaireState {
  const s = clone(state);
  if (s.stock.length === 0) {
    if (s.waste.length === 0) return s;
    s.stock = s.waste.reverse().map((c) => ({ ...c, faceUp: false }));
    s.waste = [];
  } else {
    for (let i = 0; i < s.drawCount && s.stock.length > 0; i++) s.waste.push({ ...(s.stock.pop() as Card), faceUp: true });
  }
  s.moves++;
  return s;
}

export const isWon = (s: SolitaireState): boolean => s.foundations.every((p) => p.length === 13);

export const solitaireTool = defineTool({
  id: 'paciencia',
  name: 'Jogo de Paciência',
  description: 'Paciência clássica (Klondike) para jogar no navegador, comprando 1 ou 3 cartas',
  category: 'utilidades',
  keywords: ['paciência', 'paciencia', 'solitaire', 'klondike', 'cartas', 'jogo de cartas', 'baralho'],
  icon: '🃏',
  modes: ['browser'],
  ui: 'solitaire',
  inputSchema: z.object({ drawCount: z.number().int().min(1).max(3).refine((n) => n === 1 || n === 3, 'Use 1 ou 3').default(1), seed: z.string().max(60).optional() }),
  outputSchema: z.object({ drawCount: z.number(), seed: z.string(), tableauSizes: z.array(z.number()), stockSize: z.number() }),
  execute: ({ drawCount, seed }) => {
    const usedSeed = seed ?? String(secureRandomInt(1_000_000_000));
    const state = dealSolitaire(drawCount as 1 | 3, usedSeed);
    return { drawCount, seed: usedSeed, tableauSizes: state.tableau.map((c) => c.length), stockSize: state.stock.length };
  },
  fields: { drawCount: { label: 'Cartas por compra (1 ou 3)', help: '1 é mais fácil; 3 é o modo tradicional.' }, seed: { label: 'Número da mão (opcional)', help: 'O mesmo número gera sempre a mesma distribuição; deixe vazio para uma mão nova.' } },
  outputLabels: { drawCount: 'Cartas por compra', seed: 'Número da mão', tableauSizes: 'Cartas por coluna', stockSize: 'Cartas no estoque' },
  examples: [{ description: 'Mão reproduzível', input: { drawCount: 1, seed: 'teste' }, output: { tableauSizes: [1, 2, 3, 4, 5, 6, 7], stockSize: 24 } }],
  documentation: 'Regras: monte as quatro pilhas de fundação de A a K por naipe; nas colunas, empilhe em ordem decrescente alternando cores; só reis (ou sequências iniciadas em rei) ocupam colunas vazias. Compre do estoque 1 ou 3 cartas e recicle o descarte quando acabar. Nem toda mão é ganhável. O baralho é embaralhado com o gerador aleatório do sistema, ou de forma reproduzível quando você informa o número da mão.',
});

export const utilityTools = [wheelTool, coinTool, diceTool, timerTool, stopwatchTool, clickTestTool, solitaireTool];
