import { describe, expect, it } from 'vitest';
import { ROADMAP, registry } from './index.js';

describe('catálogo de progresso', () => {
  it('não repete ids', () => {
    const ids = ROADMAP.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda ferramenta registrada consta no catálogo de progresso', () => {
    const planned = new Set(ROADMAP.map((r) => r.id));
    const unlisted = registry.list().filter((t) => !planned.has(t.id)).map((t) => t.id);
    expect(unlisted).toEqual([]);
  });

  it('item registrado não pode carregar nota de pendência', () => {
    const stale = ROADMAP.filter((r) => registry.has(r.id) && r.pending).map((r) => r.id);
    expect(stale).toEqual([]);
  });

  it('a categoria registrada coincide com a prevista', () => {
    for (const r of ROADMAP) {
      const tool = registry.get(r.id);
      if (tool) expect(tool.category, r.id).toBe(r.category);
    }
  });
});
