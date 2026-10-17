import jpeg from 'jpeg-js';
import { decode as decodePng, encode as encodePngBytes } from 'fast-png';
import { ToolError } from '@esc/gen-core';

/**
 * Codificação e transformação de imagens em JavaScript puro (JPEG e PNG), para funcionar igual no
 * navegador, no Node.js e nos testes, sem depender de canvas nem de bibliotecas nativas.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes por pixel, linhas de cima para baixo. */
  data: Uint8Array;
}

export type ImageType = 'jpeg' | 'png';

/** Limite de pixels aceitos (cerca de 40 megapixels), para proteger a memória. */
export const MAX_PIXELS = 40_000_000;

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'png';
  return null;
}

/** Dimensões lidas do cabeçalho, sem decodificar a imagem. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number; type: ImageType } {
  const type = detectImageType(bytes);
  if (type === 'png') {
    if (bytes.length < 24) throw new ToolError('PNG corrompido');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type, width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1] as number;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
      // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type, height: ((bytes[i + 5] as number) << 8) | (bytes[i + 6] as number), width: ((bytes[i + 7] as number) << 8) | (bytes[i + 8] as number) };
      }
      i += 2 + length;
    }
    throw new ToolError('JPEG corrompido: dimensões não encontradas');
  }
  throw new ToolError('Formato de imagem não suportado: use JPEG ou PNG');
}

function assertSize(width: number, height: number): void {
  if (width < 1 || height < 1) throw new ToolError('Imagem com dimensões inválidas');
  if (width * height > MAX_PIXELS) throw new ToolError(`Imagem grande demais (${width} × ${height}); o limite é de ${MAX_PIXELS / 1_000_000} megapixels`);
}

export function decodeImage(bytes: Uint8Array): RasterImage {
  const { type, width, height } = readImageSize(bytes);
  assertSize(width, height);
  try {
    if (type === 'jpeg') {
      const r = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1_000_000 });
      return { width: r.width, height: r.height, data: new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength) };
    }
    const png = decodePng(bytes);
    const out = new Uint8Array(png.width * png.height * 4);
    const px = png.width * png.height;
    const channels = png.channels;
    const scale = png.depth === 16 ? 8 : 0;
    const src = png.data;
    const read = (i: number) => (scale ? (src[i] as number) >> scale : (src[i] as number));
    const palette = png.palette as number[][] | undefined;
    for (let p = 0; p < px; p++) {
      const o = p * 4;
      if (palette) {
        const entry = palette[read(p)] as number[];
        out[o] = entry[0] as number;
        out[o + 1] = entry[1] as number;
        out[o + 2] = entry[2] as number;
        out[o + 3] = entry[3] ?? 255;
      } else if (channels === 1) {
        const v = read(p);
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      } else if (channels === 2) {
        const v = read(p * 2);
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = read(p * 2 + 1);
      } else {
        out[o] = read(p * channels);
        out[o + 1] = read(p * channels + 1);
        out[o + 2] = read(p * channels + 2);
        out[o + 3] = channels === 4 ? read(p * channels + 3) : 255;
      }
    }
    return { width: png.width, height: png.height, data: out };
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError('Imagem inválida ou corrompida');
  }
}

/** Remove a transparência, compondo sobre uma cor de fundo (padrão: branco). */
export function flattenAlpha(img: RasterImage, background: [number, number, number] = [255, 255, 255]): RasterImage {
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = (img.data[i + 3] as number) / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round((img.data[i + c] as number) * a + (background[c] as number) * (1 - a));
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

export function encodeJpeg(img: RasterImage, quality: number): Uint8Array {
  const flat = flattenAlpha(img);
  const encoded = jpeg.encode({ data: flat.data, width: flat.width, height: flat.height }, Math.min(100, Math.max(1, Math.round(quality))));
  return new Uint8Array(encoded.data);
}

export function encodePng(img: RasterImage): Uint8Array {
  return encodePngBytes({ width: img.width, height: img.height, data: img.data, channels: 4, depth: 8 });
}

export function hasTransparency(img: RasterImage): boolean {
  for (let i = 3; i < img.data.length; i += 4) if ((img.data[i] as number) < 255) return true;
  return false;
}

/** Redimensiona: média de área ao reduzir (qualidade) e interpolação bilinear ao ampliar. */
export function resizeImage(img: RasterImage, width: number, height: number): RasterImage {
  assertSize(width, height);
  if (width === img.width && height === img.height) return img;
  const out = new Uint8Array(width * height * 4);
  const xRatio = img.width / width;
  const yRatio = img.height / height;

  if (width <= img.width && height <= img.height) {
    // Redução: média ponderada pela área coberta de cada pixel de origem.
    for (let y = 0; y < height; y++) {
      const y0 = y * yRatio;
      const y1 = (y + 1) * yRatio;
      for (let x = 0; x < width; x++) {
        const x0 = x * xRatio;
        const x1 = (x + 1) * xRatio;
        let r = 0, g = 0, b = 0, a = 0, weightSum = 0;
        for (let sy = Math.floor(y0); sy < Math.min(Math.ceil(y1), img.height); sy++) {
          const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
          for (let sx = Math.floor(x0); sx < Math.min(Math.ceil(x1), img.width); sx++) {
            const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
            const i = (sy * img.width + sx) * 4;
            const alpha = img.data[i + 3] as number;
            // Pondera pela opacidade para não escurecer as bordas de PNGs transparentes.
            r += (img.data[i] as number) * alpha * w;
            g += (img.data[i + 1] as number) * alpha * w;
            b += (img.data[i + 2] as number) * alpha * w;
            a += alpha * w;
            weightSum += w;
          }
        }
        const o = (y * width + x) * 4;
        if (a > 0) {
          out[o] = Math.round(r / a);
          out[o + 1] = Math.round(g / a);
          out[o + 2] = Math.round(b / a);
        }
        out[o + 3] = Math.round(a / weightSum);
      }
    }
    return { width, height, data: out };
  }

  // Ampliação (ou mudança mista): bilinear.
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max((y + 0.5) * yRatio - 0.5, 0), img.height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, img.height - 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) * xRatio - 0.5, 0), img.width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, img.width - 1);
      const tx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c] as number;
        const p10 = img.data[(y0 * img.width + x1) * 4 + c] as number;
        const p01 = img.data[(y1 * img.width + x0) * 4 + c] as number;
        const p11 = img.data[(y1 * img.width + x1) * 4 + c] as number;
        out[o + c] = Math.round(p00 * (1 - tx) * (1 - ty) + p10 * tx * (1 - ty) + p01 * (1 - tx) * ty + p11 * tx * ty);
      }
    }
  }
  return { width, height, data: out };
}

