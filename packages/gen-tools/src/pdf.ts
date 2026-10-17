import { z } from 'zod';
import { ToolError, base64ToBytes, bytesToBase64, defineTool, filePayloadSchema, type FilePayload } from '@esc/gen-core';
import { secureRandomString } from '@esc/gen-utils';
import { applyOrientation, decodeImage, detectImageType, encodeJpeg, readImageSize, readJpegOrientation, resizeImage } from './image-codec.js';

/** Limites de processamento (validados no servidor e no navegador). */
export const PDF_LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalPages: 2000,
  maxFiles: 20,
  maxImages: 100,
} as const;

const base64Limit = Math.ceil((PDF_LIMITS.maxFileBytes * 4) / 3) + 16;
const pdfFile = filePayloadSchema.extend({ data: z.string().min(1).max(base64Limit) });
const imageFile = pdfFile;

let libPromise: Promise<typeof import('@cantoo/pdf-lib')> | undefined;
const lib = () => (libPromise ??= import('@cantoo/pdf-lib'));

// ---------- leitura e validação ----------

export function isPdfBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

function decodeFile(file: FilePayload): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(file.data);
  } catch {
    throw new ToolError(`"${file.name}": o conteúdo do arquivo não é Base64 válido`);
  }
  if (bytes.length === 0) throw new ToolError(`"${file.name}" está vazio`);
  if (bytes.length > PDF_LIMITS.maxFileBytes) throw new ToolError(`"${file.name}" tem mais de ${PDF_LIMITS.maxFileBytes / 1024 / 1024} MB`);
  return bytes;
}

type PdfDoc = Awaited<ReturnType<(typeof import('@cantoo/pdf-lib'))['PDFDocument']['load']>>;

export async function loadPdf(file: FilePayload, password?: string): Promise<{ doc: PdfDoc; bytes: Uint8Array }> {
  const bytes = decodeFile(file);
  // O tipo real é conferido pelo conteúdo, não pela extensão nem pelo tipo MIME declarado.
  if (!isPdfBytes(bytes)) throw new ToolError(`"${file.name}" não é um PDF (o conteúdo não começa com %PDF-)`);
  const { PDFDocument } = await lib();
  try {
    const doc = await PDFDocument.load(bytes, password === undefined ? { updateMetadata: false } : { password, updateMetadata: false });
    // Arquivos sem estrutura válida só falham ao acessar as páginas.
    if (doc.getPageCount() < 1) throw new Error('empty');
    return { doc, bytes };
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/encrypted/i.test(message) && password === undefined) throw new ToolError(`"${file.name}" está protegido por senha. Remova a senha primeiro (informando a senha correta).`);
    if (/password/i.test(message)) throw new ToolError('Senha incorreta');
    throw new ToolError(`"${file.name}" está corrompido ou não pôde ser lido como PDF`);
  }
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'documento';

// ---------- páginas ----------

/** Lê "1-3, 5, 8-" (1 a partir da primeira página) e devolve intervalos validados. */
export function parsePageRanges(spec: string, total: number): [number, number][] {
  const tokens = spec.split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new ToolError('Informe as páginas, como 1-3, 5, 8-');
  return tokens.map((token) => {
    const m = /^(\d*)\s*(-)?\s*(\d*)$/.exec(token);
    if (!m || (m[1] === '' && m[3] === '')) throw new ToolError(`Intervalo inválido: "${token}"`);
    let start: number;
    let end: number;
    if (m[2]) {
      start = m[1] === '' ? 1 : Number(m[1]);
      end = m[3] === '' ? total : Number(m[3]);
    } else {
      start = end = Number(m[1]);
    }
    if (start < 1 || end > total) throw new ToolError(`O intervalo "${token}" está fora das páginas do documento (1 a ${total})`);
    if (start > end) throw new ToolError(`Intervalo invertido: "${token}"`);
    return [start, end] as [number, number];
  });
}

export function expandRanges(ranges: [number, number][]): number[] {
  return ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
}

// ---------- saída ----------

