import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCatalogDoc } from './catalog-doc.js';

const file = new URL('../../../docs/tools.md', import.meta.url);

describe('docs/tools.md', () => {
  it('está em dia com o registro de ferramentas', () => {
    const expected = renderCatalogDoc();
    if (process.env.UPDATE_DOCS === '1') writeFileSync(file, expected);
    expect(readFileSync(file, 'utf8')).toBe(expected);
  });
});
