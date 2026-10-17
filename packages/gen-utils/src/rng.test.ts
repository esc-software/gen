import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';

describe('createRng', () => {
  it('com semente, a sequência é reproduzível e muda com outra semente', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    const c = createRng('abd');
    const seqA = Array.from({ length: 20 }, () => a.int(1000));
    expect(Array.from({ length: 20 }, () => b.int(1000))).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.int(1000))).not.toEqual(seqA);
  });

  it('sem semente, usa fonte segura e varia', () => {
    const a = createRng();
    expect(a.digits(30)).not.toBe(createRng().digits(30));
  });

  it('respeita limites e distribui de forma aproximadamente uniforme', () => {
    const r = createRng('uniforme');
    const counts = new Array<number>(5).fill(0);
    for (let i = 0; i < 10_000; i++) counts[r.int(5)]!++;
    for (const n of counts) expect(Math.abs(n - 2000)).toBeLessThan(200);
    for (let i = 0; i < 500; i++) {
      const n = r.between(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('pick, shuffle, digits e chance', () => {
    const r = createRng('x');
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.digits(12)).toMatch(/^\d{12}$/);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(() => r.int(0)).toThrow(RangeError);
  });
});