const pdfOutput = z.object({ pdf: z.string(), fileName: z.string(), pages: z.number(), sizeBytes: z.number(), summary: z.string() });
const pdfLabels = { pdf: 'PDF (Base64)', fileName: 'Arquivo', pages: 'Páginas', sizeBytes: 'Tamanho (bytes)', summary: 'Resumo' };
const pdfDownload = { field: 'pdf', fileName: 'resultado.pdf', mimeType: 'application/pdf', encoding: 'base64' as const, label: 'Baixar PDF' };

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function pdfResult(bytes: Uint8Array, fileName: string, pages: number, summary: string) {
  return { pdf: bytesToBase64(bytes), fileName, pages, sizeBytes: bytes.length, summary };
}

// ---------- unir ----------

export async function mergePdfs(files: FilePayload[]): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument } = await lib();
  const out = await PDFDocument.create();
  let pages = 0;
  for (const file of files) {
    const { doc } = await loadPdf(file);
    pages += doc.getPageCount();
    if (pages > PDF_LIMITS.maxTotalPages) throw new ToolError(`O resultado teria mais de ${PDF_LIMITS.maxTotalPages} páginas`);
    const copied = await out.copyPages(doc, doc.getPageIndices());
    for (const p of copied) out.addPage(p);
  }
  return { bytes: await out.save(), pages };
}

export const mergePdfTool = defineTool({
  id: 'pdf-unir',
  name: 'Unir PDFs',
  description: 'Junta vários arquivos PDF em um só, na ordem em que você os enviar',
  category: 'pdf',
  keywords: ['pdf', 'unir', 'juntar', 'mesclar', 'combinar', 'merge', 'documentos'],
  icon: '🔗',
  modes: ['browser', 'node'],
  inputSchema: z.object({ files: z.array(pdfFile).min(2, 'Envie ao menos 2 PDFs').max(PDF_LIMITS.maxFiles) }),
  outputSchema: pdfOutput,
  execute: async ({ files }) => {
    const { bytes, pages } = await mergePdfs(files);
    return pdfResult(bytes, 'unido.pdf', pages, `${files.length} arquivos unidos em um PDF de ${pages} páginas (${formatBytes(bytes.length)}).`);
  },
  fields: { files: { label: 'Arquivos PDF', accept: 'application/pdf', maxSizeMB: 50, help: 'Escolha 2 a 20 arquivos. A ordem de seleção define a ordem no PDF final.' } },
  outputLabels: pdfLabels,
  downloads: [{ ...pdfDownload, fileName: 'unido.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    `O processamento acontece no seu dispositivo: os arquivos não são enviados a servidores. Limites: até ${PDF_LIMITS.maxFiles} arquivos, 50 MB cada e ${PDF_LIMITS.maxTotalPages} páginas no total. O tipo é conferido pelo conteúdo do arquivo. PDFs protegidos por senha precisam ter a senha removida antes. Marcadores, formulários e anexos dos originais podem não ser mantidos na união.`,
});

// ---------- dividir ----------

export function zipFiles(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return import('fflate').then(({ zipSync }) => zipSync(files, { level: 0 }));
}

export const splitPdfTool = defineTool({
  id: 'pdf-dividir',
  name: 'Dividir PDF',
  description: 'Extrai páginas ou divide um PDF por intervalos, a cada N páginas ou página por página',
  category: 'pdf',
  keywords: ['pdf', 'dividir', 'separar', 'extrair páginas', 'cortar', 'split', 'intervalo'],
  icon: '✂️',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    file: pdfFile,
    mode: z.enum(['extract', 'ranges', 'every', 'each']).default('extract'),
    pages: z.string().max(500).default('1'),
    every: z.number().int().min(1).max(1000).default(1),
  }),
  outputSchema: z.object({ pdf: z.string(), zip: z.string(), fileName: z.string(), parts: z.number(), pages: z.number(), summary: z.string() }),
  execute: async ({ file, mode, pages, every }) => {
    const { doc } = await loadPdf(file);
    const total = doc.getPageCount();
    const { PDFDocument } = await lib();
    const name = baseName(file.name);
    const build = async (indices: number[]) => {
      const out = await PDFDocument.create();
      for (const p of await out.copyPages(doc, indices.map((n) => n - 1))) out.addPage(p);
      return out.save();
    };

    if (mode === 'extract') {
      const wanted = expandRanges(parsePageRanges(pages, total));
      if (wanted.length > PDF_LIMITS.maxTotalPages) throw new ToolError('Páginas demais na seleção');
      const bytes = await build(wanted);
      return { pdf: bytesToBase64(bytes), zip: '', fileName: `${name}-paginas.pdf`, parts: 1, pages: wanted.length, summary: `${wanted.length} página(s) extraída(s) de ${total}.` };
    }

    const groups: { label: string; pages: number[] }[] = [];
    if (mode === 'ranges') {
      for (const [a, b] of parsePageRanges(pages, total)) groups.push({ label: a === b ? `pagina-${a}` : `paginas-${a}-${b}`, pages: expandRanges([[a, b]]) });
    } else {
      const size = mode === 'each' ? 1 : every;
      for (let start = 1; start <= total; start += size) {
        const end = Math.min(start + size - 1, total);
        groups.push({ label: start === end ? `pagina-${start}` : `paginas-${start}-${end}`, pages: expandRanges([[start, end]]) });
      }
    }
    if (groups.length > 500) throw new ToolError('A divisão geraria arquivos demais (máximo 500)');
    const files: Record<string, Uint8Array> = {};
    for (const [i, g] of groups.entries()) files[`${name}_parte-${String(i + 1).padStart(3, '0')}_${g.label}.pdf`] = await build(g.pages);
    const zip = await zipFiles(files);
    return { pdf: '', zip: bytesToBase64(zip), fileName: `${name}-dividido.zip`, parts: groups.length, pages: total, summary: `${total} páginas divididas em ${groups.length} arquivo(s), reunidos em um ZIP.` };
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 50 },
    mode: { label: 'O que fazer', optionLabels: { extract: 'Extrair páginas em um único PDF', ranges: 'Um PDF para cada intervalo (ZIP)', every: 'Dividir a cada N páginas (ZIP)', each: 'Uma página por arquivo (ZIP)' } },
    pages: { label: 'Páginas', placeholder: '1-3, 5, 8-', help: 'Para "extrair" e "intervalos". Use vírgulas e hífens; "8-" vai até a última página. Em "extrair" a ordem informada é mantida (ex.: 3,1,2).' },
    every: { label: 'N (páginas por arquivo)', help: 'Para "dividir a cada N páginas".' },
  },
  outputLabels: { pdf: 'PDF (Base64)', zip: 'ZIP (Base64)', fileName: 'Arquivo', parts: 'Arquivos gerados', pages: 'Páginas', summary: 'Resumo' },
  downloads: [
    { field: 'pdf', fileName: 'paginas.pdf', mimeType: 'application/pdf', encoding: 'base64', label: 'Baixar PDF' },
    { field: 'zip', fileName: 'dividido.zip', mimeType: 'application/zip', encoding: 'base64', label: 'Baixar ZIP' },
  ],
  hiddenOutputs: ['pdf', 'zip'],
  examples: [],
  documentation:
    'Processa tudo no seu dispositivo. As páginas são numeradas a partir de 1. Nos modos com vários arquivos, o resultado vem em um ZIP com nomes ordenados. PDFs protegidos por senha precisam ter a senha removida antes.',
});

