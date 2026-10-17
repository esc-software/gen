import { describe, it, expect } from 'vitest';
import { boundedLength } from './common.js';

describe('boundedLength', () => {
  const schema = boundedLength(1, 128);

  it('aceita valores dentro dos limites', () => {
    expect(schema.safeParse(1).success).toBe(true);
    expect(schema.safeParse(128).success).toBe(true);
  });

  it('rejeita fora dos limites, decimais e não numéricos', () => {
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(129).success).toBe(false);
    expect(schema.safeParse(2.5).success).toBe(false);
    expect(schema.safeParse('10').success).toBe(false);
  });
});
