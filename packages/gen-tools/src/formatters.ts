import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

const MAX = 2_000_000;
const textHint = { label: 'Código', multiline: true };

const stripForCompare = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// ---------- SQL ----------

export const SQL_DIALECTS = ['sql', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'transactsql', 'plsql', 'bigquery', 'db2', 'redshift', 'snowflake'] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number];

export async function formatSql(sql: string, options: { dialect: SqlDialect; keywordCase: 'upper' | 'lower' | 'preserve'; indent: number }): Promise<{ result: string; semanticsKept: boolean }> {
  if (sql.trim() === '') throw new ToolError('Entrada vazia');
  const { format } = await import('sql-formatter');
  let result: string;
  try {
    result = format(sql, { language: options.dialect, keywordCase: options.keywordCase, tabWidth: options.indent, linesBetweenQueries: 1 });
  } catch (e) {
    throw new ToolError(`Não foi possível formatar o SQL: ${e instanceof Error ? e.message.split('\n')[0] : 'sintaxe não reconhecida'}`);
  }
  // Conferência de segurança: só espaços e maiúsculas/minúsculas das palavras podem mudar.
  return { result, semanticsKept: stripForCompare(result) === stripForCompare(sql) };
}

export const sqlFormatterTool = defineTool({
  id: 'sql',
  name: 'Formatador de SQL',
  description: 'Formata consultas SQL com indentação, quebras de linha e caixa das palavras-chave, para vários dialetos',
  category: 'formatadores',
  keywords: ['sql', 'formatar', 'consulta', 'select', 'postgresql', 'mysql', 'sqlite', 'bigquery', 'indentar', 'beautify'],
  icon: '🗃️',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    sql: z.string().max(MAX).default(''),
    dialect: z.enum(SQL_DIALECTS).default('sql'),
    keywordCase: z.enum(['upper', 'lower', 'preserve']).default('upper'),
    indent: z.number().int().min(1).max(8).default(2),
  }),
  outputSchema: z.object({ result: z.string(), semanticsKept: z.boolean(), message: z.string() }),
  execute: async ({ sql, dialect, keywordCase, indent }) => {
    const r = await formatSql(sql, { dialect, keywordCase, indent });
    return {
      result: r.result, semanticsKept: r.semanticsKept,
      message: r.semanticsKept ? 'SQL formatado; apenas espaços e a caixa das palavras foram alterados.' : 'Atenção: a saída difere do original além de espaços e maiúsculas. Revise antes de usar.',
    };
  },
  fields: {
    sql: { ...textHint, label: 'SQL', placeholder: 'select id,nome from clientes where ativo=1 order by nome' },
    dialect: { label: 'Dialeto', optionLabels: { sql: 'SQL padrão', postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', sqlite: 'SQLite', transactsql: 'SQL Server (T-SQL)', plsql: 'Oracle (PL/SQL)', bigquery: 'BigQuery', db2: 'DB2', redshift: 'Redshift', snowflake: 'Snowflake' } },
    keywordCase: { label: 'Palavras-chave', optionLabels: { upper: 'MAIÚSCULAS', lower: 'minúsculas', preserve: 'Manter como está' } },
    indent: { label: 'Espaços de indentação' },
  },
  outputLabels: { result: 'SQL formatado', semanticsKept: 'Conteúdo preservado', message: 'Resultado' },
  downloads: [{ field: 'result', fileName: 'consulta.sql', mimeType: 'application/sql', label: 'Baixar .sql' }],
  examples: [{ description: 'Consulta simples', input: { sql: 'select a,b from t where x=1 and y in (1,2) order by a', dialect: 'postgresql', keywordCase: 'upper', indent: 2 }, output: { semanticsKept: true } }],
  documentation:
    'O formatador só reorganiza espaços, quebras de linha e a caixa das palavras-chave: não reescreve a consulta. Para conferir, a ferramenta compara a entrada e a saída sem espaços nem maiúsculas e avisa se houver qualquer outra diferença. Escolha o dialeto do seu banco para tratar corretamente aspas, parâmetros e funções. O SQL é processado no seu dispositivo, nunca executado nem enviado.',
});

// ---------- CSS ----------

