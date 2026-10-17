import { describe, expect, it } from 'vitest';
import { lifeExpectancyTool, remainingLifeExpectancy } from './calc-life.js';
import { LIFE_TABLE, LIFE_TABLE_SOURCE } from './life-table-data.js';

describe('tábua de mortalidade do IBGE 2024', () => {
  it('tem 91 valores por sexo (0 a 90 ou mais), todos decrescentes a partir de 1 ano', () => {
    for (const sex of ['ambos', 'homens', 'mulheres'] as const) {
      const t = LIFE_TABLE[sex];
      expect(t).toHaveLength(91);
      for (let x = 1; x < 90; x++) expect(t[x + 1], `${sex} ${x}`).toBeLessThan(t[x] as number);
    }
  });

  it('bate com os números divulgados pelo IBGE ao nascer (76,6; 73,3; 79,9)', () => {
    expect(LIFE_TABLE.ambos[0]).toBeCloseTo(76.6, 1);
    expect(LIFE_TABLE.homens[0]).toBeCloseTo(73.3, 1);
    expect(LIFE_TABLE.mulheres[0]).toBeCloseTo(79.9, 1);
    expect(LIFE_TABLE_SOURCE.year).toBe(2024);
  });

  it('mulheres vivem mais que homens em todas as idades', () => {
    for (let x = 0; x <= 90; x++) expect(LIFE_TABLE.mulheres[x] as number).toBeGreaterThan(LIFE_TABLE.homens[x] as number);
  });

  it('valores pontuais conferidos na planilha oficial', () => {
    expect(LIFE_TABLE.ambos[1]).toBe(76.56);
    expect(LIFE_TABLE.ambos[60]).toBe(22.59);
    expect(LIFE_TABLE.ambos[90]).toBe(5.05);
    expect(LIFE_TABLE.homens[60]).toBe(20.8);
    expect(LIFE_TABLE.mulheres[60]).toBe(24.15);
    expect(LIFE_TABLE.mulheres[90]).toBe(5.32);
  });
});

describe('remainingLifeExpectancy', () => {
  it('na idade exata devolve o valor da tábua e entre idades interpola', () => {
    expect(remainingLifeExpectancy(0, 'ambos')).toBeCloseTo(76.61, 5);
    expect(remainingLifeExpectancy(60, 'homens')).toBeCloseTo(20.8, 5);
    const mid = remainingLifeExpectancy(60.5, 'homens');
    expect(mid).toBeCloseTo(((LIFE_TABLE.homens[60] as number) + (LIFE_TABLE.homens[61] as number)) / 2, 5);
  });

  it('a partir de 90 anos usa o valor de 90 ou mais', () => {
    expect(remainingLifeExpectancy(90, 'mulheres')).toBe(5.32);
    expect(remainingLifeExpectancy(105.7, 'mulheres')).toBe(5.32);
  });

  it('rejeita idade negativa ou inválida', async () => {
    expect(() => remainingLifeExpectancy(-1, 'ambos')).toThrow();
    expect(() => remainingLifeExpectancy(Number.NaN, 'ambos')).toThrow();
  });
});

type Run = { run: (i: unknown) => Promise<unknown> };
type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string } };
const call = async (tool: Run, input: unknown) => (await tool.run(input)) as Result;
const data = async (input: unknown) => {
  const r = await call(lifeExpectancyTool, input);
  if (!r.ok) throw new Error(r.error.code + ': ' + r.error.message);
  return r.data;
};

describe('ferramenta expectativa-vida', () => {
  it('calcula dias vividos e expectativa restante', async () => {
    const d = await data({ birthDate: '1965-01-01', sex: 'ambos', referenceDate: '2025-01-01' });
    expect(d.age).toBe('60 anos, 0 meses e 0 dias');
    expect(d.daysLived).toBe(21915);
    expect(d.expectancyAtBirth).toBe('76.6 anos');
    // 60 anos exatos pela idade em dias (ano médio de 365,2425 dias): perto do valor de 60 anos da tábua (22,59)
    expect(d.remainingDays as number).toBeGreaterThan(22.5 * 365);
    expect(d.remainingDays as number).toBeLessThan(23 * 365);
    expect(d.note).toContain('não uma previsão');
    expect(d.source).toContain('IBGE');
  });

  it('o resultado depende do sexo escolhido', async () => {
    const h = await data({ birthDate: '1990-06-15', sex: 'homens', referenceDate: '2025-01-01' });
    const m = await data({ birthDate: '1990-06-15', sex: 'mulheres', referenceDate: '2025-01-01' });
    expect(m.remainingDays as number).toBeGreaterThan(h.remainingDays as number);
  });

  it('pessoa com 90 anos ou mais usa o valor de 90+', async () => {
    const d = await data({ birthDate: '1920-01-01', sex: 'ambos', referenceDate: '2025-01-01' });
    expect(d.remaining).toMatch(/^cerca de 5 anos/);
  });

  it('rejeita data futura de nascimento, data inválida e idade absurda', async () => {
    for (const input of [
      { birthDate: '2030-01-01', referenceDate: '2025-01-01' },
      { birthDate: '2025-02-30' },
      { birthDate: 'abc' },
      { birthDate: '1800-01-01', referenceDate: '2025-01-01' },
      { birthDate: '1990-01-01', sex: 'outro' },
    ]) {
      expect((await call(lifeExpectancyTool, input)).ok, JSON.stringify(input)).toBe(false);
    }
  });

  it('nunca lança erro, mesmo com entradas hostis', async () => {
    for (const input of [null, undefined, 42, {}, { birthDate: {} }, { birthDate: '1990-01-01', referenceDate: 7 }]) {
      await expect(lifeExpectancyTool.run(input as never)).resolves.toBeDefined();
    }
  });
});
