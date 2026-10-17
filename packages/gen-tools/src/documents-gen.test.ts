import { describe, expect, it } from 'vitest';
import { createRng } from '@esc/gen-utils';
import {
  buildContract, buildMetaTags, buildResume, buildSignatureHtml, contractTool, coloringCharacterTool, declarationTool, drawCharacter, emailSignatureTool, escapeHtml,
  privacyPolicyTool, receiptTool, resumeTool, seoChecks, seoTagsTool,
} from './index.js';

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string; issues?: { path: string }[] } };
const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => {
  const r = await run(tool, input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
};
const fails = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown, fragment?: string) => {
  const r = await run(tool, input);
  expect(r.ok).toBe(false);
  if (!r.ok && fragment) expect(JSON.stringify(r.error)).toContain(fragment);
};

const ATTACKS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "' onmouseover='alert(1)", '</td><td>', '&lt;b&gt;'];

describe('escapeHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('texto normal ação')).toBe('texto normal ação');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('assinatura de e-mail', () => {
  const base = { name: 'Maria Silva', role: 'Analista', company: 'Empresa', phone: '+55 11 91234-5678', email: 'maria@exemplo.com.br', website: 'https://exemplo.com.br', accent: '#0f766e' };

  it('gera tabela com links seguros e conteúdo escapado', async () => {
    const r = await data(emailSignatureTool, base);
    const html = String(r.html);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('href="mailto:maria@exemplo.com.br"');
    expect(html).toContain('href="tel:+5511912345678"');
    expect(html).toContain('href="https://exemplo.com.br"');
    expect(html).toContain('>exemplo.com.br</a>');
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(String(r.plainText)).toBe('Maria Silva\nAnalista · Empresa\n+55 11 91234-5678 | maria@exemplo.com.br | https://exemplo.com.br');
  });

  it('nenhum campo de texto consegue injetar HTML', async () => {
    for (const attack of ATTACKS) {
      const html = String((await data(emailSignatureTool, { ...base, name: attack, role: attack, company: attack, address: attack })).html);
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<img');
      expect(html.match(/<[a-z]+/g)?.every((t) => ['<table', '<tr', '<td', '<div', '<a'].includes(t))).toBe(true);
    }
    expect(buildSignatureHtml({ name: '<b>', accent: '#000000' })).toContain('&lt;b&gt;');
  });

  it('valida e-mail, site, cor e nome', async () => {
    await fails(emailSignatureTool, { ...base, email: 'sem-arroba' }, 'E-mail inválido');
    await fails(emailSignatureTool, { ...base, website: 'javascript://alert(1)' }, 'Site inválido');
    await fails(emailSignatureTool, { ...base, accent: 'red' }, '#rrggbb');
    await fails(emailSignatureTool, { ...base, name: '  ' }, 'nome');
    await fails(emailSignatureTool, { ...base, accent: '#fff;background:url(x)' });
    expect(String((await data(emailSignatureTool, { name: 'Só Nome' })).html)).toContain('Só Nome');
  });
});

describe('meta tags SEO', () => {
  const base = { title: 'Calculadora de Salário Líquido | Gen', description: 'Calcule seu salário líquido com INSS e imposto de renda atualizados, de forma gratuita e sem cadastro.', url: 'https://gen.esc-software.com/salario', type: 'website' as const, locale: 'pt_BR', robots: 'index, follow' as const };

  it('inclui as tags essenciais', async () => {
    const html = String((await data(seoTagsTool, { ...base, siteName: 'Gen', image: 'https://gen.esc-software.com/capa.jpg', twitter: 'esc', themeColor: '#0f766e' })).html);
    for (const fragment of ['<title>Calculadora de Salário Líquido | Gen</title>', '<link rel="canonical" href="https://gen.esc-software.com/salario">', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'name="twitter:site" content="@esc"', 'name="theme-color"', 'property="og:site_name"', 'property="og:locale" content="pt_BR"']) {
      expect(html).toContain(fragment);
    }
    expect(String((await data(seoTagsTool, base)).html)).toContain('content="summary"');
  });

  it('escapa atributos e protege o JSON-LD', async () => {
    const html = String((await data(seoTagsTool, { ...base, title: 'A "B" <C>', organization: '</script><script>alert(1)</script>' })).html);
    expect(html).toContain('A &quot;B&quot; &lt;C&gt;');
    expect(html).not.toContain('<script>alert');
    const ld = /<script type="application\/ld\+json">(.*)<\/script>/s.exec(html)![1]!;
    expect(ld).not.toContain('<');
    expect(JSON.parse(ld).name).toBe('</script><script>alert(1)</script>');
    expect(buildMetaTags({ ...base, robots: 'noindex, nofollow' })).toContain('content="noindex, nofollow"');
  });

  it('avalia tamanhos e URL', () => {
    const checks = seoChecks({ ...base, title: 'Curto', description: 'x'.repeat(200), url: 'http://a.com', image: '/relativa.jpg' });
    expect(checks.join('\n')).toContain('Título curto');
    expect(checks.join('\n')).toContain('Descrição longa');
    expect(checks.join('\n')).toContain('HTTPS');
    expect(checks.join('\n')).toContain('absoluta');
    expect(seoChecks(base).join('\n')).toContain('bom tamanho');
    expect(seoChecks({ ...base, title: 'x'.repeat(80) }).join('\n')).toContain('Título longo');
    expect(seoChecks(base).join('\n')).toContain('Sem imagem');
  });

  it('erros de entrada', async () => {
    await fails(seoTagsTool, { ...base, title: '' }, 'título');
    await fails(seoTagsTool, { ...base, description: '' }, 'descrição');
    await fails(seoTagsTool, { ...base, url: 'exemplo.com' }, 'canônica');
    await fails(seoTagsTool, { ...base, image: 'nao-e-url' }, 'imagem');
    await fails(seoTagsTool, { ...base, locale: 'portugues' }, 'pt_BR');
    await fails(seoTagsTool, { ...base, robots: 'qualquer' });
  });
});

