import { describe, it, expect } from 'vitest';
import { secureRandomInt, secureRandomString, secureShuffle } from './random.js';

describe('secureRandomInt', () => {
  it('fica dentro do intervalo [0, max)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = secureRandomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('retorna 0 quando max é 1', () => {
    expect(secureRandomInt(1)).toBe(0);
  });

  it('rejeita max inválido', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError);
    expect(() => secureRandomInt(1.5)).toThrow(RangeError);
    expect(() => secureRandomInt(-3)).toThrow(RangeError);
  });
});

describe('secureRandomString', () => {
  it('gera o comprimento pedido usando apenas o alfabeto', () => {
    const s = secureRandomString('abc', 200);
    expect(s).toHaveLength(200);
    expect(s).toMatch(/^[abc]+$/);
  });

  it('aceita comprimento 0 e rejeita entradas inválidas', () => {
    expect(secureRandomString('abc', 0)).toBe('');
    expect(() => secureRandomString('', 5)).toThrow(RangeError);
    expect(() => secureRandomString('abc', -1)).toThrow(RangeError);
  });
});

describe('secureShuffle', () => {
  it('preserva os elementos, não altera a entrada e muda a ordem', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const out = secureShuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input[0]).toBe(0);
    expect(out).not.toEqual(input); // chance de falso alarme: 1/30!
  });

  it('lida com arrays vazios e unitários', () => {
    expect(secureShuffle([])).toEqual([]);
    expect(secureShuffle([7])).toEqual([7]);
  });
});