export function cropImage(img: RasterImage, x: number, y: number, width: number, height: number): RasterImage {
  const cx = Math.max(0, Math.min(Math.round(x), img.width - 1));
  const cy = Math.max(0, Math.min(Math.round(y), img.height - 1));
  const w = Math.max(1, Math.min(Math.round(width), img.width - cx));
  const h = Math.max(1, Math.min(Math.round(height), img.height - cy));
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((cy + row) * img.width + cx) * 4;
    out.set(img.data.subarray(start, start + w * 4), row * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** Aplica a orientação EXIF (1 a 8), devolvendo a imagem como deve ser exibida. */
export function applyOrientation(img: RasterImage, orientation: number): RasterImage {
  if (orientation < 2 || orientation > 8) return img;
  const swap = orientation >= 5;
  const w = swap ? img.height : img.width;
  const h = swap ? img.width : img.height;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let nx: number;
      let ny: number;
      switch (orientation) {
        case 2: nx = img.width - 1 - x; ny = y; break; // espelho horizontal
        case 3: nx = img.width - 1 - x; ny = img.height - 1 - y; break; // 180°
        case 4: nx = x; ny = img.height - 1 - y; break; // espelho vertical
        case 5: nx = y; ny = x; break; // transposição
        case 6: nx = img.height - 1 - y; ny = x; break; // 90° horário
        case 7: nx = img.height - 1 - y; ny = img.width - 1 - x; break; // transversa
        default: nx = y; ny = img.width - 1 - x; break; // 8: 90° anti-horário
      }
      out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (ny * w + nx) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

/** Lê a orientação EXIF de um JPEG (1 quando ausente). */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (detectImageType(bytes) !== 'jpeg') return 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return 1;
    const marker = bytes[i + 1] as number;
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (marker === 0xe1 && length > 14) {
      const start = i + 4;
      const isExif = bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66;
      if (isExif) {
        const tiff = start + 6;
        const little = bytes[tiff] === 0x49;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const u16 = (o: number) => view.getUint16(o, little);
        const u32 = (o: number) => view.getUint32(o, little);
        if (tiff + 8 > bytes.length) return 1;
        const ifd = tiff + u32(tiff + 4);
        if (ifd + 2 > bytes.length) return 1;
        const entries = u16(ifd);
        for (let e = 0; e < entries; e++) {
          const entry = ifd + 2 + e * 12;
          if (entry + 12 > bytes.length) return 1;
          if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
      }
    }
    if (marker === 0xda) return 1; // início dos dados da imagem
    i += 2 + length;
  }
  return 1;
}