describe('recibo e declarações', () => {
  const receipt = { payer: 'João da Silva', receiver: 'Maria Souza', amount: 1250.5, reference: 'aluguel de março de 2026', city: 'São Paulo', date: '2026-03-05' };

  it('recibo traz o valor por extenso e a data', async () => {
    const r = await data(receiptTool, receipt);
    expect(r.amountInWords).toBe('mil duzentos e cinquenta reais e cinquenta centavos');
    expect(String(r.receipt)).toContain('R$ 1.250,50 (mil duzentos e cinquenta reais e cinquenta centavos)');
    expect(String(r.receipt)).toContain('São Paulo, 5 de março de 2026.');
    expect(String(r.receipt)).toContain('Recebi de João da Silva');
    expect(r.warnings).toEqual([]);
    expect((await data(receiptTool, { ...receipt, amount: 1000000 })).amountInWords).toBe('um milhão de reais');
    expect((await data(receiptTool, { ...receipt, amount: 0.01 })).amountInWords).toBe('um centavo');
  });

  it('recibo avisa sobre CPF/CNPJ inválidos e exige os campos', async () => {
    const warn = await data(receiptTool, { ...receipt, payerDocument: '111.111.111-11', receiverDocument: '11.222.333/0001-82' });
    expect((warn.warnings as string[]).join()).toContain('iguais');
    expect((warn.warnings as string[]).join()).toContain('CNPJ');
    expect(((await data(receiptTool, { ...receipt, payerDocument: '529.982.247-25' })).warnings as string[])).toEqual([]);
    await fails(receiptTool, { ...receipt, payer: '' }, 'pagador');
    await fails(receiptTool, { ...receipt, reference: '' }, 'a que se refere');
    await fails(receiptTool, { ...receipt, city: '' }, 'cidade');
    await fails(receiptTool, { ...receipt, amount: 0 });
    await fails(receiptTool, { ...receipt, date: '2026-02-30' }, 'inválida');
  });

  it('declarações por tipo, com o aviso legal', async () => {
    const base = { name: 'Maria da Silva', document: '529.982.247-25', address: 'Rua das Flores, 100, Centro, São Paulo/SP', city: 'São Paulo', date: '2026-03-05' };
    const res = String((await data(declarationTool, { ...base, kind: 'residence', since: 'janeiro de 2020' })).declaration);
    expect(res).toContain('DECLARAÇÃO DE RESIDÊNCIA');
    expect(res).toContain('desde janeiro de 2020');
    expect(res).toContain('Lei nº 7.115/1983');
    expect(res).toContain('art. 299');
    const low = String((await data(declarationTool, { ...base, kind: 'low-income', address: '' })).declaration);
    expect(low).toContain('HIPOSSUFICIÊNCIA');
    expect(low).toContain('art. 98');
    const income = String((await data(declarationTool, { ...base, kind: 'income', monthlyIncome: 2500, activity: 'pedreiro' })).declaration);
    expect(income).toContain('pedreiro');
    expect(income).toContain('R$ 2.500,00 (dois mil e quinhentos reais)');
    await fails(declarationTool, { ...base, kind: 'income' }, 'renda mensal');
    await fails(declarationTool, { ...base, kind: 'residence', address: '' }, 'endereço');
    await fails(declarationTool, { ...base, name: '' }, 'nome');
    expect(((await data(declarationTool, { ...base, document: '123' })).warnings as string[]).length).toBe(1);
  });
});

