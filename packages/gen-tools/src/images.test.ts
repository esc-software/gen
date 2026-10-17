import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@esc/gen-core';
import { compressImageTool, convertImageTool, decodeImage, detectImageType, encodeJpeg, encodePng, fitCover, photo3x4Tool, resizeImageTool, type RasterImage } from './index.js';

type Tool = { run: (i: unknown) => Promise<unknown> };
type Res = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string } };
const ok = async (t: Tool, i: unknown) => {
  const r = (await t.run(i)) as Res;
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};
const err = async (t: Tool, i: unknown) => {
  const r = (await t.run(i)) as Res;
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error.message;
};

function noise(width: number, height: number, alpha = 255): RasterImage {
  const data = new Uint8Array(width * height * 4);
  let seed = 11;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed >> 8) & 255;
    data[i + 1] = (seed >> 12) & 255;
    data[i + 2] = (seed >> 16) & 255;
    data[i + 3] = alpha;
  }
  return { width, height, data };
}
const f = (bytes: Uint8Array, name = 'foto.jpg') => ({ name, type: 'image/jpeg', data: bytesToBase64(bytes) });
const result = (d: Record<string, unknown>) => base64ToBytes(String(d.image));

describe('comprimir imagem', () => {
  it('reduz o tamanho de um JPEG de alta qualidade', async () => {
    const src = encodeJpeg(noise(300, 300), 98);
    const d = await ok(compressImageTool, { file: f(src), quality: 30 });
    expect(Number(d.sizeBytes)).toBeLessThan(src.length * 0.6);
    expect(detectImageType(result(d))).toBe('jpeg');
    expect(d.fileName).toBe('foto-comprimido.jpg');
    expect(String(d.dataUrl).startsWith('data:image/jpeg;base64,')).toBe(true);
  });
  it('limita o lado maior', async () => {
    const d = await ok(compressImageTool, { file: f(encodeJpeg(noise(400, 200), 90)), maxSide: 100 });
    expect([d.width, d.height]).toEqual([100, 50]);
  });
  it('PNG com transparência continua PNG; PNG opaco vira JPEG menor', async () => {
    const t = await ok(compressImageTool, { file: f(encodePng(noise(200, 200, 128)), 'a.png'), maxSide: 100 });
    expect(detectImageType(result(t))).toBe('png');
    const opaque = encodePng(noise(120, 120));
    const j = await ok(compressImageTool, { file: f(opaque, 'b.png'), quality: 60 });
    expect(detectImageType(result(j))).toBe('jpeg');
    expect(Number(j.sizeBytes)).toBeLessThan(opaque.length);
  });
  it('mantém o original quando não há ganho', async () => {
    const tiny = encodeJpeg(noise(8, 8), 10);
    const d = await ok(compressImageTool, { file: f(tiny), quality: 95 });
    expect(Number(d.sizeBytes)).toBeLessThanOrEqual(tiny.length);
  });
  it('rejeita arquivos falsos e parâmetros inválidos', async () => {
    expect(await err(compressImageTool, { file: f(new TextEncoder().encode('%PDF-1.4 ...')) })).toContain('não é uma imagem');
    await err(compressImageTool, { file: f(encodeJpeg(noise(8, 8), 80)), quality: 99 });
  });
});

describe('redimensionar imagem', () => {
  const src = f(encodeJpeg(noise(200, 100), 90));
  it('por largura, altura, porcentagem e exato', async () => {
    const w = await ok(resizeImageTool, { file: src, mode: 'width', width: 50 });
    expect([w.width, w.height]).toEqual([50, 25]);
    const h = await ok(resizeImageTool, { file: src, mode: 'height', height: 40 });
    expect([h.width, h.height]).toEqual([80, 40]);
    const p = await ok(resizeImageTool, { file: src, mode: 'percent', percent: 25 });
    expect([p.width, p.height]).toEqual([50, 25]);
    const e = await ok(resizeImageTool, { file: src, mode: 'exact', width: 30, height: 90 });
    expect([e.width, e.height]).toEqual([30, 90]);
    const big = await ok(resizeImageTool, { file: src, mode: 'percent', percent: 200 });
    expect([big.width, big.height]).toEqual([400, 200]);
    expect(decodeImage(result(big)).width).toBe(400);
    expect(String(w.fileName)).toBe('foto-50x25.jpg');
  });
  it('exige as medidas do modo escolhido', async () => {
    expect(await err(resizeImageTool, { file: src, mode: 'width' })).toContain('largura');
    expect(await err(resizeImageTool, { file: src, mode: 'exact', width: 10 })).toContain('altura');
    await err(resizeImageTool, { file: src, mode: 'width', width: 0 });
    await err(resizeImageTool, { file: src, mode: 'width', width: 20000 });
  });
  it('PNG mantém formato e transparência', async () => {
    const d = await ok(resizeImageTool, { file: f(encodePng(noise(20, 20, 100)), 'a.png'), mode: 'percent', percent: 50 });
    expect(detectImageType(result(d))).toBe('png');
    expect(decodeImage(result(d)).data[3]).toBe(100);
  });
  it('recusa saída acima do limite de megapixels', async () => {
    expect(await err(resizeImageTool, { file: src, mode: 'exact', width: 9000, height: 9000 })).toContain('megapixels');
  });
});