export async function minifyCss(css: string): Promise<{ result: string; before: number; after: number }> {
  if (css.trim() === '') throw new ToolError('Entrada vazia');
  const csso = await import('csso');
  const errors: { message: string; line: number; column: number }[] = [];
  csso.syntax.parse(css, {
    positions: true,
    onParseError: (error: { message: string; line?: number; column?: number }) => errors.push({ message: error.message, line: error.line ?? 0, column: error.column ?? 0 }),
  });
  if (errors.length > 0) {
    const e = errors[0] as { message: string; line: number; column: number };
    throw new ToolError(`CSS inválido (linha ${e.line}, coluna ${e.column}): ${e.message}. Corrija antes de minificar: trechos inválidos seriam descartados.`);
  }
  const result = csso.minify(css, { restructure: true }).css;
  return { result, before: new TextEncoder().encode(css).length, after: new TextEncoder().encode(result).length };
}

export const cssMinifierTool = defineTool({
  id: 'css-minify',
  name: 'Minificador de CSS',
  description: 'Reduz o tamanho do CSS removendo espaços, comentários e redundâncias, sem alterar o resultado visual',
  category: 'formatadores',
  keywords: ['css', 'minificar', 'minify', 'comprimir', 'otimizar', 'folha de estilo', 'produção'],
  icon: '🎨',
  modes: ['browser', 'node'],
  inputSchema: z.object({ css: z.string().max(MAX).default('') }),
  outputSchema: z.object({ result: z.string(), originalBytes: z.number(), minifiedBytes: z.number(), savedPercent: z.number() }),
  execute: async ({ css }) => {
    const r = await minifyCss(css);
    return { result: r.result, originalBytes: r.before, minifiedBytes: r.after, savedPercent: r.before === 0 ? 0 : Math.round(((r.before - r.after) / r.before) * 1000) / 10 };
  },
  fields: { css: { ...textHint, label: 'CSS', placeholder: 'a { color : #ff0000 ; margin: 0px 0px 0px 0px }' } },
  outputLabels: { result: 'CSS minificado', originalBytes: 'Tamanho original (bytes)', minifiedBytes: 'Tamanho minificado (bytes)', savedPercent: 'Redução (%)' },
  downloads: [{ field: 'result', fileName: 'estilos.min.css', mimeType: 'text/css', label: 'Baixar .min.css' }],
  examples: [{ description: 'Regra simples', input: { css: 'a { color : #ff0000 ; margin: 0px 0px 0px 0px }' }, output: { result: 'a{color:red;margin:0}' } }],
  documentation:
    'Remove comentários e espaços, encurta valores (como #ff0000 para red e 0px para 0) e reorganiza regras repetidas, usando a biblioteca csso. Antes de minificar, o CSS é analisado: se houver erro de sintaxe, a ferramenta indica a linha e se recusa a continuar, porque trechos inválidos seriam descartados silenciosamente. Guarde sempre o CSS original.',
});

// ---------- HTML ----------

export async function formatHtml(html: string, options: { indent: number; wrap: number }): Promise<string> {
  if (html.trim() === '') throw new ToolError('Entrada vazia');
  const mod = (await import('js-beautify')) as unknown as { default?: { html: (s: string, o: object) => string }; html?: (s: string, o: object) => string };
  const beautify = mod.html ?? mod.default?.html;
  if (!beautify) throw new ToolError('Formatador de HTML indisponível');
  return beautify(html, {
    indent_size: options.indent, wrap_line_length: options.wrap, preserve_newlines: true, max_preserve_newlines: 2,
    indent_inner_html: true, unformatted: ['code', 'pre', 'textarea'], extra_liners: [],
  });
}