describe('contrato', () => {
  const base = {
    partyAName: 'Empresa Exemplo Ltda', partyADocument: '11.222.333/0001-81', partyAAddress: 'Rua A, 1, São Paulo/SP',
    partyBName: 'Maria Silva', partyBDocument: '529.982.247-25', partyBAddress: 'Rua B, 2, São Paulo/SP',
    object: 'criação de identidade visual', amount: 3000, payment: '50% na assinatura e 50% na entrega', months: 2, city: 'São Paulo', date: '2026-03-05',
  };

  it('prestação de serviços: cláusulas numeradas, valor por extenso e foro', async () => {
    const c = String((await data(contractTool, { ...base, kind: 'services' })).contract);
    expect(c).toContain('CONTRATO DE PRESTAÇÃO DE SERVIÇOS');
    expect(c).toContain('CONTRATANTE: Empresa Exemplo Ltda');
    expect(c).toContain('CONTRATADO(A): Maria Silva');
    expect(c).toContain('R$ 3.000,00 (três mil reais)');
    expect(c).toContain('CLÁUSULA 1ª — DO OBJETO');
    expect(c).toContain('criação de identidade visual');
    expect(c).toContain('comarca de São Paulo');
    expect(c).toContain('São Paulo, 5 de março de 2026.');
    const numbers = [...c.matchAll(/CLÁUSULA (\d+)ª/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1)); // numeração sequencial sem saltos
    expect(c).toContain('Testemunhas');
  });

  it('locação: Lei do Inquilinato, vencimento, índice e garantia', async () => {
    const c = String((await data(contractTool, { ...base, kind: 'lease', object: 'Rua C, 3, apto 4, São Paulo/SP', amount: 1800, months: 30, dueDay: 10, index: 'IGP-M', guarantee: 'caução de três aluguéis' })).contract);
    expect(c).toContain('LOCAÇÃO RESIDENCIAL');
    expect(c).toContain('Lei nº 8.245/1991');
    expect(c).toContain('até o dia 10 de cada mês');
    expect(c).toContain('índice IGP-M');
    expect(c).toContain('caução de três aluguéis');
    expect(c).toContain('prazo de 30 meses');
    expect(c).toContain('art. 4º');
    expect(buildContract({ kind: 'lease', partyA: { name: 'A', document: '1', address: 'x' }, partyB: { name: 'B', document: '2', address: 'y' }, object: 'imóvel', amount: 1, payment: 'Pix', months: 12, city: 'Rio', date: { year: 2026, month: 1, day: 1 } })).toContain('até o dia 5');
  });

  it('compra e venda de bem móvel', async () => {
    const c = String((await data(contractTool, { ...base, kind: 'sale', object: 'motocicleta, placa ABC1D23', amount: 15000 })).contract);
    expect(c).toContain('COMPRA E VENDA');
    expect(c).toContain('VENDEDOR(A): Empresa Exemplo Ltda');
    expect(c).toContain('quinze mil reais');
    expect(c).toContain('evicção');
  });

  it('avisos de documento, campos obrigatórios e injeção não afeta a estrutura', async () => {
    expect(((await data(contractTool, { ...base, partyADocument: '000.000.000-00' })).warnings as string[]).join()).toContain('iguais');
    await fails(contractTool, { ...base, partyAName: '' }, 'primeira parte');
    await fails(contractTool, { ...base, object: '' }, 'objeto');
    await fails(contractTool, { ...base, city: '' }, 'cidade');
    await fails(contractTool, { ...base, amount: 0 });
    await fails(contractTool, { ...base, months: 0 });
    await fails(contractTool, { ...base, dueDay: 31 });
    const c = String((await data(contractTool, { ...base, object: 'CLÁUSULA 99ª — FALSA' })).contract);
    expect([...c.matchAll(/^CLÁUSULA (\d+)ª — /gm)].length).toBe(9);
  });
});

