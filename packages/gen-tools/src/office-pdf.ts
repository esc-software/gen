import { z } from 'zod';
import { ToolError, base64ToBytes, bytesToBase64, defineTool, filePayloadSchema, type FilePayload } from '@esc/gen-core';
import { isPdfBytes } from './pdf.js';

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_DOCX_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 300;
const MAX_OUTPUT_PAGES = 500;

const pdfFile = filePayloadSchema.extend({ data: z.string().min(1).max(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 16) });
const docxFile = filePayloadSchema.extend({ data: z.string().min(1).max(Math.ceil((MAX_DOCX_BYTES * 4) / 3) + 16) });

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'documento';

function decode(file: FilePayload, limit: number): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(file.data);
  } catch {
    throw new ToolError(`"${file.name}": o conteúdo do arquivo não é Base64 válido`);
  }
  if (bytes.length === 0) throw new ToolError(`"${file.name}" está vazio`);
  if (bytes.length > limit) throw new ToolError(`"${file.name}" tem mais de ${limit / 1024 / 1024} MB`);
  return bytes;
}

// =====================================================================================================================
// PDF para Word (texto)
// =====================================================================================================================

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

export interface Line {
  text: string;
  y: number;
  size: number;
}

export type Block = { kind: 'heading'; level: 1 | 2 | 3; text: string } | { kind: 'paragraph'; text: string } | { kind: 'bullet'; text: string } | { kind: 'pagebreak' };

/** Agrupa os pedaços de texto de uma página em linhas, de cima para baixo e da esquerda para a direita. */
export function groupLines(items: readonly TextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim() !== '' || i.width > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    const ref = row?.[0];
    if (row && ref && Math.abs(ref.y - item.y) <= Math.max(ref.size, item.size) * 0.4) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let end = Number.NEGATIVE_INFINITY;
    for (const item of row) {
      if (text !== '' && item.x - end > item.size * 0.18 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
      text += item.str;
      end = item.x + item.width;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text === '') return [];
    const chars = row.reduce((n, i) => n + i.str.length, 0) || 1;
    const size = row.reduce((s, i) => s + i.size * i.str.length, 0) / chars;
    return [{ text, y: row[0]!.y, size }];
  });
}

const BULLET = /^([•◦▪●○■\-–—*]|\d{1,3}[.)])\s+/;

/** Junta linhas em parágrafos, títulos e itens de lista, usando o tamanho da letra e o espaço entre as linhas. */
export function buildBlocks(lines: readonly Line[], bodySize: number): Block[] {
  const blocks: Block[] = [];
  let current: { text: string; size: number; y: number } | undefined;
  const flush = () => {
    if (!current) return;
    const ratio = current.size / bodySize;
    const text = current.text;
    if (ratio >= 1.25 && text.length <= 140) blocks.push({ kind: 'heading', level: ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : 3, text });
    else if (BULLET.test(text) && /^[•◦▪●○■\-–—*]\s/.test(text)) blocks.push({ kind: 'bullet', text: text.replace(BULLET, '') });
    else blocks.push({ kind: 'paragraph', text });
    current = undefined;
  };
  for (const line of lines) {
    if (current) {
      const gap = current.y - line.y;
      const sameSize = Math.abs(line.size - current.size) <= current.size * 0.12;
      const startsItem = BULLET.test(line.text);
      const isHeading = current.size / bodySize >= 1.25;
      if (sameSize && !startsItem && !isHeading && gap <= Math.max(line.size, current.size) * 1.55) {
        // Palavra partida por hífen no fim da linha volta a ser uma só quando a próxima começa em minúscula.
        current.text = /\p{L}-$/u.test(current.text) && /^\p{Ll}/u.test(line.text) ? current.text.slice(0, -1) + line.text : `${current.text} ${line.text}`;
        current.y = line.y;
        continue;
      }
      flush();
    }
    current = { text: line.text, size: line.size, y: line.y };
  }
  flush();
  return blocks;
}

/** Tamanho de letra mais comum (por quantidade de caracteres): é o corpo do texto. */
export function bodyFontSize(lines: readonly Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const key = Math.round(l.size * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + l.text.length);
  }
  let best = 11;
  let max = -1;
  for (const [size, n] of counts) if (n > max) [best, max] = [size, n];
  return best || 11;
}

