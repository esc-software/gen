import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { secureRandomString } from '@esc/gen-utils';
import { removeDiacritics } from './slug.js';
import { toBase64 } from './hash.js';
import { validatePhoneBR, validatePixKey } from './validators-br.js';
import { validateEmail, validateUrl } from './validators-intl.js';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hexColor = (def: string) => z.string().regex(HEX_COLOR, 'Use uma cor hexadecimal, como #000000').default(def);

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(svg))}`;
}

// ---------- QR Code ----------

export interface QrOptions {
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  size: number;
  margin: number;
  dark: string;
  light: string;
}

export const QR_DEFAULTS: QrOptions = { errorCorrection: 'M', size: 256, margin: 2, dark: '#000000', light: '#ffffff' };

/** Gera o QR Code como SVG. A biblioteca é carregada sob demanda, para não pesar no carregamento inicial. */
export async function makeQrSvg(text: string, options: Partial<QrOptions> = {}): Promise<string> {
  const o = { ...QR_DEFAULTS, ...options };
  const QR = (await import('qrcode')).default;
  try {
    return await QR.toString(text, {
      type: 'svg', errorCorrectionLevel: o.errorCorrection, margin: o.margin, width: o.size, color: { dark: o.dark, light: o.light },
    });
  } catch {
    throw new ToolError('O conteúdo é grande demais para um QR Code neste nível de correção. Reduza o texto ou use o nível L.');
  }
}

export const qrCodeTool = defineTool({
  id: 'qr-code',
  name: 'Gerador de QR Code',
  description: 'Cria QR Codes de texto, links, contatos e Wi-Fi, com cores e nível de correção de erro, em SVG',
  category: 'geradores',
  keywords: ['qr code', 'qrcode', 'código qr', 'link', 'texto', 'gerar', 'svg', 'imprimir'],
  icon: '▦',
  modes: ['browser', 'node'],
  live: true,
  ui: 'svg-preview',
  inputSchema: z.object({
    text: z.string().max(2000).default(''),
    errorCorrection: z.enum(['L', 'M', 'Q', 'H']).default('M'),
    size: z.number().int().min(64).max(2048).default(256),
    margin: z.number().int().min(0).max(10).default(2),
    dark: hexColor('#000000'),
    light: hexColor('#ffffff'),
  }),
  outputSchema: z.object({ svg: z.string(), dataUrl: z.string(), characters: z.number() }),
  execute: async ({ text, errorCorrection, size, margin, dark, light }) => {
    if (text.trim() === '') throw new ToolError('Informe o texto ou o link do QR Code');
    const svg = await makeQrSvg(text, { errorCorrection, size, margin, dark, light });
    return { svg, dataUrl: svgToDataUrl(svg), characters: text.length };
  },
  fields: {
    text: { label: 'Conteúdo', multiline: true, placeholder: 'https://exemplo.com.br' },
    errorCorrection: { label: 'Correção de erros', optionLabels: { L: 'L — baixa (7%)', M: 'M — média (15%)', Q: 'Q — alta (25%)', H: 'H — máxima (30%)' }, help: 'Quanto maior, mais legível com sujeira ou dano, mas o código fica mais denso.' },
    size: { label: 'Tamanho (pixels)' },
    margin: { label: 'Margem (módulos)', help: 'Mantenha ao menos 2 (idealmente 4) para leitura confiável.' },
    dark: { label: 'Cor dos módulos' },
    light: { label: 'Cor do fundo' },
  },
  outputLabels: { svg: 'SVG', dataUrl: 'Data URL', characters: 'Caracteres' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'qrcode.svg', mimeType: 'image/svg+xml', label: 'Baixar SVG' }],
  examples: [{ description: 'Link simples', input: { text: 'https://exemplo.com.br', errorCorrection: 'M', size: 256, margin: 2, dark: '#000000', light: '#ffffff' } }],
  documentation:
    'O QR Code é gerado no seu dispositivo, e o conteúdo não é enviado a servidores. Use cores com bom contraste (módulos escuros sobre fundo claro) para garantir a leitura; inverter as cores pode impedir que alguns leitores funcionem. Teste sempre a leitura antes de imprimir. A capacidade máxima depende do tipo de conteúdo e do nível de correção.',
});

// ---------- Wi-Fi ----------

/** Escapa os caracteres especiais do formato WIFI: (barra, ponto e vírgula, vírgula, dois-pontos e aspas). */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function wifiPayload(ssid: string, password: string, security: 'WPA' | 'WEP' | 'nopass', hidden: boolean): string {
  const parts = [`T:${security}`, `S:${escapeWifi(ssid)}`];
  if (security !== 'nopass') parts.push(`P:${escapeWifi(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

/** Alfabeto sem caracteres que se confundem (0/O, 1/l/I) para senhas ditadas ou digitadas. */
const READABLE = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const wifiTool = defineTool({
  id: 'senha-wifi',
  name: 'Gerador de Senha e QR Code de Wi-Fi',
  description: 'Gera uma senha segura de Wi-Fi e o QR Code para visitantes conectarem sem digitar',
  category: 'geradores',
  keywords: ['wifi', 'wi-fi', 'senha wifi', 'rede', 'qr code', 'roteador', 'visitantes', 'wpa'],
  icon: '📶',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({
    ssid: z.string().min(1).max(32).default('MinhaRede'),
    generatePassword: z.boolean().default(true),
    password: z.string().max(63).optional(),
    length: z.number().int().min(8).max(63).default(16),
    security: z.enum(['WPA', 'WEP', 'nopass']).default('WPA'),
    hidden: z.boolean().default(false),
  }),
  outputSchema: z.object({ password: z.string(), payload: z.string(), svg: z.string(), dataUrl: z.string() }),
  execute: async ({ ssid, generatePassword, password, length, security, hidden }) => {
    let pass = '';
    if (security !== 'nopass') {
      if (generatePassword) pass = secureRandomString(READABLE, length);
      else {
        pass = password ?? '';
        if (security === 'WPA' && (pass.length < 8 || pass.length > 63)) throw new ToolError('A senha WPA deve ter de 8 a 63 caracteres');
        if (pass === '') throw new ToolError('Informe a senha ou marque "Gerar senha"');
      }
    }
    const payload = wifiPayload(ssid, pass, security, hidden);
    const svg = await makeQrSvg(payload, { errorCorrection: 'M', size: 256, margin: 4 });
    return { password: pass || '(rede aberta)', payload, svg, dataUrl: svgToDataUrl(svg) };
  },
  fields: {
    ssid: { label: 'Nome da rede (SSID)' },
    generatePassword: { label: 'Gerar uma senha segura' },
    password: { label: 'Senha própria', help: 'Usada apenas se "Gerar uma senha segura" estiver desmarcado.' },
    length: { label: 'Tamanho da senha gerada' },
    security: { label: 'Segurança', optionLabels: { WPA: 'WPA/WPA2/WPA3 (recomendado)', WEP: 'WEP (obsoleto e inseguro)', nopass: 'Rede aberta (sem senha)' } },
    hidden: { label: 'Rede oculta' },
  },
  outputLabels: { password: 'Senha', payload: 'Conteúdo do QR Code', svg: 'SVG', dataUrl: 'Data URL' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'wifi-qrcode.svg', mimeType: 'image/svg+xml', label: 'Baixar QR Code (SVG)' }],
  examples: [{ description: 'Rede com senha gerada', input: { ssid: 'Visitantes', generatePassword: true, length: 16, security: 'WPA', hidden: false } }],
  documentation:
    'A senha é gerada com o sorteio criptograficamente seguro do sistema, com um alfabeto sem caracteres ambíguos (sem 0/O nem 1/l/I). O QR Code segue o formato "WIFI:T:...;S:...;P:...;;" lido pela câmera do Android e do iPhone. Tudo acontece no seu dispositivo; nada é enviado a servidores. Prefira WPA2/WPA3: o WEP é quebrável em minutos.',
});

// ---------- Código de barras ----------

export type BarcodeFormat = 'code128' | 'ean13' | 'ean8' | 'upca' | 'code39' | 'itf' | 'itf14';

/** Dígito verificador GS1 (módulo 10) dos dígitos informados. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10;
}

const BWIP_ID: Record<BarcodeFormat, string> = { code128: 'code128', ean13: 'ean13', ean8: 'ean8', upca: 'upca', code39: 'code39', itf: 'interleaved2of5', itf14: 'itf14' };

export function normalizeBarcode(format: BarcodeFormat, input: string): string {
  const text = input.trim();
  if (text === '') throw new ToolError('Informe o conteúdo do código de barras');
  const gs1 = (lengthNoCheck: number, label: string) => {
    if (!/^\d+$/.test(text)) throw new ToolError(`${label} aceita apenas números`);
    if (text.length === lengthNoCheck) return text + gs1CheckDigit(text);
    if (text.length === lengthNoCheck + 1) {
      if (Number(text.at(-1)) !== gs1CheckDigit(text.slice(0, -1))) throw new ToolError(`Dígito verificador incorreto; o correto seria ${gs1CheckDigit(text.slice(0, -1))}`);
      return text;
    }
    throw new ToolError(`${label} deve ter ${lengthNoCheck} dígitos (o verificador é calculado) ou ${lengthNoCheck + 1} com ele`);
  };
  switch (format) {
    case 'ean13': return gs1(12, 'EAN-13');
    case 'ean8': return gs1(7, 'EAN-8');
    case 'upca': return gs1(11, 'UPC-A');
    case 'itf14': return gs1(13, 'ITF-14');
    case 'itf':
      if (!/^\d+$/.test(text)) throw new ToolError('ITF aceita apenas números');
      return text.length % 2 === 0 ? text : `0${text}`;
    case 'code39': {
      const up = text.toUpperCase();
      if (!/^[A-Z0-9 .\-$/+%]+$/.test(up)) throw new ToolError('Code 39 aceita letras maiúsculas, números, espaço e - . $ / + %');
      if (up.length > 40) throw new ToolError('Code 39 aceita até 40 caracteres');
      return up;
    }
    case 'code128':
      if (!/^[\x20-\x7e]+$/.test(text)) throw new ToolError('Code 128 (modo básico) aceita apenas caracteres ASCII imprimíveis, sem acentos');
      if (text.length > 80) throw new ToolError('Use até 80 caracteres');
      return text;
  }
}

export async function makeBarcodeSvg(format: BarcodeFormat, text: string, options: { height?: number; scale?: number; showText?: boolean } = {}): Promise<string> {
  const bwip = (await import('bwip-js')).default;
  try {
    return bwip.toSVG({
      bcid: BWIP_ID[format], text, scale: options.scale ?? 2, height: options.height ?? 14, includetext: options.showText ?? true, textxalign: 'center',
    });
  } catch (e) {
    throw new ToolError(`Não foi possível gerar o código: ${e instanceof Error ? e.message : 'entrada inválida'}`);
  }
}

export const barcodeTool = defineTool({
  id: 'codigo-barras',
  name: 'Gerador de Código de Barras',
  description: 'Gera códigos de barras Code 128, EAN-13, EAN-8, UPC-A, Code 39, ITF e ITF-14 em SVG',
  category: 'geradores',
  keywords: ['código de barras', 'ean', 'ean13', 'upc', 'code128', 'code39', 'itf', 'gtin', 'produto', 'etiqueta'],
  icon: '𝄃𝄃𝄃',
  modes: ['browser', 'node'],
  live: true,
  ui: 'svg-preview',
  inputSchema: z.object({
    format: z.enum(['code128', 'ean13', 'ean8', 'upca', 'code39', 'itf', 'itf14']).default('code128'),
    text: z.string().max(100).default(''),
    height: z.number().int().min(5).max(60).default(14),
    scale: z.number().int().min(1).max(6).default(2),
    showText: z.boolean().default(true),
  }),
  outputSchema: z.object({ normalized: z.string(), svg: z.string(), dataUrl: z.string() }),
  execute: async ({ format, text, height, scale, showText }) => {
    const normalized = normalizeBarcode(format, text);
    const svg = await makeBarcodeSvg(format, normalized, { height, scale, showText });
    return { normalized, svg, dataUrl: svgToDataUrl(svg) };
  },
  fields: {
    format: { label: 'Formato', optionLabels: { code128: 'Code 128 (texto e números)', ean13: 'EAN-13 (produtos)', ean8: 'EAN-8 (produtos pequenos)', upca: 'UPC-A (produtos nos EUA)', code39: 'Code 39', itf: 'ITF / Intercalado 2 de 5', itf14: 'ITF-14 (caixas)' } },
    text: { label: 'Conteúdo', placeholder: '789123456789', help: 'EAN, UPC e ITF-14: informe os dígitos sem o verificador; ele é calculado.' },
    height: { label: 'Altura (mm)' },
    scale: { label: 'Escala' },
    showText: { label: 'Mostrar o texto abaixo das barras' },
  },
  outputLabels: { normalized: 'Conteúdo codificado', svg: 'SVG', dataUrl: 'Data URL' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'codigo-de-barras.svg', mimeType: 'image/svg+xml', label: 'Baixar SVG' }],
  examples: [
    { description: 'EAN-13 com verificador calculado', input: { format: 'ean13', text: '789123456789', height: 14, scale: 2, showText: true }, output: { normalized: '7891234567895' } },
    { description: 'Code 128', input: { format: 'code128', text: 'PEDIDO-12345', height: 14, scale: 2, showText: true }, output: { normalized: 'PEDIDO-12345' } },
  ],
  documentation:
    'Gera o símbolo localmente. Para EAN-13, EAN-8, UPC-A e ITF-14 o dígito verificador (módulo 10 do padrão GS1) é calculado, ou conferido se você o informar. Atenção: o código de barras de um produto à venda deve usar um prefixo GS1 licenciado para a sua empresa; códigos gerados aqui servem a testes, uso interno e etiquetas próprias, não ao registro comercial de produtos. Teste a leitura com seu leitor antes de imprimir.',
});

// ---------- link do WhatsApp ----------

export function whatsappNumber(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15) throw new ToolError('Número internacional inválido (de 8 a 15 dígitos)');
    return digits;
  }
  const br = validatePhoneBR(raw);
  if (!br.valid) throw new ToolError(`Telefone brasileiro inválido: ${br.message}. Para outro país, comece com + e o código do país.`);
  return `55${String(br.details?.e164).replace('+55', '')}`;
}

export const whatsappLinkTool = defineTool({
  id: 'link-whatsapp',
  name: 'Gerador de Link de WhatsApp',
  description: 'Cria um link wa.me que abre uma conversa no WhatsApp com mensagem pronta, e o QR Code correspondente',
  category: 'geradores',
  keywords: ['whatsapp', 'link', 'wa.me', 'mensagem', 'atendimento', 'contato', 'qr code', 'click to chat'],
  icon: '💬',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({ phone: z.string().max(25).default(''), message: z.string().max(1000).optional() }),
  outputSchema: z.object({ link: z.string(), number: z.string(), svg: z.string(), dataUrl: z.string() }),
  execute: async ({ phone, message }) => {
    const number = whatsappNumber(phone);
    const link = `https://wa.me/${number}${message && message.trim() !== '' ? `?text=${encodeURIComponent(message)}` : ''}`;
    const svg = await makeQrSvg(link, { errorCorrection: 'M', size: 256, margin: 3 });
    return { link, number, svg, dataUrl: svgToDataUrl(svg) };
  },
  fields: {
    phone: { label: 'Telefone', placeholder: '(11) 91234-5678 ou +351 912 345 678', help: 'Números do Brasil não precisam do +55.' },
    message: { label: 'Mensagem inicial (opcional)', multiline: true, placeholder: 'Olá! Gostaria de saber mais sobre…' },
  },
  outputLabels: { link: 'Link', number: 'Número usado', svg: 'QR Code (SVG)', dataUrl: 'Data URL' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'whatsapp-qrcode.svg', mimeType: 'image/svg+xml', label: 'Baixar QR Code (SVG)' }],
  examples: [{ description: 'Número brasileiro com mensagem', input: { phone: '(11) 91234-5678', message: 'Olá! Tudo bem?' }, output: { link: 'https://wa.me/5511912345678?text=Ol%C3%A1!%20Tudo%20bem%3F', number: '5511912345678' } }],
  documentation:
    'O link usa o formato oficial wa.me/NÚMERO?text=MENSAGEM, com a mensagem codificada para URL. O número precisa estar no formato internacional, sem espaços nem símbolos; números do Brasil recebem o +55 automaticamente. A ferramenta não verifica se o número tem WhatsApp.',
});

// ---------- gerador de links (UTM, mailto, tel, sms) ----------

export function buildUtmUrl(base: string, params: Record<string, string | undefined>): string {
  const v = validateUrl(base);
  if (!v.valid) throw new ToolError(`URL de destino inválida: ${v.message}`);
  const url = new URL(base.trim());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.trim() !== '') url.searchParams.set(`utm_${key}`, value.trim());
  }
  return url.toString();
}

export const linkBuilderTool = defineTool({
  id: 'gerador-link',
  name: 'Gerador de Links (UTM, e-mail, telefone e SMS)',
  description: 'Monta links de campanha com UTM e links de e-mail (mailto), telefone (tel) e SMS prontos para usar',
  category: 'geradores',
  keywords: ['link', 'utm', 'campanha', 'mailto', 'tel', 'sms', 'url', 'rastreamento', 'marketing', 'google analytics'],
  icon: '🔗',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    kind: z.enum(['utm', 'mailto', 'tel', 'sms']).default('utm'),
    target: z.string().max(2048).default(''),
    source: z.string().max(100).optional(),
    medium: z.string().max(100).optional(),
    campaign: z.string().max(100).optional(),
    term: z.string().max(100).optional(),
    content: z.string().max(100).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().max(2000).optional(),
  }),
  outputSchema: z.object({ link: z.string(), html: z.string() }),
  execute: ({ kind, target, source, medium, campaign, term, content, subject, body }) => {
    let link: string;
    if (kind === 'utm') {
      link = buildUtmUrl(target, { source, medium, campaign, term, content });
    } else if (kind === 'mailto') {
      const email = validateEmail(target);
      if (!email.valid) throw new ToolError(`E-mail inválido: ${email.message}`);
      const q = new URLSearchParams();
      if (subject) q.set('subject', subject);
      if (body) q.set('body', body);
      const query = q.toString().replace(/\+/g, '%20');
      link = `mailto:${target.trim()}${query ? `?${query}` : ''}`;
    } else {
      const phone = validatePhoneBR(target);
      const digits = target.trim().startsWith('+') ? target.replace(/[^\d+]/g, '') : String(phone.details?.e164 ?? '');
      if (!target.trim().startsWith('+') && !phone.valid) throw new ToolError(`Telefone inválido: ${phone.message}`);
      link = kind === 'tel' ? `tel:${digits}` : `sms:${digits}${body ? `?body=${encodeURIComponent(body)}` : ''}`;
    }
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return { link, html: `<a href="${escape(link)}">${escape(target.trim())}</a>` };
  },
  fields: {
    kind: { label: 'Tipo de link', optionLabels: { utm: 'Campanha com UTM', mailto: 'E-mail (mailto)', tel: 'Telefone (tel)', sms: 'SMS' } },
    target: { label: 'Destino', placeholder: 'https://exemplo.com.br/oferta, nome@exemplo.com ou (11) 91234-5678', help: 'URL, e-mail ou telefone, conforme o tipo.' },
    source: { label: 'utm_source', help: 'De onde vem o tráfego: newsletter, google, instagram…' },
    medium: { label: 'utm_medium', help: 'O canal: email, cpc, social…' },
    campaign: { label: 'utm_campaign', help: 'Nome da campanha.' },
    term: { label: 'utm_term (opcional)' }, content: { label: 'utm_content (opcional)' },
    subject: { label: 'Assunto (mailto)' }, body: { label: 'Mensagem (mailto e SMS)', multiline: true },
  },
  outputLabels: { link: 'Link', html: 'HTML' },
  examples: [{ description: 'Link de campanha', input: { kind: 'utm', target: 'https://exemplo.com.br/oferta', source: 'newsletter', medium: 'email', campaign: 'verao' }, output: { link: 'https://exemplo.com.br/oferta?utm_source=newsletter&utm_medium=email&utm_campaign=verao' } }],
  documentation:
    'Os parâmetros UTM identificam a origem do acesso em ferramentas como o Google Analytics. Use nomes consistentes em minúsculas, sem espaços. Parâmetros já presentes na URL são mantidos; UTMs repetidos são substituídos. Os links mailto, tel e sms funcionam em celulares e em clientes de e-mail configurados.',
});

// ---------- Pix (BR Code) ----------

/** CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Remove acentos e símbolos, deixa em maiúsculas e corta no limite do campo (o BR Code usa ASCII). */
function pixText(value: string, max: number): string {
  return removeDiacritics(value).toUpperCase().replace(/[^A-Z0-9 .-]/g, '').trim().slice(0, max);
}

export interface PixInput {
  key: string;
  name: string;
  city: string;
  amount?: number | undefined;
  txid?: string | undefined;
  description?: string | undefined;
  oneTime?: boolean;
}

export function normalizePixKey(raw: string): { key: string; type: string } {
  const check = validatePixKey(raw);
  if (!check.valid) throw new ToolError(`Chave Pix inválida: ${check.message}`);
  const type = String(check.details?.type);
  const key = raw.trim();
  if (type === 'CPF' || type === 'CNPJ') return { key: key.replace(/[.\-/]/g, '').toUpperCase(), type };
  if (type === 'e-mail') return { key: key.toLowerCase(), type };
  return { key, type };
}

export function buildPixPayload(i: PixInput): string {
  const { key } = normalizePixKey(i.key);
  const name = pixText(i.name, 25);
  const city = pixText(i.city, 15);
  if (name === '') throw new ToolError('Informe o nome do recebedor (letras e números)');
  if (city === '') throw new ToolError('Informe a cidade do recebedor (letras e números)');
  const description = i.description ? removeDiacritics(i.description).replace(/[^\x20-\x7e]/g, '').trim() : '';
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key) + (description ? tlv('02', description) : '');
  if (account.length > 99) throw new ToolError('Chave e descrição somam caracteres demais; reduza a descrição');
  const txid = (i.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  if (i.amount !== undefined && (!(i.amount > 0) || i.amount > 999_999_999.99)) throw new ToolError('O valor deve ser maior que zero');
  const body =
    tlv('00', '01') + tlv('01', i.oneTime ? '12' : '11') + tlv('26', account) + tlv('52', '0000') + tlv('53', '986') +
    (i.amount !== undefined ? tlv('54', i.amount.toFixed(2)) : '') + tlv('58', 'BR') + tlv('59', name) + tlv('60', city) + tlv('62', tlv('05', txid));
  const withCrcId = `${body}6304`;
  return `${withCrcId}${crc16(withCrcId)}`;
}

/** Lê os campos de primeiro nível de um payload EMV e confere o CRC. */
export function parsePixPayload(payload: string): { fields: Record<string, string>; crcOk: boolean } {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len)) throw new ToolError('Payload malformado');
    fields[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  const crc = payload.slice(-4);
  return { fields, crcOk: payload.slice(-8, -4) === '6304' && crc16(payload.slice(0, -4)) === crc };
}