// ---------- numerar páginas ----------

/** Converte um ponto da visão (página já girada) para o espaço do PDF. */
export function visualToUser(rotation: number, width: number, height: number, vx: number, vy: number): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { x: width - vy, y: vx };
    case 180: return { x: width - vx, y: height - vy };
    case 270: return { x: vy, y: height - vx };
    default: return { x: vx, y: vy };
  }
}

export function formatPageLabel(template: string, n: number, total: number): string {
  return template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total));
}

export const numberPagesTool = defineTool({
  id: 'pdf-numerar-paginas',
  name: 'Numerar Páginas de PDF',
  description: 'Adiciona a numeração de páginas em um PDF, com posição, formato e número inicial à sua escolha',
  category: 'pdf',
  keywords: ['pdf', 'numerar', 'numeração', 'páginas', 'rodapé', 'paginar', 'número de página'],
  icon: '🔢',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    file: pdfFile,
    position: z.enum(['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left']).default('bottom-center'),
    template: z.string().min(1).max(60).default('{n}'),
    startAt: z.number().int().min(0).max(100_000).default(1),
    fontSize: z.number().int().min(6).max(48).default(10),
    margin: z.number().int().min(5).max(100).default(24),
    skipFirst: z.boolean().default(false),
  }),
  outputSchema: pdfOutput,
  execute: async ({ file, position, template, startAt, fontSize, margin, skipFirst }) => {
    const { doc } = await loadPdf(file);
    const { StandardFonts, rgb, degrees } = await lib();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;
    // Helvetica padrão só cobre WinAnsi (Latin-1): rejeita caracteres que não poderiam ser desenhados.
    if (!/^[\x20-\x7E\u00A0-\u00FF]*$/.test(template)) {
      throw new ToolError('O formato contém caracteres que a fonte padrão não suporta; use letras sem símbolos especiais');
    }
    pages.forEach((page, index) => {
      if (skipFirst && index === 0) return;
      const label = formatPageLabel(template, startAt + index - (skipFirst ? 1 : 0), total);
      const rotation = page.getRotation().angle;
      const { width, height } = page.getSize();
      const swap = rotation === 90 || rotation === 270;
      const vw = swap ? height : width;
      const vh = swap ? width : height;
      const textWidth = font.widthOfTextAtSize(label, fontSize);
      const [vertical, horizontal] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
      const vx = horizontal === 'left' ? margin : horizontal === 'right' ? vw - margin - textWidth : (vw - textWidth) / 2;
      const vy = vertical === 'bottom' ? margin : vh - margin - fontSize;
      const { x, y } = visualToUser(rotation, width, height, vx, vy);
      page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(rotation) });
    });
    const bytes = await doc.save();
    return pdfResult(bytes, `${baseName(file.name)}-numerado.pdf`, total, `${total - (skipFirst ? 1 : 0)} página(s) numerada(s), a partir de ${startAt}.`);
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 50 },
    position: { label: 'Posição', optionLabels: { 'bottom-center': 'Rodapé, centro', 'bottom-right': 'Rodapé, direita', 'bottom-left': 'Rodapé, esquerda', 'top-center': 'Topo, centro', 'top-right': 'Topo, direita', 'top-left': 'Topo, esquerda' } },
    template: { label: 'Formato', placeholder: 'Página {n} de {total}', help: '{n} é o número da página e {total} o total de páginas.' },
    startAt: { label: 'Começar a numerar em' },
    fontSize: { label: 'Tamanho da fonte (pontos)' },
    margin: { label: 'Distância da borda (pontos)' },
    skipFirst: { label: 'Não numerar a primeira página (capa)' },
  },
  outputLabels: pdfLabels,
  downloads: [{ ...pdfDownload, fileName: 'numerado.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'Desenha o número em cada página com a fonte Helvetica, respeitando páginas giradas. O formato aceita {n} e {total}. A fonte padrão cobre letras latinas com acento, mas não outros alfabetos nem emojis. O processamento é local.',
});