export const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const pdfToWordTool = defineTool({
  id: 'pdf-para-word',
  name: 'PDF para Word (texto)',
  description: 'Converte o texto de um PDF em um documento Word (.docx) editável, com títulos, parágrafos e listas; não mantém colunas, tabelas nem imagens',
  category: 'pdf',
  keywords: ['pdf para word', 'converter pdf em word', 'pdf para docx', 'pdf para doc', 'editar pdf', 'extrair texto do pdf', 'pdf editável'],
  icon: '📝',
  modes: ['browser'],
  inputSchema: z.object({ file: pdfFile, pageBreaks: z.boolean().default(true) }),
  outputSchema: z.object({ docx: z.string(), fileName: z.string(), pages: z.number(), paragraphs: z.number(), summary: z.string() }),
  execute: async ({ file, pageBreaks }) => {
    const bytes = decode(file, MAX_PDF_BYTES);
    if (!isPdfBytes(bytes)) throw new ToolError(`"${file.name}" não é um PDF (o conteúdo não começa com %PDF-)`);
    const pdfjs = await import('pdfjs-dist');
    if (typeof (globalThis as { document?: unknown }).document !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'PasswordException') throw new ToolError('O PDF está protegido por senha. Remova a senha primeiro.');
      throw new ToolError('Não foi possível abrir o PDF (arquivo corrompido?)');
    }
    if (pdf.numPages > MAX_PDF_PAGES) throw new ToolError(`O PDF tem ${pdf.numPages} páginas; o limite é ${MAX_PDF_PAGES}`);

    const pages: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const [a = 0, b = 0, , , x = 0, y = 0] = raw.transform as number[];
        items.push({ str: raw.str, x, y, width: raw.width, size: Math.hypot(a, b) || raw.height || 11 });
      }
      pages.push(groupLines(items));
      page.cleanup();
    }
    await pdf.destroy();

    const all = pages.flat();
    const textChars = all.reduce((n, l) => n + l.text.length, 0);
    if (textChars < 5) throw new ToolError('Este PDF não tem texto selecionável (provavelmente é um documento escaneado ou só de imagens). A conversão exigiria reconhecimento de caracteres (OCR), que esta ferramenta não faz.');
    if (textChars > 3_000_000) throw new ToolError('O PDF tem texto demais para converter aqui');

    const body = bodyFontSize(all);
    const blocks: Block[] = [];
    pages.forEach((lines, i) => {
      if (i > 0 && pageBreaks) blocks.push({ kind: 'pagebreak' });
      blocks.push(...buildBlocks(lines, body));
    });

    const docx = await import('docx');
    const headings = [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3] as const;
    const children = blocks.map((b) => {
      if (b.kind === 'pagebreak') return new docx.Paragraph({ children: [new docx.PageBreak()] });
      if (b.kind === 'heading') return new docx.Paragraph({ heading: headings[b.level - 1] as (typeof headings)[number], children: [new docx.TextRun(b.text)] });
      if (b.kind === 'bullet') return new docx.Paragraph({ bullet: { level: 0 }, children: [new docx.TextRun(b.text)] });
      return new docx.Paragraph({ spacing: { after: 120 }, children: [new docx.TextRun(b.text)] });
    });
    const doc = new docx.Document({ creator: 'Gen (ESC Software)', title: baseName(file.name), sections: [{ children }] });
    const base64 = await docx.Packer.toBase64String(doc);
    const paragraphs = blocks.filter((b) => b.kind !== 'pagebreak').length;
    return {
      docx: base64,
      fileName: `${baseName(file.name)}.docx`,
      pages: pages.length,
      paragraphs,
      summary: `${pages.length} página(s) convertida(s) em ${paragraphs} bloco(s) de texto. Confira o resultado: colunas, tabelas, imagens e a aparência original não são mantidas.`,
    };
  },
  fields: {
    file: { label: 'Arquivo PDF', accept: 'application/pdf', maxSizeMB: 30 },
    pageBreaks: { label: 'Manter a quebra de página entre as páginas do PDF' },
  },
  outputLabels: { docx: 'DOCX (Base64)', fileName: 'Arquivo', pages: 'Páginas lidas', paragraphs: 'Blocos de texto', summary: 'Resumo' },
  downloads: [{ field: 'docx', fileName: 'documento.docx', mimeType: WORD_MIME, encoding: 'base64', label: 'Baixar Word (.docx)' }],
  hiddenOutputs: ['docx'],
  examples: [],
  documentation:
    'Lê o texto do PDF no seu navegador (nada é enviado), agrupa as linhas em títulos, parágrafos e listas pelo tamanho da letra e pelo espaço entre elas, e gera um .docx editável. O que NÃO é mantido: colunas (viram uma sequência de texto), tabelas, imagens, cabeçalhos e rodapés, fontes e cores. PDFs escaneados (imagens de texto) não funcionam, porque exigiriam OCR. Limites: 30 MB e 300 páginas. Para um layout fiel, use o Word ou o LibreOffice.',
});