const pixOutput = z.object({ payload: z.string(), summary: z.string(), svg: z.string(), dataUrl: z.string(), note: z.string() });

export const pixGeneratorTool = defineTool({
  id: 'gerador-pix',
  name: 'Gerador de Pix Copia e Cola e QR Code',
  description: 'Gera o código Pix estático (BR Code) e o QR Code a partir da sua chave, com valor e identificador opcionais',
  category: 'geradores',
  keywords: ['pix', 'copia e cola', 'br code', 'qr code pix', 'cobrança', 'chave pix', 'pagamento', 'brcode'],
  icon: '💠',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({
    key: z.string().max(80).default(''),
    name: z.string().max(60).default(''),
    city: z.string().max(40).default(''),
    amount: z.number().finite().positive().max(999_999_999.99).optional(),
    txid: z.string().max(40).optional(),
    description: z.string().max(60).optional(),
    oneTime: z.boolean().default(false),
  }),
  outputSchema: pixOutput,
  execute: async (v) => {
    const payload = buildPixPayload(v);
    const { type } = normalizePixKey(v.key);
    const svg = await makeQrSvg(payload, { errorCorrection: 'M', size: 320, margin: 3 });
    return {
      payload,
      summary: `Chave ${type} · ${pixText(v.name, 25)} · ${pixText(v.city, 15)}${v.amount !== undefined ? ` · R$ ${v.amount.toFixed(2).replace('.', ',')}` : ' · valor livre'}`,
      svg, dataUrl: svgToDataUrl(svg),
      note: 'Pix estático: o pagador vê o nome e a cidade informados, e o valor só é fixo se você preencher. Confira o recebedor no app do seu banco antes de divulgar. Cobranças dinâmicas (com vencimento, juros e conciliação) exigem a API do seu prestador de serviços de pagamento.',
    };
  },
  fields: {
    key: { label: 'Chave Pix', placeholder: 'CPF, CNPJ, e-mail, telefone (+55…) ou chave aleatória' },
    name: { label: 'Nome do recebedor', help: 'Até 25 caracteres, sem acentos (são removidos).' },
    city: { label: 'Cidade do recebedor', help: 'Até 15 caracteres.' },
    amount: { label: 'Valor (R$) — opcional', help: 'Deixe vazio para o pagador digitar o valor.' },
    txid: { label: 'Identificador da transação — opcional', help: 'Até 25 letras e números.' },
    description: { label: 'Mensagem ao pagador — opcional' },
    oneTime: { label: 'Uso único (o código só vale para um pagamento)' },
  },
  outputLabels: { payload: 'Pix copia e cola', summary: 'Resumo', svg: 'QR Code (SVG)', dataUrl: 'Data URL', note: 'Importante' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'pix-qrcode.svg', mimeType: 'image/svg+xml', label: 'Baixar QR Code (SVG)' }],
  examples: [{ description: 'Chave CPF com valor', input: { key: '529.982.247-25', name: 'Maria da Silva', city: 'São Paulo', amount: 25.5, oneTime: false }, output: { summary: 'Chave CPF · MARIA DA SILVA · SAO PAULO · R$ 25,50' } }],
  documentation:
    'Gera o payload estático no padrão BR Code do Banco Central (EMV QRCPS), com o CRC16 que os apps de pagamento exigem. A chave é validada antes. Tudo acontece no seu dispositivo, e nada é enviado a servidores. Esta ferramenta não movimenta dinheiro nem consulta o Banco Central.',
});

