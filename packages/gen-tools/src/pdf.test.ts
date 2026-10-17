import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { unzipSync, unzlibSync } from 'fflate';
import { base64ToBytes, bytesToBase64 } from '@esc/gen-core';
import {
  compressPdfTool, encodeJpeg, encodePng, expandRanges, formatPageLabel, imagesToPdfTool, isPdfBytes, mergePdfTool, numberPagesTool, parsePageRanges, pdfToJpgTool, protectPdfTool,
  splitPdfTool, unlockPdfTool, visualToUser,
} from './index.js';
import type { RasterImage } from './index.js';

type Tool = { run: (i: unknown) => Promise<unknown> };
type Res = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string } };
const call = async (t: Tool, input: unknown) => (await t.run(input)) as Res;
const ok = async (t: Tool, input: unknown) => {
  const r = await call(t, input);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};
const errorOf = async (t: Tool, input: unknown) => {
  const r = await call(t, input);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error.message;
};

const file = (name: string, bytes: Uint8Array) => ({ name, type: 'application/pdf', data: bytesToBase64(bytes) });

async function makePdf(pages: number, label = 'P'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([300, 200]).drawText(`${label}${i}`, { x: 20, y: 100, font, size: 20 });
  return doc.save();
}

const pageCount = async (b: Uint8Array, password?: string) => (await PDFDocument.load(b, password ? { password } : {})).getPageCount();
/** Texto de todos os fluxos de conteúdo (descomprimindo FlateDecode), para conferir o que foi desenhado. */
async function drawnText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const parts: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const contents = (obj as { getContents?: () => Uint8Array }).getContents?.();
    if (!contents) continue;
    let data = contents;
    try { data = unzlibSync(contents); } catch { /* já sem compressão */ }
    parts.push(new TextDecoder('latin1').decode(data));
  }
  return parts.join('\n');
}
const out = (d: Record<string, unknown>, key = 'pdf') => base64ToBytes(String(d[key]));

function photo(width: number, height: number): RasterImage {
  const data = new Uint8Array(width * height * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; // ruído: JPEG grande e comprimível
    data[i] = (seed >> 8) & 255;
    data[i + 1] = (seed >> 12) & 255;
    data[i + 2] = (seed >> 16) & 255;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe('intervalos de páginas', () => {
  it('interpreta vírgulas, hífens e intervalos abertos', () => {
    expect(parsePageRanges('1-3, 5, 8-', 10)).toEqual([[1, 3], [5, 5], [8, 10]]);
    expect(parsePageRanges('-3', 10)).toEqual([[1, 3]]);
    expect(parsePageRanges(' 2 ', 2)).toEqual([[2, 2]]);
    expect(expandRanges([[1, 3], [5, 5]])).toEqual([1, 2, 3, 5]);
    expect(expandRanges(parsePageRanges('3,1,2', 5))).toEqual([3, 1, 2]);
  });
  it('rejeita entradas inválidas com mensagem clara', () => {
    for (const bad of ['', ',', 'abc', '0', '11', '5-2', '1-99', '-', '1--3']) expect(() => parsePageRanges(bad, 10), bad).toThrow();
    expect(() => parsePageRanges('11', 10)).toThrow('fora das páginas');
    expect(() => parsePageRanges('5-2', 10)).toThrow('invertido');
  });
});

describe('unir PDFs', () => {
  it('junta na ordem recebida e mantém o conteúdo', async () => {
    const r = await ok(mergePdfTool, { files: [file('a.pdf', await makePdf(2, 'A')), file('b.pdf', await makePdf(3, 'B'))] });
    expect(r.pages).toBe(5);
    expect(await pageCount(out(r))).toBe(5);
    expect(isPdfBytes(out(r))).toBe(true);
    const doc = await PDFDocument.load(out(r));
    expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 200 });
  });
  it('valida quantidade, tipo real e arquivos corrompidos', async () => {
    const pdf = file('a.pdf', await makePdf(1));
    await errorOf(mergePdfTool, { files: [pdf] });
    expect(await errorOf(mergePdfTool, { files: [pdf, { name: 'falso.pdf', type: 'application/pdf', data: bytesToBase64(new TextEncoder().encode('isso nao e pdf')) }] })).toContain('não é um PDF');
    const broken = new TextEncoder().encode('%PDF-1.4\nlixo sem estrutura');
    expect(await errorOf(mergePdfTool, { files: [pdf, file('x.pdf', broken)] })).toContain('corrompido');
    expect(await errorOf(mergePdfTool, { files: [pdf, { name: 'v.pdf', type: 'application/pdf', data: '!!!' }] })).toBeTruthy();
  });
  it('recusa PDF protegido por senha com orientação', async () => {
    const doc = await PDFDocument.load(await makePdf(1));
    doc.encrypt({ userPassword: 'abcd', ownerPassword: 'owner' });
    const enc = file('enc.pdf', await doc.save());
    expect(await errorOf(mergePdfTool, { files: [enc, enc] })).toContain('protegido por senha');
  });
});

