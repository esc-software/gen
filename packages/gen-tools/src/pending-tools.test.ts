import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { base64ToBytes, bytesToBase64 } from '@esc/gen-core';
import {
  FUEL_FACTORS, GRID_FACTORS, bankAccountTool, bbAccountDigit, bbAgencyDigit, bodyFontSize, bradescoAccountDigit, bradescoAgencyDigit, buildBlocks, carbonFootprintTool, checkAccount,
  convertCurrency, currencyTool, fuelEmission, groupLines, htmlToBlocks, itauAccountDigit, pdfToWordTool, publicIpTool, resetRatesCache, setRemoteClient, wordToPdfTool,
} from './index.js';

type Run = { run: (input: unknown) => Promise<unknown> };
type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string } };
const call = async (tool: Run, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: Run, input: unknown) => {
  const r = await call(tool, input);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};
const fails = async (tool: Run, input: unknown, fragment?: string) => {
  const r = await call(tool, input);
  expect(r.ok, JSON.stringify(input).slice(0, 200)).toBe(false);
  if (!r.ok && fragment) expect(r.error.message).toContain(fragment);
};

// ---------- conta bancária ----------

describe('validador de conta bancária', () => {
  it('Banco do Brasil: exemplo publicado (agência 1584-9, conta 00210169-6)', () => {
    expect(bbAgencyDigit('1584')).toBe('9');
    expect(bbAccountDigit('00210169')).toBe('6');
    expect(bbAccountDigit('210169')).toBe('6');
  });

  it('Banco do Brasil: resto que dá 10 vira X e 11 vira 0', () => {
    // 0000000 + 1: soma 2 → 11 − 2 = 9; busca um caso de X e um de 0 entre contas possíveis.
    const seen = new Set<string>();
    for (let n = 0; n < 3000 && seen.size < 3; n++) seen.add(bbAccountDigit(String(n).padStart(8, '0')) === 'X' ? 'X' : bbAccountDigit(String(n).padStart(8, '0')) === '0' ? '0' : 'n');
    expect(seen.has('X')).toBe(true);
    expect(seen.has('0')).toBe(true);
    // A soma de 11 dá resto 0, logo 11 − 0 = 11, que vira 0; a de 12, resto 1, dá 10, que vira X.
    expect(bbAgencyDigit('0000')).toBe('0');
    expect(bbAgencyDigit('0001')).toBe('9');
  });

  it('Bradesco: exemplos de conta (dígito 2, P, 0 e 1) e de agência (1425-7)', () => {
    expect(bradescoAccountDigit('0238069')).toBe('2');
    expect(bradescoAccountDigit('0301357')).toBe('P');
    expect(bradescoAccountDigit('0325620')).toBe('0');
    expect(bradescoAccountDigit('0284025')).toBe('1');
    expect(bradescoAgencyDigit('1425')).toBe('7');
  });

  it('Itaú: agência 2545, conta 02366-1', () => {
    expect(itauAccountDigit('2545', '02366')).toBe('1');
    expect(itauAccountDigit('2545', '2366')).toBe('1');
  });

  it('valida a conta inteira e acusa dígito errado', async () => {
    expect(await data(bankAccountTool, { bank: 'bb', agency: '1584-9', account: '00210169-6' })).toMatchObject({ valid: true, agency: '1584-9', account: '00210169-6' });
    expect(await data(bankAccountTool, { bank: 'bb', agency: '1584', account: '002101696' })).toMatchObject({ valid: true });
    expect(await data(bankAccountTool, { bank: 'bb', agency: '1584-9', account: '00210169-7' })).toMatchObject({ valid: false, expectedAccountDigit: '6' });
    expect(await data(bankAccountTool, { bank: 'bb', agency: '1584-8', account: '00210169-6' })).toMatchObject({ valid: false, expectedAgencyDigit: '9' });
    expect(await data(bankAccountTool, { bank: 'bradesco', agency: '1425', account: '0238069-2' })).toMatchObject({ valid: true });
    expect(await data(bankAccountTool, { bank: 'bradesco', agency: '1425-7', account: '0301357-P' })).toMatchObject({ valid: true });
    expect(await data(bankAccountTool, { bank: 'itau', agency: '2545', account: '02366-1' })).toMatchObject({ valid: true });
  });

  it('sem o dígito, calcula qual é, mas não dá como válida', async () => {
    const d = await data(bankAccountTool, { bank: 'bb', agency: '1584', account: '210169' });
    expect(d).toMatchObject({ valid: false, expectedAccountDigit: '6' });
    expect(String(d.message)).toContain('faltou o dígito');
  });

  it('outro banco só confere o formato e avisa', async () => {
    const d = await data(bankAccountTool, { bank: 'other', agency: '0001', account: '12345-6' });
    expect(d).toMatchObject({ valid: true });
    expect(String(d.message)).toContain('não há regra pública');
    expect(checkAccount('other', '1', '12').valid).toBe(false);
  });

  it('recusa entradas malformadas', async () => {
    await fails(bankAccountTool, { bank: 'bb', agency: '', account: '1' }, 'agência');
    await fails(bankAccountTool, { bank: 'bb', agency: '158', account: '1-1' }, '4 dígitos');
    await fails(bankAccountTool, { bank: 'bb', agency: '1584', account: 'abc' });
    await fails(bankAccountTool, { bank: 'itau', agency: '2545-1', account: '02366-1' }, 'não tem dígito');
    await fails(bankAccountTool, { bank: 'bradesco', agency: '1425', account: '123456789-1' }, 'até 7 dígitos');
  });

  it('gerador de conta fictícia e validador convivem: nenhuma entrada quebra', async () => {
    for (const bank of ['bb', 'bradesco', 'itau'] as const) {
      for (let i = 0; i < 200; i++) {
        const account = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
        const dv = bank === 'bb' ? bbAccountDigit(account) : bank === 'bradesco' ? bradescoAccountDigit(account) : itauAccountDigit('1234', account.slice(-5));
        const acc = bank === 'itau' ? account.slice(-5) : account;
        expect(checkAccount(bank, '1234', `${acc}-${dv}`).valid, `${bank} ${acc}-${dv}`).toBe(true);
      }
    }
  });
});