// ---------- imagens para PDF ----------

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MM = 72 / 25.4;

export const imagesToPdfTool = defineTool({
  id: 'jpg-para-pdf',
  name: 'JPG para PDF',
  description: 'Converte fotos JPG e PNG em um PDF, uma por página, com tamanho de página e margens à sua escolha',
  category: 'pdf',
  keywords: ['jpg', 'jpeg', 'png', 'imagem', 'foto', 'converter', 'pdf', 'digitalizar', 'escanear', 'documento'],
  icon: '🖼️',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    images: z.array(imageFile).min(1, 'Envie ao menos 1 imagem').max(PDF_LIMITS.maxImages),
    pageSize: z.enum(['a4', 'letter', 'fit']).default('a4'),
    orientation: z.enum(['auto', 'portrait', 'landscape']).default('auto'),
    marginMm: z.number().min(0).max(50).default(10),
    dpi: z.number().int().min(50).max(600).default(150),
  }),
  outputSchema: pdfOutput,
  execute: async ({ images, pageSize, orientation, marginMm, dpi }) => {
    const { PDFDocument } = await lib();
    const doc = await PDFDocument.create();
    for (const file of images) {
      const bytes = decodeFile(file);
      const type = detectImageType(bytes);
      if (!type) throw new ToolError(`"${file.name}" não é uma imagem JPEG ou PNG (o tipo é conferido pelo conteúdo)`);
      readImageSize(bytes); // valida o cabeçalho e os limites
      let embedded;
      if (type === 'jpeg') {
        const orientationValue = readJpegOrientation(bytes);
        // Fotos de celular guardam a rotação em metadados que o PDF ignora: aplicamos nos pixels.
        embedded = orientationValue === 1 ? await doc.embedJpg(bytes) : await doc.embedJpg(encodeJpeg(applyOrientation(decodeImage(bytes), orientationValue), 92));
      } else embedded = await doc.embedPng(bytes);

      const imgW = embedded.width;
      const imgH = embedded.height;
      if (pageSize === 'fit') {
        const w = (imgW / dpi) * 72;
        const h = (imgH / dpi) * 72;
        doc.addPage([w, h]).drawImage(embedded, { x: 0, y: 0, width: w, height: h });
        continue;
      }
      let [pw, ph] = PAGE_SIZES[pageSize] as readonly [number, number];
      const landscape = orientation === 'landscape' || (orientation === 'auto' && imgW > imgH);
      if (landscape) [pw, ph] = [ph, pw];
      const margin = marginMm * MM;
      const scale = Math.min((pw - 2 * margin) / imgW, (ph - 2 * margin) / imgH);
      if (!(scale > 0)) throw new ToolError('A margem é grande demais para o tamanho da página');
      const w = imgW * scale;
      const h = imgH * scale;
      doc.addPage([pw, ph]).drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    const out = await doc.save();
    return pdfResult(out, 'imagens.pdf', images.length, `${images.length} imagem(ns) convertida(s), ${formatBytes(out.length)}.`);
  },
  fields: {
    images: { label: 'Imagens (JPG ou PNG)', accept: 'image/jpeg,image/png', maxSizeMB: 50, help: 'Até 100 imagens; a ordem de seleção define a ordem das páginas.' },
    pageSize: { label: 'Tamanho da página', optionLabels: { a4: 'A4', letter: 'Carta (Letter)', fit: 'Do tamanho da imagem' } },
    orientation: { label: 'Orientação', optionLabels: { auto: 'Automática (pela imagem)', portrait: 'Retrato', landscape: 'Paisagem' } },
    marginMm: { label: 'Margem (mm)' },
    dpi: { label: 'Resolução para "do tamanho da imagem" (dpi)', help: '150 dpi é um bom equilíbrio para documentos.' },
  },
  outputLabels: pdfLabels,
  downloads: [{ ...pdfDownload, fileName: 'imagens.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'As imagens são embutidas no PDF sem recompressão (JPEG e PNG originais), exceto fotos com rotação nos metadados EXIF, que são giradas e regravadas com qualidade 92 para aparecerem na orientação correta. Cada imagem é ajustada à página mantendo a proporção. O processamento é local; o limite de cada imagem é de cerca de 40 megapixels.',
});

// ---------- comprimir ----------

export interface CompressOptions { quality: number; maxSide: number; removeMetadata: boolean }

export async function compressPdf(file: FilePayload, options: CompressOptions): Promise<{ bytes: Uint8Array; before: number; after: number; recompressed: number; pages: number }> {
  const { doc, bytes } = await loadPdf(file);
  const { PDFName, PDFRawStream, PDFNumber } = await lib();
  let recompressed = 0;

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    if (dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue;
    if (dict.get(PDFName.of('ColorSpace')) !== PDFName.of('DeviceRGB')) continue;
    if (dict.has(PDFName.of('Decode')) || dict.has(PDFName.of('ImageMask'))) continue;
    const original = obj.getContents();
    try {
      let img = decodeImage(original);
      const longest = Math.max(img.width, img.height);
      if (longest > options.maxSide) {
        const k = options.maxSide / longest;
        img = resizeImage(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
      }
      const encoded = encodeJpeg(img, options.quality);
      if (encoded.length >= original.length * 0.92) continue; // ganho pequeno demais
      const newDict = dict.clone(doc.context);
      newDict.set(PDFName.of('Width'), PDFNumber.of(img.width));
      newDict.set(PDFName.of('Height'), PDFNumber.of(img.height));
      newDict.set(PDFName.of('Length'), PDFNumber.of(encoded.length));
      doc.context.assign(ref, PDFRawStream.of(newDict, encoded));
      recompressed++;
    } catch {
      // Imagem que não pôde ser decodificada (por exemplo, CMYK): fica como está.
    }
  }

  if (options.removeMetadata) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
    doc.catalog.delete(PDFName.of('Metadata'));
  }
  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, before: bytes.length, after: out.length, recompressed, pages: doc.getPageCount() };
}

