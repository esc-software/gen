import { z } from 'zod';
import { ToolError, base64ToBytes, bytesToBase64, defineTool, filePayloadSchema, type FilePayload } from '@esc/gen-core';
import {
  applyOrientation, cropImage, decodeImage, detectImageType, encodeJpeg, encodePng, flattenAlpha, hasTransparency, readJpegOrientation, resizeImage, type RasterImage,
} from './image-codec.js';

const MAX_BYTES = 25 * 1024 * 1024;
const imageFile = filePayloadSchema.extend({ data: z.string().min(1).max(Math.ceil((MAX_BYTES * 4) / 3) + 16) });

function load(file: FilePayload): { image: RasterImage; bytes: Uint8Array; type: 'jpeg' | 'png' } {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(file.data);
  } catch {
    throw new ToolError(`"${file.name}": o conteúdo do arquivo não é Base64 válido`);
  }
  if (bytes.length > MAX_BYTES) throw new ToolError(`"${file.name}" tem mais de ${MAX_BYTES / 1024 / 1024} MB`);
  const type = detectImageType(bytes);
  if (!type) throw new ToolError(`"${file.name}" não é uma imagem JPEG ou PNG (o tipo é conferido pelo conteúdo)`);
  let image = decodeImage(bytes);
  if (type === 'jpeg') image = applyOrientation(image, readJpegOrientation(bytes));
  return { image, bytes, type };
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'imagem';
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

const imgOutput = z.object({ image: z.string(), fileName: z.string(), mimeType: z.string(), width: z.number(), height: z.number(), sizeBytes: z.number(), summary: z.string(), dataUrl: z.string() });
const imgLabels = { image: 'Imagem (Base64)', fileName: 'Arquivo', mimeType: 'Tipo', width: 'Largura (px)', height: 'Altura (px)', sizeBytes: 'Tamanho (bytes)', summary: 'Resumo', dataUrl: 'Pré-visualização' };

function result(bytes: Uint8Array, type: 'jpeg' | 'png', name: string, image: RasterImage, summary: string) {
  const mimeType = type === 'jpeg' ? 'image/jpeg' : 'image/png';
  return {
    image: bytesToBase64(bytes), fileName: `${name}.${type === 'jpeg' ? 'jpg' : 'png'}`, mimeType, width: image.width, height: image.height, sizeBytes: bytes.length, summary,
    // Pré-visualização só quando pequena, para não dobrar o tamanho da resposta.
    dataUrl: bytes.length <= 3 * 1024 * 1024 ? `data:${mimeType};base64,${bytesToBase64(bytes)}` : '',
  };
}

const downloads = [{ field: 'image', fileName: 'imagem', mimeType: 'application/octet-stream', encoding: 'base64' as const, label: 'Baixar imagem' }];
const common = { category: 'utilidades' as const, modes: ['browser', 'node'] as ('browser' | 'node')[], ui: 'image-preview', outputSchema: imgOutput, outputLabels: imgLabels, hiddenOutputs: ['image', 'dataUrl'], examples: [] as never[] };

// ---------- comprimir ----------