// ---------- pegada de carbono ----------

describe('pegada de carbono', () => {
  it('energia: kWh vezes o fator anual do MCTI', async () => {
    const d = await data(carbonFootprintTool, { period: 'month', electricityKwh: 100, gridYear: 2024, fuel: 'none', fuelAmount: 0, distanceKm: 0, kmPerUnit: 10, lpgKg: 0, ethanolSharePercent: 30, biodieselSharePercent: 15 });
    expect(d.electricityKg).toBeCloseTo(100 * 0.0545, 2);
    expect(d.totalKg).toBeCloseTo(5.45, 2);
    expect(d.perYearKg).toBeCloseTo(65.4, 1);
  });

  it('fatores oficiais conferem com a planilha do MCTI', () => {
    expect(GRID_FACTORS[2023]).toBe(0.0385);
    expect(GRID_FACTORS[2024]).toBe(0.0545);
    expect(GRID_FACTORS[2025]).toBe(0.0461);
    expect(FUEL_FACTORS.gasoline.co2).toBe(2.212);
    expect(FUEL_FACTORS.diesel.co2).toBe(2.603);
  });

  it('gasolina C: só a parte fóssil conta, o etanol anidro entra como biogênico', () => {
    const e = fuelEmission('gasoline', 10, 30, 15);
    // 7 L de gasolina pura: (2,212 + 0,00081×28 + 0,00026×265) × 7; 3 L de etanol anidro: só CH4 e N2O.
    const pure = (2.212 + 0.00081 * 28 + 0.00026 * 265) * 7;
    const eth = (0.00022 * 28 + 0.00001 * 265) * 3;
    expect(e.fossilKg).toBeCloseTo(pure + eth, 6);
    expect(e.biogenicKg).toBeCloseTo(1.526 * 3, 6);
    const none = fuelEmission('gasoline', 10, 0, 15);
    expect(none.biogenicKg).toBe(0);
    expect(none.fossilKg).toBeGreaterThan(e.fossilKg);
  });

  it('diesel com biodiesel, etanol hidratado e GNV', () => {
    const d = fuelEmission('diesel', 100, 30, 15);
    expect(d.biogenicKg).toBeCloseTo(2.431 * 15, 6);
    expect(fuelEmission('ethanol', 10, 30, 15).biogenicKg).toBeCloseTo(14.57, 6);
    expect(fuelEmission('cng', 10, 30, 15).fossilKg).toBeCloseTo(10 * (1.999 + 0.00339 * 28 + 0.00011 * 265), 6);
    expect(fuelEmission('none', 10, 30, 15)).toEqual({ fossilKg: 0, biogenicKg: 0 });
  });

  it('usa a distância quando o consumo não é informado, e o consumo quando é', async () => {
    const base = { period: 'month', electricityKwh: 0, gridYear: 2025, fuel: 'gasoline', kmPerUnit: 10, lpgKg: 0, ethanolSharePercent: 0, biodieselSharePercent: 0 };
    const byDistance = await data(carbonFootprintTool, { ...base, fuelAmount: 0, distanceKm: 100 });
    const byLiters = await data(carbonFootprintTool, { ...base, fuelAmount: 10, distanceKm: 9999 });
    expect(byDistance.liters).toBe(10);
    expect(byDistance.fuelKg).toBe(byLiters.fuelKg);
  });

  it('gás de cozinha e projeção anual', async () => {
    const d = await data(carbonFootprintTool, { period: 'month', electricityKwh: 0, gridYear: 2025, fuel: 'none', fuelAmount: 0, distanceKm: 0, kmPerUnit: 10, lpgKg: 13, ethanolSharePercent: 30, biodieselSharePercent: 15 });
    expect(d.lpgKg).toBeCloseTo(13 * (2.932 + 0.00288 * 28 + 0.00001 * 265), 1);
    expect(d.perYearKg).toBeCloseTo((d.totalKg as number) * 12, 0);
    const year = await data(carbonFootprintTool, { period: 'year', electricityKwh: 0, gridYear: 2025, fuel: 'none', fuelAmount: 0, distanceKm: 0, kmPerUnit: 10, lpgKg: 13, ethanolSharePercent: 30, biodieselSharePercent: 15 });
    expect(year.perYearKg).toBe(year.totalKg);
  });

  it('recusa ano sem fator e valores negativos', async () => {
    await fails(carbonFootprintTool, { gridYear: 1999 });
    await fails(carbonFootprintTool, { electricityKwh: -1 });
    await fails(carbonFootprintTool, { fuel: 'gasoline', fuelAmount: 0, distanceKm: 100, kmPerUnit: 0 }, 'autonomia');
  });
});

