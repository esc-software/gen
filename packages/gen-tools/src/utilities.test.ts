import { describe, expect, it } from 'vitest';
import {
  RANK_LABELS, SUITS, applyMove, canPlaceOnFoundation, canPlaceOnTableau, clickTestTool, clicksPerSecond, coinTool, dealSolitaire, diceTool, drawFromStock, formatClock, isWon, newDeck,
  solitaireTool, stopwatchTool, timerTool, wheelTool, type Card, type SolitaireState,
} from './index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { ok: true; data: Record<string, any> } | { ok: false; error: { message: string } };
const run = async (t: { run: (i: unknown) => Promise<unknown> }, i: unknown) => (await t.run(i)) as Res;
const ok = async (t: { run: (i: unknown) => Promise<unknown> }, i: unknown) => {
  const r = await run(t, i);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};

describe('tempo', () => {
  it('formata durações', () => {
    expect(formatClock(0)).toBe('00:00.000');
    expect(formatClock(65_432)).toBe('01:05.432');
    expect(formatClock(3_725_000)).toBe('01:02:05.000');
    expect(formatClock(3_725_999, false)).toBe('01:02:05');
    expect(formatClock(-5)).toBe('00:00.000');
  });
  it('cliques por segundo', () => {
    expect(clicksPerSecond(50, 10)).toBe(5);
    expect(clicksPerSecond(37, 5)).toBe(7.4);
    expect(clicksPerSecond(10, 0)).toBe(0);
  });
  it('temporizador soma e valida', async () => {
    expect(await ok(timerTool, { hours: 1, minutes: 2, seconds: 3 })).toEqual({ totalSeconds: 3723, formatted: '01:02:03' });
    expect((await run(timerTool, { hours: 0, minutes: 0, seconds: 0 })).ok).toBe(false);
    expect((await run(timerTool, { minutes: 60 })).ok).toBe(false);
  });
  it('cronômetro e teste de cliques', async () => {
    expect((await ok(stopwatchTool, {})).ready).toBe(true);
    expect((await ok(clickTestTool, { duration: 10 })).duration).toBe(10);
    expect((await run(clickTestTool, { duration: 0 })).ok).toBe(false);
  });
});

describe('sorteios', () => {
  it('roleta sorteia uma das opções e ignora linhas vazias', async () => {
    for (let i = 0; i < 30; i++) {
      const d = await ok(wheelTool, { options: ' A \n\nB\r\nC ' });
      expect(d.options).toEqual(['A', 'B', 'C']);
      expect(d.options[d.index]).toBe(d.winner);
    }
    expect((await run(wheelTool, { options: 'só uma' })).ok).toBe(false);
    expect((await run(wheelTool, { options: Array.from({ length: 101 }, (_, i) => `o${i}`).join('\n') })).ok).toBe(false);
  });
  it('roleta é uniforme (qui-quadrado frouxo)', async () => {
    const counts = [0, 0, 0, 0];
    const n = 4000;
    for (let i = 0; i < n; i++) counts[(await ok(wheelTool, { options: 'a\nb\nc\nd' })).index]!++;
    for (const c of counts) expect(Math.abs(c - n / 4)).toBeLessThan(200); // ~6 desvios-padrão
  });
  it('moeda conta caras e coroas', async () => {
    const d = await ok(coinTool, { count: 500 });
    expect(d.heads + d.tails).toBe(500);
    expect(d.results).toHaveLength(500);
    expect(Math.abs(d.heads - 250)).toBeLessThan(80);
    expect((await ok(coinTool, { count: 1 })).summary).toMatch(/^Deu (cara|coroa)\.$/);
    expect((await run(coinTool, { count: 0 })).ok).toBe(false);
    expect((await run(coinTool, { count: 1001 })).ok).toBe(false);
  });
  it('dados respeitam faces, notação e total', async () => {
    for (let i = 0; i < 50; i++) {
      const d = await ok(diceTool, { count: 3, sides: 20, modifier: 2 });
      expect(d.rolls).toHaveLength(3);
      for (const r of d.rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(20);
      }
      expect(d.sum).toBe(d.rolls.reduce((a: number, b: number) => a + b, 0));
      expect(d.total).toBe(d.sum + 2);
      expect(d.notation).toBe('3d20+2');
      expect(d.highest).toBe(Math.max(...d.rolls));
    }
    expect((await ok(diceTool, { count: 1, sides: 6, modifier: -1 })).notation).toBe('1d6-1');
    expect((await ok(diceTool, { count: 1, sides: 2 })).notation).toBe('1d2');
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add((await ok(diceTool, { count: 1, sides: 6 })).rolls[0]);
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await run(diceTool, { sides: 1 })).ok).toBe(false);
    expect((await run(diceTool, { count: 101 })).ok).toBe(false);
  });
});

