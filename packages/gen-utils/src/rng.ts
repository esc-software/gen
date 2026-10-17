import { secureRandomInt } from './random.js';

/** Fonte de números aleatórios para geradores de dados de teste. */
export interface Rng {
  /** Inteiro em [0, max). */
  int(max: number): number;
  /** Inteiro em [min, max], inclusive. */
  between(min: number, max: number): number;
  /** Elemento aleatório de uma lista não vazia. */
  pick<T>(items: readonly T[]): T;
  /** Cópia embaralhada. */
  shuffle<T>(items: readonly T[]): T[];
  /** Dígitos aleatórios como texto. */
  digits(length: number): string;
  /** Verdadeiro com a probabilidade dada (0 a 1). */
  chance(probability: number): boolean;
}

/** Hash de texto para semente de 32 bits (xmur3). */
function seedFrom(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32: PRNG pequeno e rápido. Não é seguro para segredos; serve para dados de teste reproduzíveis. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(nextInt: (max: number) => number): Rng {
  const rng: Rng = {
    int: (max) => {
      if (!Number.isInteger(max) || max <= 0) throw new RangeError('max deve ser um inteiro positivo');
      return nextInt(max);
    },
    between: (min, max) => min + rng.int(max - min + 1),
    pick: (items) => {
      if (items.length === 0) throw new RangeError('A lista não pode ser vazia');
      return items[rng.int(items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    digits: (length) => Array.from({ length }, () => String(rng.int(10))).join(''),
    chance: (probability) => rng.int(1_000_000) < probability * 1_000_000,
  };
  return rng;
}

/**
 * Cria um gerador. Com `seed`, a sequência é reproduzível (mesma semente, mesmos dados);
 * sem `seed`, usa `crypto.getRandomValues`.
 */
export function createRng(seed?: string): Rng {
  if (seed === undefined || seed === '') return build((max) => secureRandomInt(max));
  const next = mulberry32(seedFrom(seed));
  return build((max) => Math.floor(next() * max));
}
