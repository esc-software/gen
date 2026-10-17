import { describe, expect, it } from 'vitest';
import {
  MAX_PIXELS, applyOrientation, cropImage, decodeImage, detectImageType, encodeJpeg, encodePng, flattenAlpha, hasTransparency, readImageSize, readJpegOrientation, resizeImage,
  type RasterImage,
} from './image-codec.js';

/** Imagem de teste com um padrão previsível: R = x*step, G = y*step, B = 128. */
function gradient(width: number, height: number, alpha = 255): RasterImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = Math.min(255, Math.round((x / Math.max(width - 1, 1)) * 255));
      data[o + 1] = Math.min(255, Math.round((y / Math.max(height - 1, 1)) * 255));
      data[o + 2] = 128;
      data[o + 3] = alpha;
    }
  }
  return { width, height, data };
}

const px = (img: RasterImage, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

/** Insere um segmento EXIF com a orientação dada logo após o SOI de um JPEG. */
function withExifOrientation(jpegBytes: Uint8Array, orientation: number, little = true): Uint8Array {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  tiff.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 1, little); // uma entrada
  view.setUint16(10, 0x0112, little);
  view.setUint16(12, 3, little);
  view.setUint32(14, 1, little);
  view.setUint16(18, orientation, little);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const segment = new Uint8Array(4 + exif.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  new DataView(segment.buffer).setUint16(2, exif.length + 2);
  segment.set(exif, 4);
  const out = new Uint8Array(jpegBytes.length + segment.length);
  out.set(jpegBytes.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpegBytes.subarray(2), 2 + segment.length);
  return out;
}

describe('detecção e cabeçalhos', () => {
  it('reconhece JPEG e PNG pelos bytes, não pela extensão', () => {
    const jpg = encodeJpeg(gradient(16, 8), 90);
    const png = encodePng(gradient(16, 8));
    expect(detectImageType(jpg)).toBe('jpeg');
    expect(detectImageType(png)).toBe('png');
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it('lê as dimensões sem decodificar', () => {
    expect(readImageSize(encodeJpeg(gradient(33, 17), 80))).toEqual({ type: 'jpeg', width: 33, height: 17 });
    expect(readImageSize(encodePng(gradient(40, 25)))).toEqual({ type: 'png', width: 40, height: 25 });
    expect(() => readImageSize(new Uint8Array([1, 2, 3]))).toThrow('não suportado');
    expect(() => readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).toThrow('corrompido');
  });

  it('recusa imagens gigantes pelo cabeçalho, antes de gastar memória', () => {
    const png = encodePng(gradient(4, 4)).slice();
    const view = new DataView(png.buffer);
    view.setUint32(16, 50_000);
    view.setUint32(20, 50_000);
    expect(() => decodeImage(png)).toThrow('megapixels');
    expect(MAX_PIXELS).toBe(40_000_000);
  });

  it('arquivos truncados ou corrompidos geram erro amigável', () => {
    const jpg = encodeJpeg(gradient(32, 32), 90);
    expect(() => decodeImage(jpg.subarray(0, 40))).toThrow();
    const png = encodePng(gradient(32, 32));
    expect(() => decodeImage(png.subarray(0, 40))).toThrow('inválida');
  });
});

describe('codificação', () => {
  it('PNG é sem perdas, inclusive com transparência', () => {
    const img = gradient(20, 12, 200);
    const back = decodeImage(encodePng(img));
    expect(back.width).toBe(20);
    expect(back.height).toBe(12);
    expect([...back.data]).toEqual([...img.data]);
    expect(hasTransparency(back)).toBe(true);
    expect(hasTransparency(gradient(4, 4))).toBe(false);
  });

  it('JPEG preserva as cores com tolerância e a qualidade afeta o tamanho', () => {
    const img = gradient(64, 64);
    const high = encodeJpeg(img, 95);
    const low = encodeJpeg(img, 20);
    expect(low.length).toBeLessThan(high.length);
    const back = decodeImage(high);
    expect(back.width).toBe(64);
    let maxError = 0;
    for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) maxError = Math.max(maxError, Math.abs((back.data[i + c] as number) - (img.data[i + c] as number)));
    expect(maxError).toBeLessThan(14);
    expect(back.data[3]).toBe(255);
  });

  it('JPEG achata a transparência sobre fundo branco', () => {
    const transparent: RasterImage = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) }; // tudo transparente
    const back = decodeImage(encodeJpeg(transparent, 95));
    expect(px(back, 4, 4).slice(0, 3).every((v) => v >= 250)).toBe(true);
    const half = flattenAlpha({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 128]) });
    expect(px(half, 0, 0)).toEqual([127, 127, 127, 255]);
  });

  it('decodifica PNG em tons de cinza e com paleta como RGBA', () => {
    // Cinza 8 bits: gerado pelo próprio codificador da biblioteca.
    const gray = decodeImage(encodePng({ width: 2, height: 1, data: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]) }));
    expect(px(gray, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(gray, 1, 0)).toEqual([40, 50, 60, 255]);
  });
});