export const compressPdfTool = defineTool({
  id: 'pdf-comprimir',
  name: 'Comprimir PDF',
  description: 'Reduz o tamanho de PDFs com fotos e digitalizações recomprimindo as imagens JPEG internas',
  category: 'pdf',
  keywords: ['pdf', 'comprimir', 'reduzir', 'diminuir tamanho', 'otimizar', 'compress', 'enviar por email'],
  icon: '🗜️',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    file: pdfFile,
    quality: z.number().int().min(20).max(95).default(60),
    maxSide: z.number().int().min(400).max(6000).default(1600),
    removeMetadata: z.boolean().default(true),
  }),
  outputSchema: pdfOutput.extend({ beforeBytes: z.number(), savedPercent: z.number(), imagesRecompressed: z.number() }),
  execute: async ({ file, quality, maxSide, removeMetadata }) => {
    const r = await compressPdf(file, { quality, maxSide, removeMetadata });
    const saved = r.before === 0 ? 0 : Math.round(((r.before - r.after) / r.before) * 1000) / 10;
    // Se não houve ganho, devolve o original: comprimir não deve aumentar o arquivo.
    const keepOriginal = r.after >= r.before;
    const bytes = keepOriginal ? base64ToBytes(file.data) : r.bytes;
    return {
      ...pdfResult(bytes, `${baseName(file.name)}-comprimido.pdf`, r.pages, keepOriginal ? 'O arquivo já está otimizado: não foi possível reduzi-lo, então o original foi mantido.' : `De ${formatBytes(r.before)} para ${formatBytes(r.after)} (${saved}% menor); ${r.recompressed} imagem(ns) recomprimida(s).`),
      beforeBytes: r.before, savedPercent: keepOriginal ? 0 : saved, imagesRecompressed: keepOriginal ? 0 : r.recompressed,
    };
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 50 },
    quality: { label: 'Qualidade das imagens (20 a 95)', help: 'Menor = arquivo menor e imagens com mais perda. 60 costuma ser um bom equilíbrio.' },
    maxSide: { label: 'Lado maior máximo das imagens (pixels)', help: 'Imagens maiores são reduzidas. 1600 px basta para leitura em tela e impressão comum.' },
    removeMetadata: { label: 'Remover metadados (título, autor, programa criador)' },
  },
  outputLabels: { ...pdfLabels, beforeBytes: 'Tamanho original (bytes)', savedPercent: 'Redução (%)', imagesRecompressed: 'Imagens recomprimidas' },
  downloads: [{ ...pdfDownload, fileName: 'comprimido.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'Funciona recomprimindo e, se necessário, reduzindo as imagens JPEG coloridas dentro do PDF, e regravando o arquivo com estrutura compacta. É eficaz em digitalizações e fotos; PDFs só de texto ou com imagens em outros formatos (PNG/JBIG2/CMYK) ganham pouco, e nesse caso o original é mantido. Há perda de qualidade nas imagens: guarde o arquivo original. O processamento é local.',
});