describe('dividir PDF', () => {
  it('extrai páginas na ordem informada', async () => {
    const r = await ok(splitPdfTool, { file: file('doc.pdf', await makePdf(6)), mode: 'extract', pages: '3,1,5-6' });
    expect(r.pages).toBe(4);
    expect(await pageCount(out(r))).toBe(4);
    expect(r.fileName).toBe('doc-paginas.pdf');
    expect(r.zip).toBe('');
  });
  it('gera um ZIP com um arquivo por página, por grupo ou por intervalo', async () => {
    const source = file('Meu Doc.pdf', await makePdf(5));
    const each = await ok(splitPdfTool, { file: source, mode: 'each' });
    const files = unzipSync(out(each, 'zip'));
    expect(Object.keys(files)).toHaveLength(5);
    expect(Object.keys(files)[0]).toBe('Meu Doc_parte-001_pagina-1.pdf');
    for (const bytes of Object.values(files)) expect(await pageCount(bytes)).toBe(1);

    const every = unzipSync(out(await ok(splitPdfTool, { file: source, mode: 'every', every: 2 }), 'zip'));
    expect(Object.values(every).length).toBe(3);
    expect(await Promise.all(Object.values(every).map((b) => pageCount(b)))).toEqual([2, 2, 1]);

    const ranges = unzipSync(out(await ok(splitPdfTool, { file: source, mode: 'ranges', pages: '1-2, 4' }), 'zip'));
    expect(Object.keys(ranges)).toEqual(['Meu Doc_parte-001_paginas-1-2.pdf', 'Meu Doc_parte-002_pagina-4.pdf']);
  });
  it('páginas fora do documento geram erro', async () => {
    expect(await errorOf(splitPdfTool, { file: file('a.pdf', await makePdf(3)), mode: 'extract', pages: '4' })).toContain('fora das páginas');
    await errorOf(splitPdfTool, { file: file('a.pdf', await makePdf(3)), every: 0 });
  });
});