export const compressImageTool = defineTool({
  ...common,
  id: 'imagem-comprimir',
  name: 'Comprimir Imagem',
  description: 'Reduz o tamanho de fotos JPG e PNG ajustando a qualidade e, se quiser, a dimensão máxima',
  keywords: ['imagem', 'foto', 'comprimir', 'reduzir tamanho', 'jpg', 'png', 'otimizar', 'peso'],
  icon: '🗜️',
  inputSchema: z.object({ file: imageFile, quality: z.number().int().min(10).max(95).default(70), maxSide: z.number().int().min(100).max(8000).optional() }),
  execute: ({ file, quality, maxSide }) => {
    const { image, bytes, type } = load(file);
    let img = image;
    if (maxSide && Math.max(img.width, img.height) > maxSide) {
      const k = maxSide / Math.max(img.width, img.height);
      img = resizeImage(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
    }
    // PNG com transparência continua PNG (JPEG não guarda transparência); os demais viram JPEG.
    const keepPng = type === 'png' && hasTransparency(img);
    const encoded = keepPng ? encodePng(img) : encodeJpeg(img, quality);
    const better = encoded.length < bytes.length || img !== image;
    const finalBytes = better ? encoded : bytes;
    const finalType = better ? (keepPng ? 'png' : 'jpeg') : type;
    const saved = Math.max(0, Math.round(((bytes.length - finalBytes.length) / bytes.length) * 1000) / 10);
    const note = keepPng ? ' PNG com transparência permanece PNG (a qualidade não se aplica).' : '';
    return result(finalBytes, finalType, `${stem(file.name)}-comprimido`, img, better ? `De ${size(bytes.length)} para ${size(finalBytes.length)} (${saved}% menor).${note}` : 'A imagem já está bem otimizada: o original foi mantido.');
  },
  fields: { file: { label: 'Imagem (JPG ou PNG)', accept: 'image/jpeg,image/png', maxSizeMB: 25 }, quality: { label: 'Qualidade (10 a 95)', help: 'Menor qualidade = arquivo menor. 70 costuma ser um bom equilíbrio.' }, maxSide: { label: 'Lado maior máximo (pixels, opcional)' } },
  downloads,
  documentation: 'Recodifica a imagem no seu dispositivo. Há perda de qualidade em JPEG: guarde o original. PNG com transparência é mantido como PNG; PNG sem transparência vira JPEG (muito menor em fotos). A orientação gravada pelo celular (EXIF) é aplicada nos pixels e os metadados (localização, câmera) são removidos. Limite: 25 MB e cerca de 40 megapixels.',
});

// ---------- redimensionar ----------

export const resizeImageTool = defineTool({
  ...common,
  id: 'imagem-redimensionar',
  name: 'Redimensionar Imagem',
  description: 'Muda a largura e a altura de uma imagem em pixels ou em porcentagem, mantendo a proporção',
  keywords: ['imagem', 'redimensionar', 'tamanho', 'largura', 'altura', 'pixels', 'reduzir', 'ampliar'],
  icon: '📐',
  inputSchema: z.object({
    file: imageFile,
    mode: z.enum(['percent', 'width', 'height', 'exact']).default('width'),
    percent: z.number().min(1).max(500).default(50),
    width: z.number().int().min(1).max(10000).optional(),
    height: z.number().int().min(1).max(10000).optional(),
    quality: z.number().int().min(10).max(100).default(90),
  }),
  execute: ({ file, mode, percent, width, height, quality }) => {
    const { image, type } = load(file);
    let w: number;
    let h: number;
    if (mode === 'percent') {
      w = Math.round((image.width * percent) / 100);
      h = Math.round((image.height * percent) / 100);
    } else if (mode === 'width') {
      if (!width) throw new ToolError('Informe a largura');
      w = width;
      h = Math.round((image.height * width) / image.width);
    } else if (mode === 'height') {
      if (!height) throw new ToolError('Informe a altura');
      h = height;
      w = Math.round((image.width * height) / image.height);
    } else {
      if (!width || !height) throw new ToolError('Informe a largura e a altura');
      w = width;
      h = height;
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    const out = resizeImage(image, w, h);
    const bytes = type === 'png' ? encodePng(out) : encodeJpeg(out, quality);
    return result(bytes, type, `${stem(file.name)}-${w}x${h}`, out, `${image.width} × ${image.height} → ${w} × ${h} pixels (${size(bytes.length)}).`);
  },
  fields: {
    file: { label: 'Imagem (JPG ou PNG)', accept: 'image/jpeg,image/png', maxSizeMB: 25 },
    mode: { label: 'Como redimensionar', optionLabels: { percent: 'Por porcentagem', width: 'Por largura (altura proporcional)', height: 'Por altura (largura proporcional)', exact: 'Largura e altura exatas (pode distorcer)' } },
    percent: { label: 'Porcentagem (1 a 500)' }, width: { label: 'Largura (pixels)' }, height: { label: 'Altura (pixels)' }, quality: { label: 'Qualidade do JPEG (10 a 100)' },
  },
  downloads,
  documentation: 'Reduz com média de área (nítido e sem serrilhado) e amplia com interpolação bilinear. O formato de saída é o mesmo da entrada (JPEG ou PNG, mantendo a transparência). Ampliar demais deixa a imagem borrada, pois não cria detalhes. Limite de saída: cerca de 40 megapixels.',
});

// ---------- converter ----------

export const convertImageTool = defineTool({
  ...common,
  id: 'imagem-converter',
  name: 'Converter Imagem',
  description: 'Converte imagens entre JPG e PNG, com fundo configurável para transparências',
  keywords: ['imagem', 'converter', 'jpg', 'jpeg', 'png', 'formato', 'transparência'],
  icon: '🔄',
  inputSchema: z.object({ file: imageFile, to: z.enum(['jpeg', 'png']).default('jpeg'), quality: z.number().int().min(10).max(100).default(90), background: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal como #ffffff').default('#ffffff') }),
  execute: ({ file, to, quality, background }) => {
    const { image, type } = load(file);
    const bg: [number, number, number] = [parseInt(background.slice(1, 3), 16), parseInt(background.slice(3, 5), 16), parseInt(background.slice(5, 7), 16)];
    const transparent = hasTransparency(image);
    const bytes = to === 'png' ? encodePng(image) : encodeJpeg(flattenAlpha(image, bg), quality);
    const note = to === 'jpeg' && transparent ? ' A transparência foi substituída pela cor de fundo.' : type === to ? ' O arquivo já estava nesse formato; foi recodificado.' : '';
    return result(bytes, to, `${stem(file.name)}-convertido`, image, `${type.toUpperCase()} → ${to.toUpperCase()} (${size(bytes.length)}).${note}`);
  },
  fields: {
    file: { label: 'Imagem (JPG ou PNG)', accept: 'image/jpeg,image/png', maxSizeMB: 25 },
    to: { label: 'Converter para', optionLabels: { jpeg: 'JPG', png: 'PNG' } }, quality: { label: 'Qualidade do JPG (10 a 100)' }, background: { label: 'Cor de fundo para áreas transparentes', placeholder: '#ffffff' },
  },
  downloads,
  documentation: 'Converte entre JPG e PNG no seu dispositivo. JPG não guarda transparência, então áreas transparentes recebem a cor de fundo escolhida. PNG para JPG costuma reduzir bastante fotos; JPG para PNG não recupera a qualidade perdida e pode aumentar o arquivo. Outros formatos (WebP, HEIC, GIF) ainda não são suportados.',
});

// ---------- foto 3x4 ----------

const PHOTO = { widthCm: 3, heightCm: 4 };

export function fitCover(imgW: number, imgH: number, ratio: number, zoom: number, offsetX: number, offsetY: number): { x: number; y: number; w: number; h: number } {
  let w = imgW;
  let h = imgW / ratio;
  if (h > imgH) {
    h = imgH;
    w = imgH * ratio;
  }
  w /= zoom;
  h /= zoom;
  const x = Math.min(Math.max((imgW - w) / 2 + offsetX * (imgW - w) / 2, 0), imgW - w);
  const y = Math.min(Math.max((imgH - h) / 2 + offsetY * (imgH - h) / 2, 0), imgH - h);
  return { x, y, w, h };
}

export const photo3x4Tool = defineTool({
  ...common,
  id: 'foto-3x4',
  name: 'Foto 3x4',
  description: 'Recorta uma foto na proporção 3x4 e monta uma folha 10x15 cm pronta para imprimir várias fotos',
  keywords: ['foto 3x4', '3x4', 'foto documento', 'recortar', 'impressão', 'folha 10x15', 'retrato'],
  icon: '🪪',
  inputSchema: z.object({
    file: imageFile,
    output: z.enum(['single', 'sheet']).default('sheet'),
    dpi: z.number().int().min(150).max(600).default(300),
    zoom: z.number().min(1).max(4).default(1),
    offsetX: z.number().min(-1).max(1).default(0),
    offsetY: z.number().min(-1).max(1).default(0),
  }),
  execute: ({ file, output, dpi, zoom, offsetX, offsetY }) => {
    const { image } = load(file);
    const ratio = PHOTO.widthCm / PHOTO.heightCm;
    const box = fitCover(image.width, image.height, ratio, zoom, offsetX, offsetY);
    const cropped = cropImage(image, box.x, box.y, box.w, box.h);
    const pw = Math.round((PHOTO.widthCm / 2.54) * dpi);
    const ph = Math.round((PHOTO.heightCm / 2.54) * dpi);
    const photo = flattenAlpha(resizeImage(cropped, pw, ph));
    if (output === 'single') {
      const bytes = encodeJpeg(photo, 92);
      return result(bytes, 'jpeg', `${stem(file.name)}-3x4`, photo, `Foto 3x4 cm a ${dpi} dpi (${pw} × ${ph} pixels).`);
    }
    // Folha 10x15 cm (retrato): 3 colunas × 3 linhas de fotos 3x4 com 2 mm de espaço e traço de corte fino.
    const sheetW = Math.round((10 / 2.54) * dpi);
    const sheetH = Math.round((15 / 2.54) * dpi);
    const gap = Math.round((0.2 / 2.54) * dpi);
    const cols = Math.floor((sheetW + gap) / (pw + gap));
    const rows = Math.floor((sheetH + gap) / (ph + gap));
    const usedW = cols * pw + (cols - 1) * gap;
    const usedH = rows * ph + (rows - 1) * gap;
    const left = Math.floor((sheetW - usedW) / 2);
    const top = Math.floor((sheetH - usedH) / 2);
    const data = new Uint8Array(sheetW * sheetH * 4).fill(255);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = left + c * (pw + gap);
        const oy = top + r * (ph + gap);
        for (let y = 0; y < ph; y++) data.set(photo.data.subarray(y * pw * 4, (y + 1) * pw * 4), ((oy + y) * sheetW + ox) * 4);
      }
    }
    const sheet: RasterImage = { width: sheetW, height: sheetH, data };
    const bytes = encodeJpeg(sheet, 92);
    return result(bytes, 'jpeg', `${stem(file.name)}-folha-10x15`, sheet, `Folha 10 × 15 cm com ${cols * rows} fotos 3x4 a ${dpi} dpi. Imprima em 100% (sem "ajustar à página") para manter o tamanho real.`);
  },
  fields: {
    file: { label: 'Foto (JPG ou PNG)', accept: 'image/jpeg,image/png', maxSizeMB: 25, help: 'Use uma foto de frente, com o rosto centralizado e fundo liso. Veja as regras do documento que vai usar.' },
    output: { label: 'Saída', optionLabels: { single: 'Uma foto 3x4', sheet: 'Folha 10x15 cm com várias fotos' } },
    dpi: { label: 'Resolução de impressão (dpi)' }, zoom: { label: 'Zoom (1 a 4)' }, offsetX: { label: 'Deslocamento horizontal (-1 a 1)' }, offsetY: { label: 'Deslocamento vertical (-1 a 1)' },
  },
  downloads,
  documentation: 'Recorta a foto na proporção 3:4 (com zoom e deslocamento ajustáveis) e a redimensiona para 3 × 4 cm na resolução escolhida. A folha 10 × 15 cm reúne 9 fotos para imprimir em laboratório ou em casa. Esta ferramenta só recorta e organiza: ela não remove o fundo nem garante que a foto atenda às exigências de um órgão específico (fundo, expressão, vestimenta). Confira as regras do documento. O processamento é local.',
});

export const imageTools = [compressImageTool, resizeImageTool, convertImageTool, photo3x4Tool];