describe('converter imagem', () => {
  it('PNG → JPG achata a transparência na cor escolhida', async () => {
    const clear: RasterImage = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) };
    const d = await ok(convertImageTool, { file: f(encodePng(clear), 'a.png'), to: 'jpeg', background: '#ff0000', quality: 95 });
    const px = decodeImage(result(d)).data;
    expect(px[0]).toBeGreaterThan(235);
    expect(px[1]).toBeLessThan(25);
    expect(String(d.summary)).toContain('transparência');
    expect(d.mimeType).toBe('image/jpeg');
  });
  it('JPG → PNG preserva os pixels decodificados', async () => {
    const jpg = encodeJpeg(noise(16, 16), 90);
    const d = await ok(convertImageTool, { file: f(jpg), to: 'png' });
    expect(detectImageType(result(d))).toBe('png');
    expect([...decodeImage(result(d)).data]).toEqual([...decodeImage(jpg).data]);
  });
  it('cor de fundo inválida é recusada', async () => {
    await err(convertImageTool, { file: f(encodeJpeg(noise(8, 8), 80)), background: 'vermelho' });
    await err(convertImageTool, { file: f(encodeJpeg(noise(8, 8), 80)), to: 'gif' });
  });
});

describe('foto 3x4', () => {
  it('cálculo do recorte mantém a proporção 3:4 e respeita zoom e deslocamento', () => {
    const a = fitCover(400, 300, 3 / 4, 1, 0, 0);
    expect(a.h).toBe(300);
    expect(a.w).toBeCloseTo(225, 8);
    expect(a.x).toBeCloseTo(87.5, 8);
    const z = fitCover(400, 300, 3 / 4, 2, 0, 0);
    expect(z.w).toBeCloseTo(112.5, 8);
    expect(z.h).toBe(150);
    const left = fitCover(400, 300, 3 / 4, 1, -1, 0);
    expect(left.x).toBe(0);
    const right = fitCover(400, 300, 3 / 4, 1, 1, 0);
    expect(right.x + right.w).toBeCloseTo(400, 8);
    const tall = fitCover(300, 600, 3 / 4, 1, 0, 0);
    expect(tall.w).toBe(300);
    expect(tall.h).toBeCloseTo(400, 8);
  });
  it('uma foto tem 3×4 cm na resolução pedida', async () => {
    const d = await ok(photo3x4Tool, { file: f(encodeJpeg(noise(300, 300), 90)), output: 'single', dpi: 300 });
    expect([d.width, d.height]).toEqual([354, 472]);
  });
  it('a folha 10×15 tem 9 fotos idênticas e fundo branco nas margens', async () => {
    const d = await ok(photo3x4Tool, { file: f(encodeJpeg(noise(300, 300), 95)), output: 'sheet', dpi: 300 });
    expect([d.width, d.height]).toEqual([1181, 1772]);
    expect(String(d.summary)).toContain('9 fotos');
    const sheet = decodeImage(result(d));
    expect(sheet.data[0]).toBeGreaterThan(245); // canto superior esquerdo: margem branca
    // Duas fotos da mesma linha são iguais (mesma imagem repetida), dentro da tolerância do JPEG.
    const gap = Math.round((0.2 / 2.54) * 300);
    const left = Math.floor((1181 - (3 * 354 + 2 * gap)) / 2);
    const top = Math.floor((1772 - (3 * 472 + 2 * gap)) / 2);
    const at = (x: number, y: number) => sheet.data[(y * 1181 + x) * 4]!;
    expect(Math.abs(at(left + 100, top + 100) - at(left + 354 + gap + 100, top + 100))).toBeLessThan(40);
  });
  it('valida dpi e zoom', async () => {
    const file = f(encodeJpeg(noise(30, 30), 80));
    await err(photo3x4Tool, { file, dpi: 50 });
    await err(photo3x4Tool, { file, zoom: 9 });
  });
});
