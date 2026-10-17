import { describe, expect, it } from 'vitest';
import { cssMinifierTool, fakeRgTool, formatHtml, formatMarkdown, formatSql, htmlFormatterTool, markdownFormatterTool, minifyCss, sqlFormatterTool } from './index.js';

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string } };
const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => {
  const r = await run(tool, input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
};
const fails = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown, fragment?: string) => {
  const r = await run(tool, input);
  expect(r.ok).toBe(false);
  if (!r.ok && fragment) expect(r.error.message).toContain(fragment);
};

describe('formatador de SQL', () => {
  const base = { dialect: 'postgresql', keywordCase: 'upper', indent: 2 } as const;

  it('formata com indentação e mantém o conteúdo', async () => {
    const r = await formatSql('select a,b from t where x=1 and y in (1,2) order by a', base);
    expect(r.result).toBe('SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y IN (1, 2)\nORDER BY\n  a');
    expect(r.semanticsKept).toBe(true);
  });

  it('respeita a caixa das palavras-chave e a indentação', async () => {
    expect((await formatSql('SELECT A FROM T', { ...base, keywordCase: 'lower' })).result).toContain('select');
    expect((await formatSql('select a from t', { ...base, keywordCase: 'preserve' })).result).toContain('select');
    expect((await formatSql('select a from t', { ...base, indent: 4 })).result).toContain('\n    a');
  });

  it('não altera literais, identificadores entre aspas nem comentários', async () => {
    const sql = "select 'Texto  com   espaços', \"Coluna  X\" from t -- comentário  importante\nwhere nome = 'a;b'";
    const r = await formatSql(sql, base);
    expect(r.result).toContain("'Texto  com   espaços'");
    expect(r.result).toContain('"Coluna  X"');
    expect(r.result).toContain('-- comentário  importante');
    expect(r.result).toContain("'a;b'");
  });

  it('várias consultas, dialetos e entradas problemáticas', async () => {
    const multi = (await formatSql('select 1; select 2', base)).result;
    expect(multi.match(/SELECT/g)).toHaveLength(2);
    expect((await formatSql('select * from `tabela` limit 5', { ...base, dialect: 'mysql' })).result).toContain('`tabela`');
    expect((await formatSql('select top 5 * from t', { ...base, dialect: 'transactsql' })).result).toContain('TOP 5');
    await expect(formatSql('   ', base)).rejects.toThrow('vazia');
    const bad = await run(sqlFormatterTool, { sql: "select 'não fechado", dialect: 'sql' });
    expect(bad.ok === false || (bad.ok && typeof bad.data.result === 'string')).toBe(true);
  });

  it('ferramenta: mensagem de conteúdo preservado e erros de entrada', async () => {
    const r = await data(sqlFormatterTool, { sql: 'select 1', dialect: 'sql', keywordCase: 'upper', indent: 2 });
    expect(r.semanticsKept).toBe(true);
    expect(String(r.message)).toContain('apenas espaços');
    await fails(sqlFormatterTool, { sql: '', dialect: 'sql' }, 'vazia');
    await fails(sqlFormatterTool, { sql: 'select 1', dialect: 'mongodb' });
    await fails(sqlFormatterTool, { sql: 'select 1', indent: 20 });
  });
});

describe('minificador de CSS', () => {
  it('reduz e mantém o significado', async () => {
    const r = await minifyCss('a { color : #ff0000 ; margin: 0px 0px 0px 0px }\n/* comentário */\n.b { padding: 0.50em }');
    expect(r.result).toBe('a{color:red;margin:0}.b{padding:.5em}');
    expect(r.after).toBeLessThan(r.before);
  });

  it('preserva media queries, variáveis, strings e @font-face', async () => {
    const css = '@media (min-width: 600px) { .a { color: var(--x) } }\n:root { --x: #123456 }\n.b::before { content: "a  b" }\n@font-face { font-family: F; src: url(f.woff2) }';
    const out = (await minifyCss(css)).result;
    expect(out).toContain('@media (min-width:600px)');
    expect(out).toContain('--x:#123456');
    expect(out).toContain('content:"a  b"');
    expect(out).toContain('@font-face{font-family:F;src:url(f.woff2)}');
  });

  it('recusa CSS inválido com linha e coluna em vez de descartar trechos', async () => {
    await expect(minifyCss('a { color: ; }\n.b { margin 0 }')).rejects.toThrow(/CSS inválido \(linha \d+, coluna \d+\)/);
    await expect(minifyCss('a { color: red')).resolves.toBeDefined();
    await expect(minifyCss('  ')).rejects.toThrow('vazia');
  });

  it('ferramenta: percentual de redução', async () => {
    const r = await data(cssMinifierTool, { css: 'a { color: red; }\n\n\n' });
    expect(r).toMatchObject({ result: 'a{color:red}' });
    expect(r.savedPercent).toBeGreaterThanOrEqual(40);
    await fails(cssMinifierTool, { css: '' }, 'vazia');
  });
});