// ---------- IP público e moedas ----------

describe('ferramentas que usam a API', () => {
  afterEach(() => {
    setRemoteClient(undefined);
    resetRatesCache();
  });

  const rates = {
    date: '2026-10-16',
    bulletin: 'Fechamento PTAX',
    source: 'Banco Central do Brasil, PTAX',
    rates: [
      { code: 'USD', name: 'Dólar', buy: 5.0, sell: 5.2 },
      { code: 'EUR', name: 'Euro', buy: 5.5, sell: 5.7 },
      { code: 'JPY', name: 'Iene', buy: 0.03, sell: 0.034 },
    ],
  };

  it('sem cliente da API, avisa que só funciona no site (e não quebra)', async () => {
    await fails(publicIpTool, {}, 'só funciona no site');
    await fails(currencyTool, { amount: 1, from: 'USD', to: 'BRL', kind: 'average' }, 'só funciona no site');
  });

  it('IP público: mostra o endereço e a versão que a API devolveu', async () => {
    const paths: string[] = [];
    setRemoteClient({ getJson: async (p) => (paths.push(p), { ip: '203.0.113.7', version: 4 }) });
    const d = await data(publicIpTool, {});
    expect(d).toMatchObject({ ip: '203.0.113.7', version: 'IPv4' });
    expect(paths).toEqual(['/v1/ip']);
    setRemoteClient({ getJson: async () => ({ ip: '2001:db8::1', version: 6 }) });
    expect((await data(publicIpTool, {})).version).toBe('IPv6');
  });

  it('IP público: resposta estranha ou erro de rede viram mensagem amigável', async () => {
    setRemoteClient({ getJson: async () => ({ ip: 42 }) });
    await fails(publicIpTool, {}, 'inesperado');
    setRemoteClient({ getJson: async () => { throw new Error('boom: detalhe interno'); } });
    const r = await call(publicIpTool, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).not.toContain('boom');
  });

  it('moedas: converte pela média, compra ou venda e passa pelo real entre duas estrangeiras', async () => {
    setRemoteClient({ getJson: async () => rates });
    const usd = await data(currencyTool, { amount: 100, from: 'USD', to: 'BRL', kind: 'average' });
    expect(usd).toMatchObject({ result: '510,00 BRL', date: '16/10/2026', bulletin: 'Fechamento PTAX' });
    expect((await data(currencyTool, { amount: 100, from: 'USD', to: 'BRL', kind: 'buy' })).result).toBe('500,00 BRL');
    expect((await data(currencyTool, { amount: 100, from: 'USD', to: 'BRL', kind: 'sell' })).result).toBe('520,00 BRL');
    expect((await data(currencyTool, { amount: 510, from: 'BRL', to: 'USD', kind: 'average' })).result).toBe('100,00 USD');
    const cross = await data(currencyTool, { amount: 100, from: 'USD', to: 'EUR', kind: 'average' });
    expect(cross.result).toBe(`${(100 * 5.1 / 5.6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`);
    expect((await data(currencyTool, { amount: 7, from: 'EUR', to: 'EUR', kind: 'average' })).result).toBe('7,00 EUR');
  });

  it('moedas: matemática pura de conversão e moeda ausente', async () => {
    expect(convertCurrency(10, 'USD', 'BRL', rates, 'sell').result).toBeCloseTo(52, 9);
    expect(convertCurrency(52, 'BRL', 'USD', rates, 'sell').result).toBeCloseTo(10, 9);
    setRemoteClient({ getJson: async () => ({ ...rates, rates: rates.rates.filter((r) => r.code !== 'EUR') }) });
    await fails(currencyTool, { amount: 1, from: 'EUR', to: 'BRL', kind: 'average' }, 'EUR');
  });

  it('moedas: guarda a cotação e só consulta a API uma vez', async () => {
    let calls = 0;
    setRemoteClient({ getJson: async () => (calls++, rates) });
    for (let i = 0; i < 5; i++) await data(currencyTool, { amount: i + 1, from: 'USD', to: 'BRL', kind: 'average' });
    expect(calls).toBe(1);
  });

  it('moedas: resposta fora do formato é recusada', async () => {
    setRemoteClient({ getJson: async () => ({ date: 'ontem', rates: [] }) });
    await fails(currencyTool, { amount: 1, from: 'USD', to: 'BRL', kind: 'average' }, 'inesperado');
  });
});