describe('redimensionamento e recorte', () => {
  it('redução usa a média de área: 2x2 vira a média dos quatro pixels', () => {
    const img: RasterImage = { width: 2, height: 2, data: new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]) };
    expect(px(resizeImage(img, 1, 1), 0, 0)).toEqual([100, 100, 100, 255]);
  });

  it('redução não escurece bordas transparentes', () => {
    const img: RasterImage = { width: 2, height: 1, data: new Uint8Array([200, 100, 50, 255, 0, 0, 0, 0]) };
    const out = resizeImage(img, 1, 1);
    expect(px(out, 0, 0)).toEqual([200, 100, 50, 128]);
  });

  it('mantém as dimensões pedidas e a média geral ao reduzir; ampliação interpola', () => {
    const img = gradient(100, 60);
    const small = resizeImage(img, 33, 21);
    expect([small.width, small.height]).toEqual([33, 21]);
    const mean = (i: RasterImage, c: number) => { let s = 0; for (let k = c; k < i.data.length; k += 4) s += i.data[k] as number; return s / (i.data.length / 4); };
    expect(Math.abs(mean(small, 0) - mean(img, 0))).toBeLessThan(2);
    expect(Math.abs(mean(small, 1) - mean(img, 1))).toBeLessThan(2);
    const big = resizeImage(gradient(2, 1), 5, 1);
    expect(px(big, 0, 0)[0]).toBe(0);
    expect(px(big, 4, 0)[0]).toBe(255);
    expect(px(big, 2, 0)[0]).toBeGreaterThan(100);
    expect(px(big, 2, 0)[0]).toBeLessThan(155);
    expect(resizeImage(img, 100, 60)).toBe(img);
    expect(() => resizeImage(img, 0, 5)).toThrow('inválidas');
  });

  it('recorte respeita os limites da imagem', () => {
    const img = gradient(10, 10);
    const c = cropImage(img, 2, 3, 4, 5);
    expect([c.width, c.height]).toEqual([4, 5]);
    expect(px(c, 0, 0)).toEqual(px(img, 2, 3));
    expect(px(c, 3, 4)).toEqual(px(img, 5, 7));
    const edge = cropImage(img, 8, 8, 100, 100);
    expect([edge.width, edge.height]).toEqual([2, 2]);
    const outside = cropImage(img, -5, -5, 3, 3);
    expect(px(outside, 0, 0)).toEqual(px(img, 0, 0));
  });
});

describe('orientação EXIF', () => {
  // Imagem 3×2 com pixels identificáveis pelo valor de R.
  const img: RasterImage = { width: 3, height: 2, data: new Uint8Array([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 50, 0, 0, 255, 60, 0, 0, 255]) };
  const reds = (i: RasterImage) => {
    const rows: number[][] = [];
    for (let y = 0; y < i.height; y++) rows.push(Array.from({ length: i.width }, (_, x) => px(i, x, y)[0] as number));
    return rows;
  };

  it('as 8 orientações dão o resultado esperado', () => {
    expect(reds(applyOrientation(img, 1))).toEqual([[10, 20, 30], [40, 50, 60]]);
    expect(reds(applyOrientation(img, 2))).toEqual([[30, 20, 10], [60, 50, 40]]); // espelho horizontal
    expect(reds(applyOrientation(img, 3))).toEqual([[60, 50, 40], [30, 20, 10]]); // 180°
    expect(reds(applyOrientation(img, 4))).toEqual([[40, 50, 60], [10, 20, 30]]); // espelho vertical
    expect(reds(applyOrientation(img, 5))).toEqual([[10, 40], [20, 50], [30, 60]]); // transposta
    expect(reds(applyOrientation(img, 6))).toEqual([[40, 10], [50, 20], [60, 30]]); // 90° horário
    expect(reds(applyOrientation(img, 7))).toEqual([[60, 30], [50, 20], [40, 10]]); // transversa
    expect(reds(applyOrientation(img, 8))).toEqual([[30, 60], [20, 50], [10, 40]]); // 90° anti-horário
    expect(applyOrientation(img, 0)).toBe(img);
    expect(applyOrientation(img, 9)).toBe(img);
  });

  it('orientações 5 a 8 trocam largura e altura', () => {
    for (const o of [5, 6, 7, 8]) expect([applyOrientation(img, o).width, applyOrientation(img, o).height]).toEqual([2, 3]);
    for (const o of [2, 3, 4]) expect([applyOrientation(img, o).width, applyOrientation(img, o).height]).toEqual([3, 2]);
  });

  it('girar 90° horário quatro vezes devolve a imagem original', () => {
    let r = img;
    for (let i = 0; i < 4; i++) r = applyOrientation(r, 6);
    expect(reds(r)).toEqual(reds(img));
  });

  it('lê a orientação gravada no JPEG (little e big endian) e assume 1 quando ausente', () => {
    const base = encodeJpeg(gradient(16, 16), 90);
    expect(readJpegOrientation(base)).toBe(1);
    for (const o of [1, 3, 6, 8]) {
      expect(readJpegOrientation(withExifOrientation(base, o, true))).toBe(o);
      expect(readJpegOrientation(withExifOrientation(base, o, false))).toBe(o);
    }
    expect(readJpegOrientation(withExifOrientation(base, 99))).toBe(1);
    expect(readJpegOrientation(encodePng(gradient(4, 4)))).toBe(1);
    // O JPEG com EXIF continua decodificável.
    expect(decodeImage(withExifOrientation(base, 6)).width).toBe(16);
  });
});