describe('formatador de HTML', () => {
  it('indenta a estrutura aninhada', async () => {
    const out = await formatHtml('<div><p>oi</p><ul><li>a</li><li>b</li></ul></div>', { indent: 2, wrap: 0 });
    expect(out).toBe('<div>\n  <p>oi</p>\n  <ul>\n    <li>a</li>\n    <li>b</li>\n  </ul>\n</div>');
  });

  it('mantém <pre>, <code> e <textarea> intactos', async () => {
    const out = await formatHtml('<div><pre>  linha1\n    linha2</pre><textarea>  x  </textarea></div>', { indent: 2, wrap: 0 });
    expect(out).toContain('<pre>  linha1\n    linha2</pre>');
    expect(out).toContain('<textarea>  x  </textarea>');
  });

  it('trata scripts como texto: nada é executado e o conteúdo é mantido', async () => {
    const r = await data(htmlFormatterTool, { html: '<script>window.__executado = true</script><img src=x onerror="window.__executado=true">', indent: 2, wrap: 0 });
    expect(String(r.result)).toContain('window.__executado = true');
    expect((globalThis as { __executado?: boolean }).__executado).toBeUndefined();
  });

  it('respeita indentação e quebra de linhas e valida a entrada', async () => {
    expect(await formatHtml('<div><p>a</p></div>', { indent: 4, wrap: 0 })).toContain('\n    <p>');
    const wrapped = await formatHtml(`<p>${'palavra '.repeat(30)}</p>`, { indent: 2, wrap: 40 });
    expect(wrapped.split('\n').length).toBeGreaterThan(3);
    await fails(htmlFormatterTool, { html: '' }, 'vazia');
    expect((await data(htmlFormatterTool, { html: '<div><p>a</p></div>' })).semanticsKept).toBe(true);
  });
});

describe('formatador de Markdown', () => {
  it('normaliza listas, linhas em branco e espaços', async () => {
    expect(await formatMarkdown('# Título\n* a\n* b\n\n\n\ntexto   com  espaços', { proseWrap: 'preserve', width: 80 })).toBe('# Título\n\n- a\n- b\n\ntexto com espaços\n');
  });

  it('alinha tabelas', async () => {
    const out = await formatMarkdown('|a|b|\n|-|-|\n|1|22|', { proseWrap: 'preserve', width: 80 });
    expect(out).toBe('| a   | b   |\n| --- | --- |\n| 1   | 22  |\n');
  });

  it('quebra e une parágrafos conforme a opção', async () => {
    const long = 'palavra '.repeat(30).trim();
    expect((await formatMarkdown(long, { proseWrap: 'always', width: 40 })).split('\n').length).toBeGreaterThan(3);
    expect((await formatMarkdown('uma\nlinha\nquebrada', { proseWrap: 'never', width: 80 })).trim()).toBe('uma linha quebrada');
    expect((await formatMarkdown('uma\nlinha', { proseWrap: 'preserve', width: 80 })).trim()).toBe('uma\nlinha');
  });

  it('preserva blocos de código e o conteúdo', async () => {
    const out = await formatMarkdown('```js\nconst   a  =  1\n```\n\n`  inline  `', { proseWrap: 'preserve', width: 80 });
    expect(out).toContain('const   a  =  1');
    await expect(formatMarkdown('', { proseWrap: 'preserve', width: 80 })).rejects.toThrow('vazia');
    await fails(markdownFormatterTool, { markdown: '' }, 'vazia');
    await fails(markdownFormatterTool, { markdown: 'x', width: 5 });
  });
});

describe('RG demonstrativo', () => {
  it('formato, semente e aviso', async () => {
    const r = await data(fakeRgTool, { count: 20, seed: 'rg' });
    expect((r.numbers as string[]).every((n) => /^\d{2}\.\d{3}\.\d{3}-[\dX]$/.test(n))).toBe(true);
    expect(String(r.note)).toContain('não tem formato nem algoritmo nacionais');
    expect(r.numbers).toEqual((await data(fakeRgTool, { count: 20, seed: 'rg' })).numbers);
    await fails(fakeRgTool, { count: 101 });
  });
});