// ---------- proteger e remover senha ----------

export const protectPdfTool = defineTool({
  id: 'pdf-proteger',
  name: 'Proteger PDF com Senha',
  description: 'Criptografa um PDF com senha (AES-256) e define se o documento pode ser impresso, copiado ou editado',
  category: 'pdf',
  keywords: ['pdf', 'proteger', 'senha', 'criptografar', 'encrypt', 'bloquear', 'segurança', 'aes'],
  icon: '🔐',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    file: pdfFile,
    password: z.string().min(4, 'Use ao menos 4 caracteres').max(64),
    ownerPassword: z.string().min(4).max(64).optional(),
    allowPrint: z.boolean().default(true),
    allowCopy: z.boolean().default(true),
    allowModify: z.boolean().default(false),
  }),
  outputSchema: pdfOutput.extend({ ownerPasswordNote: z.string() }),
  execute: async ({ file, password, ownerPassword, allowPrint, allowCopy, allowModify }) => {
    const { doc } = await loadPdf(file);
    const owner = ownerPassword ?? secureRandomString('abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', 24);
    doc.encrypt({
      userPassword: password, ownerPassword: owner,
      permissions: { printing: allowPrint ? 'highResolution' : false, copying: allowCopy, modifying: allowModify, annotating: allowModify, fillingForms: allowModify, contentAccessibility: true, documentAssembly: allowModify },
    });
    const bytes = await doc.save();
    return {
      ...pdfResult(bytes, `${baseName(file.name)}-protegido.pdf`, doc.getPageCount(), 'PDF criptografado com AES-256. Guarde a senha: sem ela não há como abrir o arquivo.'),
      ownerPasswordNote: ownerPassword ? 'Senha de proprietário definida por você.' : 'Foi usada uma senha de proprietário aleatória que não é exibida: as restrições de impressão, cópia e edição valem para quem abrir com a senha de usuário, e você não poderá alterá-las depois.',
    };
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 50 },
    password: { label: 'Senha para abrir o PDF', help: 'Ao menos 4 caracteres. Prefira uma senha longa. Se esquecer, não há como recuperar.' },
    ownerPassword: { label: 'Senha de proprietário (opcional)', help: 'Permite alterar as restrições. Se vazio, é gerada uma aleatória e descartada.' },
    allowPrint: { label: 'Permitir imprimir' }, allowCopy: { label: 'Permitir copiar texto e imagens' }, allowModify: { label: 'Permitir editar, anotar e montar páginas' },
  },
  outputLabels: { ...pdfLabels, ownerPasswordNote: 'Senha de proprietário' },
  downloads: [{ ...pdfDownload, fileName: 'protegido.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'Usa criptografia AES-256 (ISO 32000-2). A senha de usuário é exigida para abrir o arquivo; as permissões (imprimir, copiar, editar) são respeitadas por leitores de PDF em conformidade, mas não impedem quem tem a senha de usuário de capturar a tela. A senha é processada no seu dispositivo e nunca enviada a servidores. Esquecer a senha torna o arquivo irrecuperável.',
});