export const htmlFormatterTool = defineTool({
  id: 'html',
  name: 'Formatador de HTML',
  description: 'Indenta e organiza código HTML, mantendo blocos <pre>, <code> e <textarea> intactos',
  category: 'formatadores',
  keywords: ['html', 'formatar', 'indentar', 'beautify', 'organizar', 'código', 'tags'],
  icon: '🌐',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    html: z.string().max(MAX).default(''),
    indent: z.number().int().min(1).max(8).default(2),
    wrap: z.number().int().min(0).max(300).default(0),
  }),
  outputSchema: z.object({ result: z.string(), semanticsKept: z.boolean(), message: z.string() }),
  execute: async ({ html, indent, wrap }) => {
    const result = await formatHtml(html, { indent, wrap });
    const kept = stripForCompare(result).replace(/>\s+</g, '><') === stripForCompare(html).replace(/>\s+</g, '><') || stripForCompare(result) === stripForCompare(html);
    return {
      result, semanticsKept: kept,
      message: kept ? 'HTML formatado; apenas espaços e quebras de linha foram alterados.' : 'Atenção: além do espaçamento, a estrutura pode ter sido ajustada (por exemplo, tags não fechadas). Revise antes de usar.',
    };
  },
  fields: {
    html: { ...textHint, label: 'HTML' },
    indent: { label: 'Espaços de indentação' },
    wrap: { label: 'Quebrar linhas longas em (colunas)', help: '0 para não quebrar.' },
  },
  outputLabels: { result: 'HTML formatado', semanticsKept: 'Conteúdo preservado', message: 'Resultado' },
  downloads: [{ field: 'result', fileName: 'pagina.html', mimeType: 'text/html', label: 'Baixar .html' }],
  examples: [{ description: 'Lista aninhada', input: { html: '<div><p>oi</p><ul><li>a</li><li>b</li></ul></div>', indent: 2, wrap: 0 } }],
  documentation:
    'O HTML é tratado apenas como texto: nunca é renderizado nem executado nesta página, então scripts colados aqui não rodam. A formatação altera espaços e quebras de linha; os conteúdos de <pre>, <code> e <textarea> são preservados. Como o espaço entre elementos de linha pode afetar a exibição, confira o resultado visual de trechos sensíveis.',
});

// ---------- Markdown ----------

export async function formatMarkdown(md: string, options: { proseWrap: 'preserve' | 'always' | 'never'; width: number }): Promise<string> {
  if (md.trim() === '') throw new ToolError('Entrada vazia');
  const prettier = await import('prettier/standalone');
  const markdown = (await import('prettier/plugins/markdown')).default;
  try {
    return await prettier.format(md, { parser: 'markdown', plugins: [markdown], proseWrap: options.proseWrap, printWidth: options.width });
  } catch (e) {
    throw new ToolError(`Não foi possível formatar o Markdown: ${e instanceof Error ? e.message.split('\n')[0] : 'erro de sintaxe'}`);
  }
}

export const markdownFormatterTool = defineTool({
  id: 'markdown',
  name: 'Formatador de Markdown',
  description: 'Padroniza listas, títulos, tabelas, espaçamento e quebras de linha em documentos Markdown',
  category: 'formatadores',
  keywords: ['markdown', 'md', 'formatar', 'readme', 'documentação', 'listas', 'tabelas', 'prettier'],
  icon: '📝',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    markdown: z.string().max(MAX).default(''),
    proseWrap: z.enum(['preserve', 'always', 'never']).default('preserve'),
    width: z.number().int().min(20).max(200).default(80),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ markdown, proseWrap, width }) => ({ result: await formatMarkdown(markdown, { proseWrap, width }) }),
  fields: {
    markdown: { ...textHint, label: 'Markdown' },
    proseWrap: { label: 'Quebra de linhas dos parágrafos', optionLabels: { preserve: 'Manter como está', always: 'Quebrar na largura', never: 'Unir em uma linha' } },
    width: { label: 'Largura (colunas)', help: 'Usada quando a quebra de linhas está ativa.' },
  },
  outputLabels: { result: 'Markdown formatado' },
  downloads: [{ field: 'result', fileName: 'documento.md', mimeType: 'text/markdown', label: 'Baixar .md' }],
  examples: [{ description: 'Lista com marcadores diferentes', input: { markdown: '# Título\n* a\n* b\n\n\n\ntexto   com  espaços', proseWrap: 'preserve', width: 80 }, output: { result: '# Título\n\n- a\n- b\n\ntexto com espaços\n' } }],
  documentation:
    'Usa o Prettier para normalizar o Markdown: marcadores de lista consistentes, linhas em branco entre blocos, tabelas alinhadas e espaços repetidos removidos. O conteúdo textual e a estrutura são preservados. Nada é enviado a servidores.',
});