describe('paciência: distribuição', () => {
  it('baralho completo e distribuição Klondike', () => {
    const deck = newDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.suit}${c.rank}`)).size).toBe(52);
    const s = dealSolitaire(1, 'x');
    expect(s.tableau.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.stock).toHaveLength(24);
    expect(s.tableau.every((col) => col.filter((c) => c.faceUp).length === 1 && col[col.length - 1]!.faceUp)).toBe(true);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    const all = [...s.stock, ...s.tableau.flat()];
    expect(new Set(all.map((c) => `${c.suit}${c.rank}`)).size).toBe(52);
    expect(RANK_LABELS[13]).toBe('K');
  });
  it('mesma semente = mesma mão; sementes diferentes = mãos diferentes', () => {
    const key = (s: SolitaireState) => s.tableau.flat().map((c) => `${c.suit}${c.rank}`).join();
    expect(key(dealSolitaire(1, 'abc'))).toBe(key(dealSolitaire(3, 'abc')));
    expect(key(dealSolitaire(1, 'abc'))).not.toBe(key(dealSolitaire(1, 'abd')));
    expect(key(dealSolitaire(1))).not.toBe(key(dealSolitaire(1)));
  });
  it('a ferramenta valida as opções', async () => {
    expect((await ok(solitaireTool, { drawCount: 3, seed: 'k' })).stockSize).toBe(24);
    expect((await run(solitaireTool, { drawCount: 2 })).ok).toBe(false);
    expect((await ok(solitaireTool, {})).drawCount).toBe(1);
  });
});

const c = (suit: Card['suit'], rank: number, faceUp = true): Card => ({ suit, rank, faceUp });
const empty = (): SolitaireState => ({ stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []], drawCount: 1, moves: 0 });

describe('paciência: regras', () => {
  it('colunas: cor alternada e rank decrescente; só rei em coluna vazia', () => {
    expect(canPlaceOnTableau(c('paus', 6), c('copas', 7))).toBe(true);
    expect(canPlaceOnTableau(c('espadas', 6), c('paus', 7))).toBe(false); // mesma cor
    expect(canPlaceOnTableau(c('paus', 5), c('copas', 7))).toBe(false); // salto
    expect(canPlaceOnTableau(c('paus', 6), c('copas', 7, false))).toBe(false); // alvo virado para baixo
    expect(canPlaceOnTableau(c('copas', 13), undefined)).toBe(true);
    expect(canPlaceOnTableau(c('copas', 12), undefined)).toBe(false);
  });
  it('fundação: ás primeiro, depois mesmo naipe em ordem', () => {
    expect(canPlaceOnFoundation(c('copas', 1), [])).toBe(true);
    expect(canPlaceOnFoundation(c('copas', 2), [])).toBe(false);
    expect(canPlaceOnFoundation(c('copas', 2), [c('copas', 1)])).toBe(true);
    expect(canPlaceOnFoundation(c('ouros', 2), [c('copas', 1)])).toBe(false);
  });
  it('move sequência entre colunas, vira a carta de baixo e não altera o estado original', () => {
    const s = empty();
    s.tableau[0] = [c('paus', 9, false), c('espadas', 8), c('copas', 7)];
    s.tableau[1] = [c('ouros', 9)];
    const before = JSON.stringify(s);
    const next = applyMove(s, { from: 'tableau', column: 0, index: 1 }, { to: 'tableau', column: 1 })!;
    expect(JSON.stringify(s)).toBe(before);
    expect(next.tableau[1]!.map((x) => x.rank)).toEqual([9, 8, 7]);
    expect(next.tableau[0]!).toHaveLength(1);
    expect(next.tableau[0]![0]!.faceUp).toBe(true);
    expect(next.moves).toBe(1);
  });
  it('recusa movimentos ilegais', () => {
    const s = empty();
    s.tableau[0] = [c('paus', 9, false), c('copas', 8)];
    s.tableau[1] = [c('ouros', 9)];
    s.tableau[2] = [c('copas', 5)];
    expect(applyMove(s, { from: 'tableau', column: 0, index: 0 }, { to: 'tableau', column: 1 })).toBeNull(); // carta virada
    expect(applyMove(s, { from: 'tableau', column: 2, index: 0 }, { to: 'tableau', column: 1 })).toBeNull(); // regra
    expect(applyMove(s, { from: 'tableau', column: 1, index: 0 }, { to: 'tableau', column: 1 })).toBeNull(); // mesma coluna
    expect(applyMove(s, { from: 'waste' }, { to: 'foundation' })).toBeNull(); // descarte vazio
    expect(applyMove(s, { from: 'tableau', column: 9, index: 0 }, { to: 'foundation' })).toBeNull();
    expect(applyMove(s, { from: 'tableau', column: 0, index: 1 }, { to: 'tableau', column: 9 })).toBeNull();
    expect(applyMove(s, { from: 'tableau', column: 0, index: 5 }, { to: 'foundation' })).toBeNull();
  });
  it('fundação: sobe carta do descarte e da coluna; só uma carta por vez', () => {
    const s = empty();
    s.waste = [c('espadas', 1)];
    s.tableau[0] = [c('copas', 2), c('paus', 1)];
    s.tableau[1] = [c('ouros', 5), c('paus', 4)];
    let n = applyMove(s, { from: 'waste' }, { to: 'foundation' })!;
    expect(n.foundations[SUITS.indexOf('espadas')]).toHaveLength(1);
    expect(n.waste).toHaveLength(0);
    n = applyMove(n, { from: 'tableau', column: 0, index: 1 }, { to: 'foundation' })!;
    expect(n.foundations[SUITS.indexOf('paus')]!.map((x) => x.rank)).toEqual([1]);
    expect(applyMove(s, { from: 'tableau', column: 1, index: 0 }, { to: 'foundation' })).toBeNull(); // 2 cartas
    // Pode devolver da fundação para a coluna.
    const back = applyMove(n, { from: 'foundation', pile: SUITS.indexOf('paus') }, { to: 'tableau', column: 2 });
    expect(back).toBeNull(); // ás não vai sobre coluna vazia (só rei)
  });
  it('rei vai para coluna vazia, com a sequência', () => {
    const s = empty();
    s.tableau[0] = [c('copas', 13), c('paus', 12)];
    const n = applyMove(s, { from: 'tableau', column: 0, index: 0 }, { to: 'tableau', column: 3 })!;
    expect(n.tableau[3]!.map((x) => x.rank)).toEqual([13, 12]);
    expect(n.tableau[0]).toHaveLength(0);
  });
  it('compra 1 ou 3 cartas, recicla o descarte e conta jogadas', () => {
    let s = dealSolitaire(3, 'compra');
    s = drawFromStock(s);
    expect(s.waste).toHaveLength(3);
    expect(s.stock).toHaveLength(21);
    expect(s.waste.every((x) => x.faceUp)).toBe(true);
    for (let i = 0; i < 7; i++) s = drawFromStock(s);
    expect(s.stock).toHaveLength(0);
    expect(s.waste).toHaveLength(24);
    const topBefore = s.waste[s.waste.length - 1]!;
    s = drawFromStock(s); // recicla
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    expect(s.stock.every((x) => !x.faceUp)).toBe(true);
    // Depois da reciclagem, a primeira carta comprada é a mesma que era a primeira do descarte original.
    s = dealSolitaire(1, 'compra');
    const first = s.stock[s.stock.length - 1]!;
    expect(drawFromStock(s).waste[0]).toMatchObject({ suit: first.suit, rank: first.rank });
    expect(topBefore.faceUp).toBe(true);
    const empty2 = empty();
    expect(drawFromStock(empty2).moves).toBe(0);
  });
  it('vitória só com as quatro fundações completas', () => {
    const s = empty();
    expect(isWon(s)).toBe(false);
    s.foundations = SUITS.map((suit) => Array.from({ length: 13 }, (_, i) => c(suit, i + 1)));
    expect(isWon(s)).toBe(true);
    s.foundations[0]!.pop();
    expect(isWon(s)).toBe(false);
  });
  it('jogo simulado preserva sempre as 52 cartas', () => {
    let s = dealSolitaire(1, 'sim');
    const count = (x: SolitaireState) => x.stock.length + x.waste.length + x.foundations.flat().length + x.tableau.flat().length;
    for (let step = 0; step < 300; step++) {
      let moved: SolitaireState | null = null;
      for (let col = 0; col < 7 && !moved; col++) {
        const cards = s.tableau[col]!;
        if (cards.length) moved = applyMove(s, { from: 'tableau', column: col, index: cards.length - 1 }, { to: 'foundation' });
      }
      if (!moved && s.waste.length) moved = applyMove(s, { from: 'waste' }, { to: 'foundation' });
      for (let col = 0; col < 7 && !moved && s.waste.length; col++) moved = applyMove(s, { from: 'waste' }, { to: 'tableau', column: col });
      s = moved ?? drawFromStock(s);
      expect(count(s)).toBe(52);
    }
  });
});