describe('numerar páginas', () => {
  it('desenha o texto em cada página', async () => {
    const r = await ok(numberPagesTool, { file: file('a.pdf', await makePdf(3)), template: 'Página {n} de {total}', startAt: 5 });
    const bytes = out(r);
    expect(await pageCount(bytes)).toBe(3);
    // Sem compressão do fluxo de conteúdo não dá para ler; confirma pelo tamanho do conteúdo e pelas fontes.
    const doc = await PDFDocument.load(bytes);
    const content = doc.getPage(2).node.Contents()!;
    expect(content).toBeTruthy();
    expect(formatPageLabel('Página {n} de {total}', 5, 3)).toBe('Página 5 de 3');
    expect(r.summary).toContain('3 página(s)');
  });
  it('o texto numerado aparece no conteúdo da página (fluxo descomprimido)', async () => {
    const r = await ok(numberPagesTool, { file: file('a.pdf', await makePdf(2)), template: 'N{n}', position: 'top-right' });
    const raw = await drawnText(out(r));
    expect(raw).toContain('<4E31> Tj');
    expect(raw).toContain('<4E32> Tj');
  });
  it('pular a capa e posicionar em página girada', async () => {
    const r = await ok(numberPagesTool, { file: file('a.pdf', await makePdf(3)), template: 'X{n}', skipFirst: true, startAt: 1 });
    const raw = await drawnText(out(r));
    expect(raw).toContain('<5831> Tj');
    expect(raw).toContain('<5832> Tj');
    expect(raw).not.toContain('<5833> Tj');
    expect(visualToUser(0, 300, 200, 10, 20)).toEqual({ x: 10, y: 20 });
    expect(visualToUser(90, 300, 200, 10, 20)).toEqual({ x: 280, y: 10 });
    expect(visualToUser(180, 300, 200, 10, 20)).toEqual({ x: 290, y: 180 });
    expect(visualToUser(270, 300, 200, 10, 20)).toEqual({ x: 20, y: 190 });
    expect(visualToUser(-90, 300, 200, 10, 20)).toEqual(visualToUser(270, 300, 200, 10, 20));
  });
  it('rejeita formatos com caracteres que a fonte não suporta', async () => {
    expect(await errorOf(numberPagesTool, { file: file('a.pdf', await makePdf(1)), template: '第{n}页' })).toContain('caracteres');
    await errorOf(numberPagesTool, { file: file('a.pdf', await makePdf(1)), template: '' });
    await errorOf(numberPagesTool, { file: file('a.pdf', await makePdf(1)), fontSize: 2 });
  });
});

describe('imagens para PDF', () => {
  it('uma página por imagem, com orientação automática e proporção preservada', async () => {
    const wide = encodeJpeg(photo(80, 40), 80);
    const tall = encodePng(photo(30, 60));
    const r = await ok(imagesToPdfTool, { images: [{ name: 'a.jpg', type: 'image/jpeg', data: bytesToBase64(wide) }, { name: 'b.png', type: 'image/png', data: bytesToBase64(tall) }] });
    const doc = await PDFDocument.load(out(r));
    expect(doc.getPageCount()).toBe(2);
    const [p1, p2] = [doc.getPage(0).getSize(), doc.getPage(1).getSize()];
    expect(p1.width).toBeGreaterThan(p1.height); // paisagem
    expect(p2.height).toBeGreaterThan(p2.width); // retrato
    expect(Math.round(p2.width)).toBe(595);
  });
  it('modo "do tamanho da imagem" usa o dpi informado', async () => {
    const img = encodeJpeg(photo(300, 150), 80);
    const doc = await PDFDocument.load(out(await ok(imagesToPdfTool, { images: [{ name: 'a.jpg', type: 'image/jpeg', data: bytesToBase64(img) }], pageSize: 'fit', dpi: 150 })));
    expect(doc.getPage(0).getSize()).toEqual({ width: 144, height: 72 });
  });
  it('rejeita arquivos que não são imagens (mesmo com extensão .jpg) e margem absurda', async () => {
    const fake = { name: 'x.jpg', type: 'image/jpeg', data: bytesToBase64(new TextEncoder().encode('%PDF-1.4 nao sou imagem')) };
    expect(await errorOf(imagesToPdfTool, { images: [fake] })).toContain('não é uma imagem');
    const img = { name: 'a.jpg', type: 'image/jpeg', data: bytesToBase64(encodeJpeg(photo(20, 20), 80)) };
    await errorOf(imagesToPdfTool, { images: [img], marginMm: 120 });
    await errorOf(imagesToPdfTool, { images: [] });
  });
});