export const pixDemoTool = defineTool({
  id: 'pix-demonstrativo',
  name: 'Gerador de Pix Demonstrativo',
  description: 'Gera um código Pix de demonstração, com chave aleatória inexistente, para testar telas e leitores de QR Code',
  category: 'geradores',
  keywords: ['pix', 'demonstração', 'teste', 'fictício', 'qr code', 'sandbox', 'mock', 'protótipo'],
  icon: '🧪',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({ amount: z.number().finite().positive().max(1_000_000).default(10) }),
  outputSchema: pixOutput,
  execute: async ({ amount }) => {
    // Chave aleatória nova a cada geração, sem conta vinculada: nenhum pagamento chega a lugar algum.
    const key = crypto.randomUUID();
    const payload = buildPixPayload({ key, name: 'DEMONSTRACAO', city: 'SAO PAULO', amount, txid: 'DEMO', description: 'NAO PAGUE - DEMONSTRACAO' });
    const svg = await makeQrSvg(payload, { errorCorrection: 'M', size: 320, margin: 3 });
    return {
      payload, summary: `DEMONSTRAÇÃO · chave aleatória inexistente · R$ ${amount.toFixed(2).replace('.', ',')}`, svg, dataUrl: svgToDataUrl(svg),
      note: 'Código apenas demonstrativo: a chave não está cadastrada em nenhuma instituição, então ele não recebe pagamentos. Use somente em testes de interface e leitura de QR Code.',
    };
  },
  fields: { amount: { label: 'Valor exibido (R$)' } },
  outputLabels: { payload: 'Pix copia e cola (demonstrativo)', summary: 'Resumo', svg: 'QR Code (SVG)', dataUrl: 'Data URL', note: 'Importante' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'pix-demonstrativo.svg', mimeType: 'image/svg+xml', label: 'Baixar QR Code (SVG)' }],
  examples: [{ description: 'Valor de R$ 10', input: { amount: 10 } }],
  documentation:
    'Usa uma chave aleatória gerada na hora, o recebedor "DEMONSTRACAO" e a mensagem "NAO PAGUE - DEMONSTRACAO", de modo que o código nunca possa ser confundido com uma cobrança real. Para um Pix de verdade com a sua chave, use o gerador de Pix.',
});