export const unlockPdfTool = defineTool({
  id: 'pdf-remover-senha',
  name: 'Remover Senha de PDF',
  description: 'Gera uma cópia sem senha de um PDF protegido, desde que você informe a senha correta',
  category: 'pdf',
  keywords: ['pdf', 'remover senha', 'desbloquear', 'desproteger', 'decrypt', 'abrir pdf protegido'],
  icon: '🔓',
  modes: ['browser', 'node'],
  inputSchema: z.object({ file: pdfFile, password: z.string().max(128) }),
  outputSchema: pdfOutput,
  execute: async ({ file, password }) => {
    const { doc: source } = await loadPdf(file, password);
    const { PDFDocument } = await lib();
    // Copiar as páginas para um documento novo grava um arquivo sem criptografia.
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(source, source.getPageIndices())) out.addPage(p);
    const bytes = await out.save();
    return pdfResult(bytes, `${baseName(file.name)}-sem-senha.pdf`, out.getPageCount(), 'Cópia sem senha gerada com a senha informada. Marcadores e formulários do original podem não ser mantidos.');
  },
  fields: {
    file: { label: 'Arquivo PDF protegido', accept: 'application/pdf', maxSizeMB: 50 },
    password: { label: 'Senha do PDF', help: 'Obrigatória. Se o arquivo não tem senha de abertura, deixe vazio.' },
  },
  outputLabels: pdfLabels,
  downloads: [{ ...pdfDownload, fileName: 'sem-senha.pdf' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'Funciona somente quando você conhece a senha: esta ferramenta não tenta descobrir senhas nem contornar a proteção de arquivos de terceiros. Use apenas em documentos que você tem autorização para acessar. Se a senha estiver errada, a operação falha com uma mensagem clara.',
});

/** Partes mínimas das APIs de canvas do navegador (este pacote não carrega a biblioteca DOM). */
interface CanvasContextLike { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void }
interface BlobLike { arrayBuffer(): Promise<ArrayBuffer> }
interface BrowserGlobals {
  OffscreenCanvas?: new (w: number, h: number) => { getContext(t: '2d'): CanvasContextLike; convertToBlob(o: { type: string; quality: number }): Promise<BlobLike> };
  document?: { createElement(tag: 'canvas'): { width: number; height: number; getContext(t: '2d'): CanvasContextLike; toBlob(cb: (b: BlobLike | null) => void, type: string, quality: number): void } };
}

function createCanvas(g: BrowserGlobals, w: number, h: number, quality: number): { context: CanvasContextLike; toJpeg: () => Promise<BlobLike> } {
  if (g.OffscreenCanvas) {
    const c = new g.OffscreenCanvas(w, h);
    return { context: c.getContext('2d'), toJpeg: () => c.convertToBlob({ type: 'image/jpeg', quality }) };
  }
  const c = g.document!.createElement('canvas');
  c.width = w;
  c.height = h;
  return { context: c.getContext('2d'), toJpeg: () => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality)) };
}