// ---------- PDF para Word ----------

async function makePdf(build: (draw: (text: string, x: number, y: number, size: number) => void, newPage: () => void) => void): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]);
  build(
    (text, x, y, size) => page.drawText(text, { x, y, size, font }),
    () => {
      page = doc.addPage([595, 842]);
    }
  );
  return bytesToBase64(await doc.save());
}

const wordXml = async (b64: string) => {
  const files = unzipSync(base64ToBytes(b64));
  return new TextDecoder().decode(files['word/document.xml']);
};

describe('PDF para Word', () => {
  it('agrupa itens em linhas e linhas em blocos', () => {
    const lines = groupLines([
      { str: 'Olá', x: 50, y: 700, width: 20, size: 11 },
      { str: 'mundo', x: 74, y: 700.5, width: 30, size: 11 },
      { str: 'Título', x: 50, y: 740, width: 60, size: 24 },
      { str: 'segunda', x: 50, y: 686, width: 40, size: 11 },
      { str: 'linha.', x: 92, y: 686, width: 30, size: 11 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Título', 'Olá mundo', 'segunda linha.']);
    expect(bodyFontSize(lines)).toBe(11);
    const blocks = buildBlocks(lines, 11);
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Título' },
      { kind: 'paragraph', text: 'Olá mundo segunda linha.' },
    ]);
  });

  it('parágrafos separados por espaço maior, listas e hifenização', () => {
    const lines = [
      { text: 'Primeiro parágrafo con-', y: 700, size: 11 },
      { text: 'tinua aqui.', y: 686, size: 11 },
      { text: 'Segundo parágrafo.', y: 640, size: 11 },
      { text: '• item um', y: 620, size: 11 },
      { text: '• item dois', y: 606, size: 11 },
    ];
    expect(buildBlocks(lines, 11)).toEqual([
      { kind: 'paragraph', text: 'Primeiro parágrafo continua aqui.' },
      { kind: 'paragraph', text: 'Segundo parágrafo.' },
      { kind: 'bullet', text: 'item um' },
      { kind: 'bullet', text: 'item dois' },
    ]);
  });

  it('converte um PDF de verdade em .docx com títulos, parágrafos e quebra de página', async () => {
    const pdf = await makePdf((draw, newPage) => {
      draw('Relatório Anual', 56, 760, 24);
      draw('Este é o primeiro parágrafo do relatório, com acentuação: ação, coração.', 56, 720, 11);
      draw('Continua na linha seguinte do mesmo parágrafo.', 56, 706, 11);
      draw('Segundo parágrafo, separado por um espaço maior.', 56, 660, 11);
      newPage();
      draw('Página dois', 56, 760, 18);
      draw('Texto da segunda página.', 56, 730, 11);
    });
    const d = await data(pdfToWordTool, { file: { name: 'relatorio.pdf', type: 'application/pdf', data: pdf }, pageBreaks: true });
    expect(d).toMatchObject({ fileName: 'relatorio.docx', pages: 2 });
    const xml = await wordXml(d.docx as string);
    expect(xml).toContain('Relatório Anual');
    expect(xml).toContain('Este é o primeiro parágrafo do relatório, com acentuação: ação, coração. Continua na linha seguinte do mesmo parágrafo.');
    expect(xml).toContain('Segundo parágrafo, separado por um espaço maior.');
    expect(xml).toContain('Texto da segunda página.');
    expect(xml).toMatch(/Heading1/);
    expect(xml).toMatch(/w:br w:type="page"/);
    const noBreaks = await data(pdfToWordTool, { file: { name: 'relatorio.pdf', type: 'application/pdf', data: pdf }, pageBreaks: false });
    expect(await wordXml(noBreaks.docx as string)).not.toMatch(/w:br w:type="page"/);
  });

  it('PDF sem texto (escaneado) e arquivos que não são PDF dão mensagem clara', async () => {
    const blank = await makePdf(() => undefined);
    await fails(pdfToWordTool, { file: { name: 'scan.pdf', type: '', data: blank }, pageBreaks: true }, 'OCR');
    await fails(pdfToWordTool, { file: { name: 'x.pdf', type: '', data: bytesToBase64(new TextEncoder().encode('não sou pdf')) }, pageBreaks: true }, 'não é um PDF');
    await fails(pdfToWordTool, { file: { name: 'x.pdf', type: '', data: bytesToBase64(new TextEncoder().encode('%PDF-1.4 lixo lixo lixo')) }, pageBreaks: true });
    await fails(pdfToWordTool, { file: { name: 'x.pdf', type: '', data: '' }, pageBreaks: true });
  });
});

// ---------- Word para PDF ----------

async function makeDocx(): Promise<string> {
  const docx = await import('docx');
  const doc = new docx.Document({
    sections: [
      {
        children: [
          new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Proposta Comercial')] }),
          new docx.Paragraph({ children: [new docx.TextRun('Texto normal com '), new docx.TextRun({ text: 'negrito', bold: true }), new docx.TextRun(' e '), new docx.TextRun({ text: 'itálico', italics: true }), new docx.TextRun(' e acentuação: ação & coração.')] }),
          new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_2, children: [new docx.TextRun('Itens')] }),
          new docx.Paragraph({ bullet: { level: 0 }, children: [new docx.TextRun('Primeiro item')] }),
          new docx.Paragraph({ bullet: { level: 0 }, children: [new docx.TextRun('Segundo item')] }),
          new docx.Table({
            rows: [
              new docx.TableRow({ children: ['Produto', 'Preço'].map((t) => new docx.TableCell({ children: [new docx.Paragraph(t)] })) }),
              new docx.TableRow({ children: ['Caneta', '3,50'].map((t) => new docx.TableCell({ children: [new docx.Paragraph(t)] })) }),
            ],
          }),
          new docx.Paragraph({ children: [new docx.TextRun('Fim ✓ 😀')] }),
        ],
      },
    ],
  });
  return docx.Packer.toBase64String(doc);
}