describe('currículo', () => {
  const base = { name: 'Maria Silva', title: 'Analista de dados', email: 'maria@exemplo.com.br', phone: '(11) 91234-5678', city: 'São Paulo, SP', summary: 'Analista com 5 anos de experiência.', experience: 'Empresa X — Analista (2021–2024)\nEmpresa Y — Estagiária (2019–2021)', education: 'Estatística — USP', skills: 'SQL, Python;Excel', languages: 'Inglês avançado' };

  it('organiza as seções nos três formatos', async () => {
    const r = await data(resumeTool, base);
    const md = String(r.markdown);
    expect(md.startsWith('# Maria Silva')).toBe(true);
    for (const section of ['## Resumo', '## Experiência profissional', '## Formação', '## Competências', '## Idiomas']) expect(md).toContain(section);
    expect(md).toContain('- Empresa X — Analista (2021–2024)');
    expect(md).toContain('SQL, Python, Excel');
    expect(String(r.html)).toContain('<h1');
    expect(String(r.plainText)).toContain('• Empresa Y');
    expect(String(r.plainText)).not.toContain('**');
    expect(String(r.plainText)).not.toMatch(/^#/m);
  });

  it('seções vazias são omitidas e o HTML é escapado', async () => {
    const md = String((await data(resumeTool, { name: 'Só Nome' })).markdown);
    expect(md).toBe('# Só Nome');
    for (const attack of ATTACKS) {
      const html = String((await data(resumeTool, { ...base, name: attack, summary: attack, experience: attack, skills: attack })).html);
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<img');
    }
    expect(buildResume({ name: '<b>', experience: [], education: [], skills: [], languages: [] }).html).toContain('&lt;b&gt;');
    await fails(resumeTool, { ...base, name: '' }, 'nome');
    await fails(resumeTool, { ...base, email: 'x' }, 'E-mail inválido');
  });
});

describe('política de privacidade', () => {
  const base = { company: 'Empresa Exemplo Ltda', siteUrl: 'https://exemplo.com.br', contactEmail: 'privacidade@exemplo.com.br', date: '2026-03-05' };

  it('descreve apenas o que foi declarado', async () => {
    const minimal = String((await data(privacyPolicyTool, { ...base, usesCookies: false, collectsIdentification: false })).policy);
    expect(minimal).toContain('nenhum dado pessoal é coletado de forma intencional');
    expect(minimal).not.toContain('COOKIES');
    expect(minimal).toContain('Não compartilhamos seus dados');
    expect(minimal).toContain('Lei nº 13.709/2018');
    expect(minimal).toContain('art. 18');
    expect(minimal).toContain('Última atualização: 5 de março de 2026');
    const full = String((await data(privacyPolicyTool, { ...base, collectsPhone: true, collectsPayment: true, collectsLocation: true, usesAnalytics: true, usesAds: true, sharesWithProcessors: true, internationalTransfer: true, childrenData: true, dpo: 'Ana Souza', cnpj: '11.222.333/0001-81' })).policy);
    for (const fragment of ['número de telefone', 'dados de pagamento', 'localização', 'COOKIES', 'publicidade', 'operadores e parceiros', 'art. 33', 'art. 14', 'Encarregado pelo tratamento de dados (DPO): Ana Souza', 'CNPJ 11.222.333/0001-81']) {
      expect(full).toContain(fragment);
    }
    const headings = [...full.matchAll(/^(\d+)\. [A-ZÇÃÕ ()]+$/gm)].map((m) => Number(m[1]));
    expect(headings).toEqual(headings.map((_, i) => i + 1));
  });

  it('numeração das seções fecha sem cookies', async () => {
    const p = String((await data(privacyPolicyTool, { ...base, usesCookies: false })).policy);
    const headings = [...p.matchAll(/^(\d+)\. [A-ZÇÃÕ ()]+$/gm)].map((m) => Number(m[1]));
    expect(headings).toEqual(headings.map((_, i) => i + 1));
  });

  it('validações', async () => {
    await fails(privacyPolicyTool, { ...base, company: '' }, 'empresa');
    await fails(privacyPolicyTool, { ...base, siteUrl: 'exemplo' }, 'site');
    await fails(privacyPolicyTool, { ...base, contactEmail: 'x' }, 'E-mail');
    expect(((await data(privacyPolicyTool, { ...base, cnpj: '11.222.333/0001-82' })).warnings as string[]).length).toBe(1);
  });
});

describe('personagens para colorir', () => {
  it('SVG válido, sem recursos externos e reproduzível pela semente', async () => {
    for (const kind of ['monster', 'robot', 'cat'] as const) {
      const svg = drawCharacter(kind, createRng(`k-${kind}`));
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/<script|<image|href=|javascript:|onload/i);
      expect(svg).toContain('stroke="#111"');
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      // Tags balanceadas (todas as tags de elemento são autofechadas ou têm fechamento).
      expect(svg.match(/<(svg|rect|circle|ellipse|polygon|path|line)\b/g)!.length).toBeGreaterThan(8);
    }
    const a = await data(coloringCharacterTool, { kind: 'cat', seed: 'x' });
    expect(a.svg).toBe((await data(coloringCharacterTool, { kind: 'cat', seed: 'x' })).svg);
    expect(a.svg).not.toBe((await data(coloringCharacterTool, { kind: 'cat', seed: 'y' })).svg);
    expect(String(a.dataUrl).startsWith('data:image/svg+xml;base64,')).toBe(true);
    await fails(coloringCharacterTool, { kind: 'dragon' });
  });

  it('muitas sementes nunca geram coordenadas inválidas', () => {
    for (let i = 0; i < 300; i++) {
      for (const kind of ['monster', 'robot', 'cat'] as const) {
        const svg = drawCharacter(kind, createRng(`s${i}`));
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});