// ---------- PDF para JPG (somente no navegador) ----------

export const pdfToJpgTool = defineTool({
  id: 'pdf-para-jpg',
  name: 'PDF para JPG',
  description: 'Converte as páginas de um PDF em imagens JPG, em um ZIP, com a resolução que você escolher',
  category: 'pdf',
  keywords: ['pdf', 'jpg', 'jpeg', 'imagem', 'converter', 'páginas', 'exportar', 'png'],
  icon: '📸',
  modes: ['browser'],
  inputSchema: z.object({
    file: pdfFile,
    pages: z.string().max(500).default('1-'),
    dpi: z.number().int().min(36).max(300).default(150),
    quality: z.number().int().min(30).max(100).default(85),
  }),
  outputSchema: z.object({ zip: z.string(), fileName: z.string(), images: z.number(), pages: z.number(), summary: z.string() }),
  execute: async ({ file, pages, dpi, quality }) => {
    const g = globalThis as unknown as BrowserGlobals;
    if (!g.OffscreenCanvas && !g.document) throw new ToolError('A conversão de PDF para JPG precisa de um navegador (usa o desenho em tela). Use o site do Gen.');
    const bytes = decodeFile(file);
    if (!isPdfBytes(bytes)) throw new ToolError(`"${file.name}" não é um PDF`);
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'PasswordException') throw new ToolError('O PDF está protegido por senha. Remova a senha primeiro.');
      throw new ToolError('Não foi possível abrir o PDF (arquivo corrompido?)');
    }
    const wanted = expandRanges(parsePageRanges(pages, pdf.numPages));
    if (wanted.length > 200) throw new ToolError('Selecione no máximo 200 páginas por vez');
    const outputs: Record<string, Uint8Array> = {};
    for (const n of wanted) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      if (viewport.width * viewport.height > 80_000_000) throw new ToolError('A página fica grande demais nessa resolução; reduza o dpi');
      const w = Math.ceil(viewport.width);
      const h = Math.ceil(viewport.height);
      const { context, toJpeg } = createCanvas(g, w, h, quality / 100);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, w, h);
      await page.render({ canvasContext: context as never, viewport }).promise;
      const blob = await toJpeg();
      outputs[`${baseName(file.name)}_pagina-${String(n).padStart(3, '0')}.jpg`] = new Uint8Array(await blob.arrayBuffer());
      page.cleanup();
    }
    await pdf.destroy();
    const zip = await zipFiles(outputs);
    return { zip: bytesToBase64(zip), fileName: `${baseName(file.name)}-jpg.zip`, images: wanted.length, pages: pdf.numPages, summary: `${wanted.length} página(s) convertida(s) a ${dpi} dpi.` };
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 50 },
    pages: { label: 'Páginas', placeholder: '1-3, 5, 8-', help: '"1-" converte todas.' },
    dpi: { label: 'Resolução (dpi)', help: '72 para tela, 150 para uso geral, 300 para impressão.' },
    quality: { label: 'Qualidade do JPG (30 a 100)' },
  },
  outputLabels: { zip: 'ZIP (Base64)', fileName: 'Arquivo', images: 'Imagens', pages: 'Páginas do PDF', summary: 'Resumo' },
  downloads: [{ field: 'zip', fileName: 'paginas-jpg.zip', mimeType: 'application/zip', encoding: 'base64', label: 'Baixar ZIP' }],
  hiddenOutputs: ['zip'],
  examples: [],
  documentation:
    'Renderiza cada página no seu navegador com o motor PDF.js e a salva como JPG sobre fundo branco. Disponível apenas no navegador (precisa de canvas); a CLI não oferece esta conversão. O processamento é local. Páginas muito grandes ou em alta resolução podem consumir muita memória.',
});

export const pdfTools = [mergePdfTool, splitPdfTool, numberPagesTool, imagesToPdfTool, compressPdfTool, protectPdfTool, unlockPdfTool, pdfToJpgTool];