async function pdfText(b64: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const pdf = await pdfjs.getDocument({ data: base64ToBytes(b64).slice() }).promise;
  const out: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    out.push(content.items.map((i) => ('str' in i ? i.str : '')).join(''));
  }
  return out;
}

describe('Word para PDF', () => {
  it('lê o HTML do mammoth em blocos', () => {
    const blocks = htmlToBlocks('<h1>Título</h1><p>Olá <strong>mundo</strong> &amp; <em>você</em></p><ul><li>a</li><li>b</li></ul><ol><li>x</li></ol><table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>');
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph' });
    const p = blocks[1] as { runs: Array<{ text: string; bold: boolean; italic: boolean }> };
    expect(p.runs.map((r) => r.text).join('')).toBe('Olá mundo & você');
    expect(p.runs.find((r) => r.text === 'mundo')?.bold).toBe(true);
    expect(p.runs.find((r) => r.text === 'você')?.italic).toBe(true);
    expect(blocks.filter((b) => b.kind === 'item').map((b) => (b as { marker: string }).marker)).toEqual(['•', '•', '1.']);
    expect((blocks.at(-1) as { runs: Array<{ text: string }> }).runs[0]?.text).toBe('A | B');
  });

  it('converte um .docx de verdade em PDF com o texto e o estilo', async () => {
    const docx = await makeDocx();
    const d = await data(wordToPdfTool, { file: { name: 'proposta.docx', type: '', data: docx }, fontSize: 11 });
    expect(d).toMatchObject({ fileName: 'proposta.pdf', pages: 1 });
    expect(String(d.summary)).toContain('trocados por "?"');
    const text = (await pdfText(d.pdf as string)).join('\n');
    expect(text).toContain('Proposta Comercial');
    expect(text).toContain('Texto normal com negrito e itálico e acentuação: ação & coração.');
    expect(text).toContain('Primeiro item');
    expect(text).toContain('Produto | Preço');
    expect(text).toContain('Caneta | 3,50');
    expect(text).toContain('Fim ? ?');
    const bytes = base64ToBytes(d.pdf as string);
    expect(new TextDecoder('latin1').decode(bytes.subarray(0, 8))).toContain('%PDF-');
  });

  it('documentos longos viram várias páginas', async () => {
    const docx = await import('docx');
    const paragraphs = Array.from({ length: 120 }, (_, i) => new docx.Paragraph({ children: [new docx.TextRun(`Parágrafo ${i + 1}: ${'palavra '.repeat(40)}`)] }));
    const b64 = await docx.Packer.toBase64String(new docx.Document({ sections: [{ children: paragraphs }] }));
    const d = await data(wordToPdfTool, { file: { name: 'longo.docx', type: '', data: b64 }, fontSize: 11 });
    expect(d.pages as number).toBeGreaterThan(5);
    const pages = await pdfText(d.pdf as string);
    expect(pages.join(' ')).toContain('Parágrafo 120');
  });

  it('recusa .doc antigo, arquivos que não são Word e docx corrompido', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await fails(wordToPdfTool, { file: { name: 'a.doc', type: '', data: bytesToBase64(ole) }, fontSize: 11 }, '.doc');
    await fails(wordToPdfTool, { file: { name: 'a.txt', type: '', data: bytesToBase64(new TextEncoder().encode('oi')) }, fontSize: 11 }, 'não é um .docx');
    const zipNotDocx = bytesToBase64(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]));
    await fails(wordToPdfTool, { file: { name: 'a.docx', type: '', data: zipNotDocx }, fontSize: 11 });
    await fails(wordToPdfTool, { file: { name: 'a.docx', type: '', data: '!!!' }, fontSize: 11 });
  });

  it('um documento só com imagens ou vazio dá erro claro', async () => {
    const docx = await import('docx');
    const empty = await docx.Packer.toBase64String(new docx.Document({ sections: [{ children: [new docx.Paragraph('')] }] }));
    await fails(wordToPdfTool, { file: { name: 'vazio.docx', type: '', data: empty }, fontSize: 11 }, 'não tem texto');
  });
});