describe('comprimir PDF', () => {
  async function pdfWithPhoto(width: number, height: number, quality: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const embedded = await doc.embedJpg(encodeJpeg(photo(width, height), quality));
    doc.addPage([400, 300]).drawImage(embedded, { x: 0, y: 0, width: 400, height: 300 });
    doc.setTitle('Título secreto');
    doc.setAuthor('Autor Fulano');
    return doc.save();
  }

  it('reduz o tamanho recomprimindo e redimensionando a imagem, e remove metadados', async () => {
    const original = await pdfWithPhoto(1200, 900, 95);
    const r = await ok(compressPdfTool, { file: file('foto.pdf', original), quality: 40, maxSide: 600 });
    expect(r.imagesRecompressed).toBe(1);
    expect(Number(r.sizeBytes)).toBeLessThan(original.length / 2);
    expect(Number(r.savedPercent)).toBeGreaterThan(50);
    const doc = await PDFDocument.load(out(r));
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle() ?? '').toBe('');
    expect(doc.getAuthor() ?? '').toBe('');
    expect(new TextDecoder('latin1').decode(out(r))).not.toContain('Autor Fulano');
  });

  it('sem ganho, devolve o arquivo original em vez de um maior', async () => {
    const original = await makePdf(1);
    const r = await ok(compressPdfTool, { file: file('texto.pdf', original) });
    expect(r.imagesRecompressed).toBe(0);
    expect(Number(r.sizeBytes)).toBeLessThanOrEqual(original.length);
    expect(String(r.summary)).toMatch(/otimizado|menor/);
  });

  it('valida parâmetros', async () => {
    const f = file('a.pdf', await makePdf(1));
    await errorOf(compressPdfTool, { file: f, quality: 5 });
    await errorOf(compressPdfTool, { file: f, maxSide: 100 });
  });
});

describe('proteger e remover senha', () => {
  it('criptografa com AES-256: exige senha, aceita a certa e recusa a errada', async () => {
    const r = await ok(protectPdfTool, { file: file('a.pdf', await makePdf(2)), password: 'segredo123', allowCopy: false });
    const enc = out(r);
    const raw = new TextDecoder('latin1').decode(enc);
    expect(raw).toContain('/Encrypt');
    expect(raw).toMatch(/\/V 5/);
    await expect(PDFDocument.load(enc)).rejects.toThrow(/encrypted/i);
    await expect(PDFDocument.load(enc, { password: 'errada' })).rejects.toThrow(/password/i);
    expect(await pageCount(enc, 'segredo123')).toBe(2);
    expect(String(r.ownerPasswordNote)).toContain('aleatória');
  });

  it('as duas ferramentas fecham o ciclo: protege e depois remove a senha', async () => {
    const original = await makePdf(3, 'Z');
    const protectedPdf = out(await ok(protectPdfTool, { file: file('a.pdf', original), password: 'abcd1234', ownerPassword: 'dono1234' }));
    expect(await errorOf(unlockPdfTool, { file: file('p.pdf', protectedPdf), password: 'nao-e-essa' })).toBe('Senha incorreta');
    expect(await errorOf(unlockPdfTool, { file: file('p.pdf', protectedPdf), password: '' })).toBe('Senha incorreta');
    const open = out(await ok(unlockPdfTool, { file: file('p.pdf', protectedPdf), password: 'abcd1234' }));
    expect(new TextDecoder('latin1').decode(open)).not.toContain('/Encrypt');
    expect(await pageCount(open)).toBe(3);
    expect(await pageCount(await ok(unlockPdfTool, { file: file('p.pdf', protectedPdf), password: 'dono1234' }).then((d) => out(d)))).toBe(3);
  });

  it('senhas curtas e arquivos falsos são recusados', async () => {
    await errorOf(protectPdfTool, { file: file('a.pdf', await makePdf(1)), password: 'abc' });
    expect(await errorOf(unlockPdfTool, { file: { name: 'x.pdf', type: '', data: bytesToBase64(new TextEncoder().encode('texto')) }, password: 'a' })).toContain('não é um PDF');
  });

  it('PDF sem senha pode ser "desbloqueado" sem erro (cópia limpa)', async () => {
    expect(await pageCount(out(await ok(unlockPdfTool, { file: file('a.pdf', await makePdf(2)), password: '' })))).toBe(2);
  });
});

describe('PDF para JPG', () => {
  it('declara-se somente de navegador e avisa quando executado sem canvas', async () => {
    expect(pdfToJpgTool.modes).toEqual(['browser']);
    expect(await errorOf(pdfToJpgTool, { file: file('a.pdf', await makePdf(1)) })).toContain('navegador');
  });
});