// =====================================================================================================================
// Word para PDF (formatação básica)
// =====================================================================================================================

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type DocBlock =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'item'; depth: number; marker: string; runs: Run[] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•' };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
    }
    return Object.hasOwn(ENTITIES, body.toLowerCase()) ? (ENTITIES[body.toLowerCase()] as string) : m;
  });

/** Lê o HTML simples que o mammoth produz (títulos, parágrafos, listas, tabelas, negrito e itálico). */
export function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const tokens = html.match(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>|[^<]+/g) ?? [];
  let runs: Run[] = [];
  let bold = 0;
  let italic = 0;
  let heading = 0;
  let inCell = false;
  let rowCells: string[] = [];
  let cellText = '';
  const lists: Array<{ ordered: boolean; n: number }> = [];
  let pendingItem: { depth: number; marker: string } | undefined;

  const text = (t: string) => {
    const value = decodeEntities(t).replace(/\s+/g, ' ');
    if (value === '' || value === ' ' && runs.length === 0 && !inCell) return;
    if (inCell) cellText += value;
    else runs.push({ text: value, bold: bold > 0 || heading > 0, italic: italic > 0 });
  };
  const endBlock = () => {
    const cleaned = runs.filter((r) => r.text !== '');
    if (cleaned.length > 0) {
      if (cleaned[0]) cleaned[0] = { ...cleaned[0], text: cleaned[0].text.replace(/^\s+/, '') };
      const last = cleaned.length - 1;
      cleaned[last] = { ...(cleaned[last] as Run), text: (cleaned[last] as Run).text.replace(/\s+$/, '') };
      const hasText = cleaned.some((r) => r.text.trim() !== '');
      if (hasText) {
        if (heading > 0) blocks.push({ kind: 'heading', level: heading, runs: cleaned });
        else if (pendingItem) blocks.push({ kind: 'item', depth: pendingItem.depth, marker: pendingItem.marker, runs: cleaned });
        else blocks.push({ kind: 'paragraph', runs: cleaned });
      }
    }
    runs = [];
    pendingItem = undefined;
  };

  for (const token of tokens) {
    if (token[0] !== '<') {
      text(token);
      continue;
    }
    const closing = token[1] === '/';
    const tag = /^<\/?([a-zA-Z0-9]+)/.exec(token)?.[1]?.toLowerCase() ?? '';
    if (/^h[1-6]$/.test(tag)) {
      if (closing) {
        endBlock();
        heading = 0;
      } else {
        endBlock();
        heading = Number(tag[1]);
      }
    } else if (tag === 'p') {
      if (closing) {
        if (inCell) cellText += ' ';
        else endBlock();
      } else if (!inCell) endBlock();
    } else if (tag === 'strong' || tag === 'b') bold += closing ? -1 : 1;
    else if (tag === 'em' || tag === 'i') italic += closing ? -1 : 1;
    else if (tag === 'ul' || tag === 'ol') {
      if (closing) lists.pop();
      else {
        endBlock();
        lists.push({ ordered: tag === 'ol', n: 0 });
      }
    } else if (tag === 'li') {
      if (closing) endBlock();
      else {
        endBlock();
        const list = lists.at(-1);
        if (list) list.n += 1;
        pendingItem = { depth: Math.max(0, lists.length - 1), marker: list?.ordered ? `${list.n}.` : '•' };
      }
    } else if (tag === 'br') {
      if (inCell) cellText += ' ';
      else runs.push({ text: ' ', bold: false, italic: false });
    } else if (tag === 'td' || tag === 'th') {
      if (closing) {
        rowCells.push(cellText.replace(/\s+/g, ' ').trim());
        cellText = '';
        inCell = false;
      } else {
        inCell = true;
        cellText = '';
      }
    } else if (tag === 'tr') {
      if (closing) {
        const line = rowCells.filter((c, i, a) => c !== '' || i < a.length - 1).join(' | ');
        if (line.replace(/[|\s]/g, '') !== '') blocks.push({ kind: 'paragraph', runs: [{ text: line, bold: false, italic: false }] });
        rowCells = [];
      } else {
        endBlock();
        rowCells = [];
      }
    }
  }
  endBlock();
  return blocks;
}

const HEADING_SIZES = [0, 22, 18, 15, 13, 12, 11.5];
const PAGE = { width: 595.28, height: 841.89, margin: 56.7 };
const BODY_SIZE = 11;

interface Word {
  text: string;
  bold: boolean;
  italic: boolean;
}

export const DOCX_HELP = 'O arquivo precisa ser um .docx (Word 2007 ou mais novo). Salve o arquivo antigo (.doc) como .docx no Word e tente de novo.';

export const wordToPdfTool = defineTool({
  id: 'word-para-pdf',
  name: 'Word para PDF (formatação básica)',
  description: 'Converte um documento Word (.docx) em PDF mantendo títulos, parágrafos, listas, negrito e itálico; imagens e tabelas complexas não são mantidas',
  category: 'pdf',
  keywords: ['word para pdf', 'docx para pdf', 'converter word em pdf', 'doc para pdf', 'salvar word como pdf', 'transformar documento em pdf'],
  icon: '📄',
  modes: ['browser', 'node'],
  inputSchema: z.object({ file: docxFile, fontSize: z.number().min(9).max(14).default(BODY_SIZE) }),
  outputSchema: z.object({ pdf: z.string(), fileName: z.string(), pages: z.number(), blocks: z.number(), summary: z.string() }),
  execute: async ({ file, fontSize }) => {
    const bytes = decode(file, MAX_DOCX_BYTES);
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new ToolError(`"${file.name}" é um arquivo Word antigo (.doc). ${DOCX_HELP}`);
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ToolError(`"${file.name}" não é um .docx (o conteúdo não é um arquivo ZIP do Word). ${DOCX_HELP}`);

    const mod = (await import('mammoth')) as unknown as { default?: unknown } & Record<string, unknown>;
    const mammoth = (mod.default ?? mod) as {
      convertToHtml(input: { buffer: Uint8Array } | { arrayBuffer: ArrayBuffer }, options?: unknown): Promise<{ value: string }>;
      images: { imgElement(fn: () => Promise<{ src: string }>): unknown };
    };
    // Node usa `buffer`; o pacote do navegador usa `arrayBuffer`.
    const input = typeof (globalThis as { Buffer?: unknown }).Buffer !== 'undefined'
      ? { buffer: (globalThis as unknown as { Buffer: { from(b: Uint8Array): Uint8Array } }).Buffer.from(bytes) }
      : { arrayBuffer: bytes.slice().buffer as ArrayBuffer };
    let html: string;
    try {
      html = (await mammoth.convertToHtml(input, { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) })).value;
    } catch {
      throw new ToolError(`Não foi possível ler "${file.name}". O arquivo pode estar corrompido ou protegido. ${DOCX_HELP}`);
    }
    const blocks = htmlToBlocks(html);
    if (blocks.length === 0) throw new ToolError('O documento não tem texto para converter (só imagens ou vazio)');
    const total = blocks.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.text.length, 0), 0);
    if (total > 3_000_000) throw new ToolError('O documento tem texto demais para converter aqui');

    const { PDFDocument, StandardFonts, rgb } = await import('@cantoo/pdf-lib');
    const pdf = await PDFDocument.create();
    pdf.setProducer('Gen (ESC Software)');
    pdf.setCreator('Gen (ESC Software)');
    pdf.setTitle(baseName(file.name));
    const fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };
    const fontFor = (w: { bold: boolean; italic: boolean }) => (w.bold && w.italic ? fonts.boldItalic : w.bold ? fonts.bold : w.italic ? fonts.italic : fonts.regular);

    // Helvetica só tem o alfabeto latino (WinAnsi): o resto vira "?" e é contado para avisar.
    let replaced = 0;
    const charset = new Set<number>(fonts.regular.getCharacterSet());
    const clean = (s: string): string =>
      Array.from(s.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\t/g, ' '))
        .map((ch) => {
          if (charset.has(ch.codePointAt(0) as number)) return ch;
          replaced++;
          return '?';
        })
        .join('');

    const contentWidth = PAGE.width - PAGE.margin * 2;
    let page = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - PAGE.margin;
    const newPage = () => {
      if (pdf.getPageCount() >= MAX_OUTPUT_PAGES) throw new ToolError(`O documento passa de ${MAX_OUTPUT_PAGES} páginas em PDF`);
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    };

    for (const block of blocks) {
      const size = block.kind === 'heading' ? (HEADING_SIZES[Math.min(block.level, 6)] as number) * (fontSize / BODY_SIZE) : fontSize;
      const lineHeight = size * 1.35;
      const indent = block.kind === 'item' ? 18 * (block.depth + 1) : 0;
      const width = contentWidth - indent;
      // Palavras com o estilo de cada trecho.
      const words: Word[] = block.runs.flatMap((r) =>
        clean(r.text).split(/(\s+)/).filter((t) => t !== '').map((text) => ({ text, bold: r.bold || block.kind === 'heading', italic: r.italic }))
      );
      const lines: Word[][] = [];
      let line: Word[] = [];
      let used = 0;
      for (const word of words) {
        const w = fontFor(word).widthOfTextAtSize(word.text, size);
        const isSpace = word.text.trim() === '';
        if (!isSpace && used + w > width && line.length > 0) {
          while (line.at(-1)?.text.trim() === '') line.pop();
          lines.push(line);
          line = [];
          used = 0;
        }
        if (isSpace && line.length === 0) continue;
        // Palavra maior que a linha: quebra por caracteres.
        if (!isSpace && w > width) {
          let chunk = '';
          for (const ch of word.text) {
            if (fontFor(word).widthOfTextAtSize(chunk + ch, size) > width && chunk !== '') {
              lines.push([{ ...word, text: chunk }]);
              chunk = '';
            }
            chunk += ch;
          }
          line = [{ ...word, text: chunk }];
          used = fontFor(word).widthOfTextAtSize(chunk, size);
          continue;
        }
        line.push(word);
        used += w;
      }
      while (line.at(-1)?.text.trim() === '') line.pop();
      if (line.length > 0) lines.push(line);

      const before = block.kind === 'heading' ? size * 0.6 : 0;
      const after = block.kind === 'heading' ? size * 0.35 : block.kind === 'item' ? 3 : 7;
      // Título não fica sozinho no fim da página.
      const needed = before + lineHeight * (block.kind === 'heading' ? Math.min(lines.length + 1, 3) : Math.min(lines.length, 2));
      if (y - needed < PAGE.margin && y < PAGE.height - PAGE.margin) newPage();
      y -= before;

      lines.forEach((l, index) => {
        if (y - lineHeight < PAGE.margin) newPage();
        y -= lineHeight;
        if (block.kind === 'item' && index === 0) page.drawText(clean(block.marker), { x: PAGE.margin + indent - 14, y, size, font: fonts.regular, color: rgb(0, 0, 0) });
        let x = PAGE.margin + indent;
        for (const word of l) {
          const font = fontFor(word);
          if (word.text.trim() !== '') page.drawText(word.text, { x, y, size, font, color: rgb(0, 0, 0) });
          x += font.widthOfTextAtSize(word.text, size);
        }
      });
      y -= after;
    }

    const out = await pdf.save();
    const pages = pdf.getPageCount();
    const notes = [`${blocks.length} bloco(s) de texto em ${pages} página(s).`];
    if (replaced > 0) notes.push(`${replaced} caractere(s) fora do alfabeto latino foram trocados por "?".`);
    notes.push('Imagens não foram mantidas e tabelas viraram linhas de texto.');
    return { pdf: bytesToBase64(out), fileName: `${baseName(file.name)}.pdf`, pages, blocks: blocks.length, summary: notes.join(' ') };
  },
  fields: {
    file: { label: 'Arquivo Word (.docx)', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', maxSizeMB: 20 },
    fontSize: { label: 'Tamanho da letra do texto (9 a 14)', help: 'Os títulos acompanham.' },
  },
  outputLabels: { pdf: 'PDF (Base64)', fileName: 'Arquivo', pages: 'Páginas', blocks: 'Blocos de texto', summary: 'Resumo' },
  downloads: [{ field: 'pdf', fileName: 'documento.pdf', mimeType: 'application/pdf', encoding: 'base64', label: 'Baixar PDF' }],
  hiddenOutputs: ['pdf'],
  examples: [],
  documentation:
    'Lê o .docx no seu navegador (nada é enviado), extrai títulos, parágrafos, listas, negrito e itálico, e monta um PDF A4 com a fonte Helvetica. O que NÃO é mantido: imagens, formas, cabeçalhos e rodapés, colunas, fontes e cores do original; tabelas viram uma linha de texto por linha da tabela, com as colunas separadas por "|". Caracteres fora do alfabeto latino (como emojis ou ideogramas) viram "?". Arquivos .doc antigos precisam ser salvos como .docx. Para um layout idêntico ao do Word, use "Salvar como PDF" no próprio Word.',
});

export const officePdfTools = [pdfToWordTool, wordToPdfTool];
