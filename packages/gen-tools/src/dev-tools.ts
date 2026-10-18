import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { removeDiacritics } from './slug.js';

const MAX_TEXT = 1_000_000;
const encoder = new TextEncoder();

// ---------- HMAC ----------

const HMAC_HASHES = { 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 } as const;
export type HmacAlgorithm = keyof typeof HMAC_HASHES;

export function hmacDigest(message: string, secret: string, algorithm: HmacAlgorithm): Uint8Array {
  return hmac(HMAC_HASHES[algorithm], encoder.encode(secret), encoder.encode(message));
}

const toHexString = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const toBase64String = (bytes: Uint8Array): string => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));

export const hmacTool = defineTool({
  id: 'hmac',
  name: 'Gerador de HMAC (SHA-256, SHA-384 e SHA-512)',
  description: 'Calcula o HMAC de uma mensagem com uma chave secreta, em hexadecimal ou Base64, para assinar e conferir webhooks e APIs',
  category: 'geradores',
  keywords: ['hmac', 'hmac sha256', 'hmac sha512', 'assinatura', 'webhook', 'chave secreta', 'hash com chave', 'autenticação de mensagem'],
  icon: '🔏',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    message: z.string().max(MAX_TEXT).default('olá, mundo'),
    secret: z.string().max(10_000).default('chave-de-teste'),
    algorithm: z.enum(['SHA-256', 'SHA-384', 'SHA-512']).default('SHA-256'),
    encoding: z.enum(['hex', 'base64']).default('hex'),
  }),
  outputSchema: z.object({ hmac: z.string(), bits: z.number(), algorithm: z.string() }),
  execute: ({ message, secret, algorithm, encoding }) => {
    if (secret === '') throw new ToolError('Informe a chave secreta: um HMAC sem chave não autentica nada');
    const digest = hmacDigest(message, secret, algorithm);
    return { hmac: encoding === 'hex' ? toHexString(digest) : toBase64String(digest), bits: digest.length * 8, algorithm: `HMAC-${algorithm}` };
  },
  fields: {
    message: { label: 'Mensagem', multiline: true, placeholder: 'O corpo da requisição ou o texto a assinar' },
    secret: { label: 'Chave secreta', help: 'Fica só no seu dispositivo. Use chaves de teste, não as de produção.' },
    algorithm: { label: 'Algoritmo' },
    encoding: { label: 'Formato da saída', optionLabels: { hex: 'Hexadecimal', base64: 'Base64' } },
  },
  outputLabels: { hmac: 'HMAC', bits: 'Tamanho (bits)', algorithm: 'Algoritmo' },
  examples: [
    {
      description: 'Exemplo do RFC 4231 (caso 2)',
      input: { message: 'what do ya want for nothing?', secret: 'Jefe', algorithm: 'SHA-256', encoding: 'hex' },
      output: { hmac: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', bits: 256 },
    },
  ],
  documentation:
    'HMAC (RFC 2104) combina uma função de hash SHA-2 com uma chave secreta para provar que a mensagem veio de quem conhece a chave e não foi alterada. É o mecanismo de assinatura de muitos webhooks (Stripe, GitHub, Shopify) e dos JWT HS256/384/512. Para conferir uma assinatura, calcule o HMAC do corpo exato recebido, com o mesmo segredo, e compare os valores. O cálculo acontece no seu dispositivo; nada é enviado.',
});

// ---------- ULID ----------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_TIME_MAX = 2 ** 48 - 1;

function randomBits80(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

function encodeBase32(value: bigint, length: number): string {
  let out = '';
  let v = value;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(v & 31n)] + out;
    v >>= 5n;
  }
  return out;
}

export function encodeUlid(timeMs: number, random: bigint): string {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > ULID_TIME_MAX) throw new ToolError('O tempo do ULID precisa estar entre 0 e 2^48 − 1 milissegundos');
  return encodeBase32(BigInt(timeMs), 10) + encodeBase32(random, 16);
}

/** Gera ULIDs em ordem crescente; no mesmo milissegundo, a parte aleatória é incrementada para manter a ordenação. */
export function generateUlids(count: number, now: number = Date.now()): string[] {
  const out: string[] = [];
  let random = randomBits80();
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      random += 1n;
      if (random >= 1n << 80n) random = randomBits80();
    }
    out.push(encodeUlid(now, random));
  }
  return out;
}

export function decodeUlid(ulid: string): { timeMs: number; iso: string; randomness: string } {
  const text = ulid.trim().toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(text)) throw new ToolError('Um ULID tem 26 caracteres do alfabeto Crockford (sem I, L, O e U)');
  if ('89ABCDEFGHJKMNPQRSTVWXYZ'.includes(text[0] as string)) throw new ToolError('ULID fora do intervalo: o primeiro caractere precisa ser de 0 a 7');
  let value = 0n;
  for (const ch of text.slice(0, 10)) value = value * 32n + BigInt(CROCKFORD.indexOf(ch));
  const timeMs = Number(value);
  return { timeMs, iso: new Date(timeMs).toISOString(), randomness: text.slice(10) };
}

export const ulidTool = defineTool({
  id: 'ulid',
  name: 'Gerador e Decodificador de ULID',
  description: 'Gera ULIDs (identificadores únicos ordenáveis por tempo) e descobre a data e a hora embutidas em um ULID',
  category: 'geradores',
  keywords: ['ulid', 'identificador ordenável', 'uuid alternativo', 'id único', 'crockford', 'base32', 'decodificar ulid'],
  icon: '🧬',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    mode: z.enum(['generate', 'decode']).default('generate'),
    count: z.number().int().min(1).max(100).default(5),
    ulid: z.string().max(64).default(''),
  }),
  outputSchema: z.object({ ulids: z.array(z.string()).optional(), timestamp: z.number().optional(), isoDate: z.string().optional(), randomness: z.string().optional() }),
  execute: ({ mode, count, ulid }) => {
    if (mode === 'generate') return { ulids: generateUlids(count) };
    const d = decodeUlid(ulid);
    return { timestamp: d.timeMs, isoDate: d.iso, randomness: d.randomness };
  },
  fields: {
    mode: { label: 'O que fazer', optionLabels: { generate: 'Gerar ULIDs', decode: 'Decodificar um ULID' } },
    count: { label: 'Quantidade', help: 'Para gerar: de 1 a 100.' },
    ulid: { label: 'ULID', help: 'Para decodificar.', placeholder: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  },
  outputLabels: { ulids: 'ULIDs', timestamp: 'Timestamp (ms)', isoDate: 'Data e hora (UTC)', randomness: 'Parte aleatória' },
  examples: [{ description: 'Decodificar o exemplo da especificação', input: { mode: 'decode', count: 1, ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }, output: { timestamp: 1469922850259, isoDate: '2016-07-30T23:54:10.259Z' } }],
  documentation:
    'O ULID tem 128 bits como o UUID, mas é escrito em 26 caracteres e ordena por ordem de criação: os 10 primeiros codificam os milissegundos desde 1970 e os 16 últimos são aleatórios (gerador criptográfico do sistema). Dentro do mesmo milissegundo, os ULIDs gerados juntos são incrementados para sair em ordem crescente. Por isso são bons como chave primária em bancos de dados: inserções ficam próximas no índice.',
});

// ---------- chmod ----------

const PERM_NAMES = ['leitura', 'escrita', 'execução'] as const;

export interface ChmodResult {
  octal: string;
  symbolic: string;
  special: { setuid: boolean; setgid: boolean; sticky: boolean };
  classes: { owner: number; group: number; others: number };
}

function symbolicFor(bits: number, special: boolean, specialChar: 's' | 't'): string {
  const x = (bits & 1) !== 0;
  return `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${special ? (x ? specialChar : specialChar.toUpperCase()) : x ? 'x' : '-'}`;
}

export function chmodFromOctal(text: string): ChmodResult {
  const t = text.trim();
  if (!/^[0-7]{3,4}$/.test(t)) throw new ToolError('Use 3 ou 4 dígitos de 0 a 7, como 755 ou 4755');
  const digits = t.padStart(4, '0');
  const sp = Number(digits[0]);
  const [owner, group, others] = [Number(digits[1]), Number(digits[2]), Number(digits[3])] as [number, number, number];
  const special = { setuid: (sp & 4) !== 0, setgid: (sp & 2) !== 0, sticky: (sp & 1) !== 0 };
  return {
    octal: t.length === 3 ? t : digits,
    symbolic: symbolicFor(owner, special.setuid, 's') + symbolicFor(group, special.setgid, 's') + symbolicFor(others, special.sticky, 't'),
    special,
    classes: { owner, group, others },
  };
}

export function chmodFromSymbolic(text: string): ChmodResult {
  const t = text.trim();
  if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(t)) throw new ToolError('Use 9 caracteres no formato rwxr-xr-x (r, w, x, s, S, t, T ou -)');
  const triplet = (s: string, specialChars: string): [number, boolean] => {
    const [r, w, x] = [s[0], s[1], s[2]];
    const hasSpecial = specialChars.includes(x as string);
    const exec = x === 'x' || x === 's' || x === 't';
    return [(r === 'r' ? 4 : 0) + (w === 'w' ? 2 : 0) + (exec ? 1 : 0), hasSpecial];
  };
  const [owner, setuid] = triplet(t.slice(0, 3), 'sS');
  const [group, setgid] = triplet(t.slice(3, 6), 'sS');
  const [others, sticky] = triplet(t.slice(6, 9), 'tT');
  const sp = (setuid ? 4 : 0) + (setgid ? 2 : 0) + (sticky ? 1 : 0);
  const base = `${owner}${group}${others}`;
  return { octal: sp === 0 ? base : `${sp}${base}`, symbolic: t, special: { setuid, setgid, sticky }, classes: { owner, group, others } };
}

const describeClass = (bits: number): string => {
  const parts = PERM_NAMES.filter((_, i) => bits & (4 >> i));
  return parts.length === 0 ? 'nenhuma permissão' : parts.join(', ');
};

export const chmodTool = defineTool({
  id: 'chmod',
  name: 'Calculadora de Permissões chmod (Linux e Unix)',
  description: 'Converte permissões de arquivos entre o formato numérico (755) e o simbólico (rwxr-xr-x) e explica o que cada classe pode fazer',
  category: 'calculadoras',
  keywords: ['chmod', 'permissões linux', 'chmod 755', 'chmod 777', 'chmod 644', 'rwx', 'permissões de arquivo', 'unix', 'octal', 'setuid', 'sticky bit'],
  icon: '🔐',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ permissions: z.string().min(1).max(20).default('755') }),
  outputSchema: z.object({ octal: z.string(), symbolic: z.string(), owner: z.string(), group: z.string(), others: z.string(), special: z.string(), command: z.string() }),
  execute: ({ permissions }) => {
    const t = permissions.trim();
    const r = /^[0-7]+$/.test(t) ? chmodFromOctal(t) : chmodFromSymbolic(t);
    const specials = [r.special.setuid && 'setuid (executa como o dono)', r.special.setgid && 'setgid (executa como o grupo ou herda o grupo da pasta)', r.special.sticky && 'sticky bit (só o dono apaga o arquivo na pasta)'].filter(Boolean);
    return {
      octal: r.octal,
      symbolic: r.symbolic,
      owner: describeClass(r.classes.owner),
      group: describeClass(r.classes.group),
      others: describeClass(r.classes.others),
      special: specials.length ? specials.join('; ') : 'nenhuma',
      command: `chmod ${r.octal} arquivo`,
    };
  },
  fields: { permissions: { label: 'Permissões', help: 'Numérico (755, 4755) ou simbólico (rwxr-xr-x).', placeholder: '755' } },
  outputLabels: { octal: 'Numérico (octal)', symbolic: 'Simbólico', owner: 'Dono', group: 'Grupo', others: 'Outros', special: 'Bits especiais', command: 'Comando' },
  examples: [
    { description: '755 é rwxr-xr-x', input: { permissions: '755' }, output: { symbolic: 'rwxr-xr-x', octal: '755' } },
    { description: 'rw-r--r-- é 644', input: { permissions: 'rw-r--r--' }, output: { octal: '644' } },
  ],
  documentation:
    'Cada classe (dono, grupo e outros) recebe uma soma: leitura = 4, escrita = 2, execução = 1. Então 7 = rwx, 6 = rw-, 5 = r-x, 4 = r--. Um quarto dígito à esquerda marca os bits especiais: 4 = setuid, 2 = setgid, 1 = sticky. Em formato simbólico, "s" ou "t" minúsculo indica bit especial com execução, e "S" ou "T" maiúsculo indica bit especial sem execução. 777 libera tudo a todos e raramente é a escolha certa; 644 (arquivos) e 755 (pastas e programas) cobrem a maioria dos casos.',
});

// ---------- px, rem, em ----------

export type CssUnit = 'px' | 'rem' | 'em' | 'pt' | 'vw' | 'percent';

export function toPixels(value: number, unit: CssUnit, base: number, viewport: number): number {
  switch (unit) {
    case 'px':
      return value;
    case 'rem':
    case 'em':
      return value * base;
    case 'pt':
      return (value * 96) / 72;
    case 'vw':
      return (value / 100) * viewport;
    case 'percent':
      return (value / 100) * base;
  }
}

export function fromPixels(px: number, unit: CssUnit, base: number, viewport: number): number {
  switch (unit) {
    case 'px':
      return px;
    case 'rem':
    case 'em':
      return px / base;
    case 'pt':
      return (px * 72) / 96;
    case 'vw':
      return (px / viewport) * 100;
    case 'percent':
      return (px / base) * 100;
  }
}

const trim4 = (n: number): number => Number(n.toFixed(4));

export const pxRemTool = defineTool({
  id: 'px-rem',
  name: 'Conversor de px para rem, em, pt e vw',
  description: 'Converte tamanhos CSS entre pixels, rem, em, pontos, vw e porcentagem, com o tamanho base da fonte e a largura da tela que você escolher',
  category: 'conversores',
  keywords: ['px para rem', 'rem para px', 'px para em', 'pt para px', 'css', 'tamanho de fonte', 'conversor css', 'vw', 'front-end', 'responsivo'],
  icon: '📏',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.number().finite().min(-1e6).max(1e6).default(24),
    unit: z.enum(['px', 'rem', 'em', 'pt', 'vw', 'percent']).default('px'),
    baseFontSize: z.number().finite().min(1).max(200).default(16),
    viewportWidth: z.number().finite().min(1).max(20_000).default(1440),
  }),
  outputSchema: z.object({ px: z.number(), rem: z.number(), em: z.number(), pt: z.number(), vw: z.number(), percent: z.number() }),
  execute: ({ value, unit, baseFontSize, viewportWidth }) => {
    const px = toPixels(value, unit, baseFontSize, viewportWidth);
    const out = (u: CssUnit) => trim4(fromPixels(px, u, baseFontSize, viewportWidth));
    return { px: out('px'), rem: out('rem'), em: out('em'), pt: out('pt'), vw: out('vw'), percent: out('percent') };
  },
  fields: {
    value: { label: 'Valor' },
    unit: { label: 'Unidade de origem', optionLabels: { px: 'px', rem: 'rem', em: 'em', pt: 'pt', vw: 'vw', percent: '% do tamanho base' } },
    baseFontSize: { label: 'Tamanho base da fonte (px)', help: 'O padrão dos navegadores é 16.' },
    viewportWidth: { label: 'Largura da tela (px)', help: 'Usada para converter vw.' },
  },
  outputLabels: { px: 'px', rem: 'rem', em: 'em', pt: 'pt', vw: 'vw', percent: '% do tamanho base' },
  examples: [{ description: '24px com base 16', input: { value: 24, unit: 'px', baseFontSize: 16, viewportWidth: 1440 }, output: { rem: 1.5, em: 1.5, pt: 18 } }],
  documentation:
    '1 rem é o tamanho da fonte do elemento raiz (16px por padrão), então px ÷ 16 = rem. O em usa a fonte do próprio elemento; aqui ele equivale ao rem porque o tamanho base é o mesmo. 1 pt = 1/72 de polegada = 1,333 px (CSS usa 96 px por polegada). 1 vw = 1% da largura da janela. Usar rem em fontes respeita a configuração de tamanho de texto do navegador de quem acessa, o que ajuda na acessibilidade.',
});

// ---------- entidades HTML ----------

const BASE_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', deg: '°',
  plusmn: '±', times: '×', divide: '÷', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', micro: 'µ', iexcl: '¡', iquest: '¿', larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', infin: '∞', ne: '≠',
  le: '≤', ge: '≥', asymp: '≈', szlig: 'ß',
};

const ENTITIES: Record<string, string> = (() => {
  const map: Record<string, string> = { ...BASE_ENTITIES };
  const combos: Array<[string, string, string]> = [
    ['AEIOU', 'acute', '́'],
    ['AEIOU', 'grave', '̀'],
    ['AEIOU', 'circ', '̂'],
    ['AEIOU', 'uml', '̈'],
    ['AON', 'tilde', '̃'],
    ['C', 'cedil', '̧'],
    ['A', 'ring', '̊'],
  ];
  for (const [letters, suffix, mark] of combos) {
    for (const letter of letters) {
      map[letter + suffix] = (letter + mark).normalize('NFC');
      map[letter.toLowerCase() + suffix] = (letter.toLowerCase() + mark).normalize('NFC');
    }
  }
  return map;
})();

const ENTITY_NAMES = new Map<string, string>(Object.entries(ENTITIES).filter(([name]) => name !== 'apos').map(([name, ch]) => [ch, name]));

export type EntityStyle = 'none' | 'named' | 'numeric';

export function encodeHtmlEntities(text: string, nonAscii: EntityStyle): string {
  let out = '';
  for (const ch of text) {
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else if (ch.codePointAt(0)! > 127 && nonAscii !== 'none') {
      const name = nonAscii === 'named' ? ENTITY_NAMES.get(ch) : undefined;
      out += name ? `&${name};` : `&#${ch.codePointAt(0)};`;
    } else out += ch;
  }
  return out;
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,9});/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(ENTITIES, body) ? (ENTITIES[body] as string) : whole;
  });
}

export const htmlEntitiesTool = defineTool({
  id: 'html-entities',
  name: 'Codificar e Decodificar Entidades HTML',
  description: 'Converte caracteres especiais e acentos em entidades HTML (&amp;, &aacute;, &#233;) e decodifica o caminho inverso',
  category: 'conversores',
  keywords: ['entidades html', 'html entities', 'caracteres especiais html', 'acentos html', '&amp;', '&nbsp;', 'escape html', 'unescape html', 'codificar html', 'decodificar html'],
  icon: '🏷️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(MAX_TEXT).default(''),
    mode: z.enum(['encode', 'decode']).default('encode'),
    nonAscii: z.enum(['none', 'named', 'numeric']).default('named'),
  }),
  outputSchema: z.object({ result: z.string(), changed: z.number() }),
  execute: ({ text, mode, nonAscii }) => {
    const result = mode === 'encode' ? encodeHtmlEntities(text, nonAscii) : decodeHtmlEntities(text);
    return { result, changed: Array.from((mode === 'encode' ? result : text).matchAll(/&[#A-Za-z0-9]+;/g)).length };
  },
  fields: {
    text: { label: 'Texto', multiline: true, placeholder: '<p>Ação & reação</p>' },
    mode: { label: 'O que fazer', optionLabels: { encode: 'Codificar', decode: 'Decodificar' } },
    nonAscii: { label: 'Acentos e símbolos (ao codificar)', optionLabels: { none: 'Manter como estão', named: 'Nome da entidade (&aacute;)', numeric: 'Número (&#225;)' } },
  },
  outputLabels: { result: 'Resultado', changed: 'Entidades' },
  examples: [{ description: 'Codificar', input: { text: 'Ação & reação', mode: 'encode', nonAscii: 'named' }, output: { result: 'A&ccedil;&atilde;o &amp; rea&ccedil;&atilde;o' } }],
  documentation:
    'Cinco caracteres precisam virar entidade dentro de HTML: & (&amp;), < (&lt;), > (&gt;), aspas duplas (&quot;) e aspas simples (&#39;). Com isso, texto digitado por pessoas não vira marcação nem quebra atributos, o que também é a defesa básica contra XSS ao exibir conteúdo. Letras acentuadas podem ficar como estão em páginas UTF-8; a conversão para &aacute; ou &#225; só é necessária em sistemas legados. A decodificação entende entidades nomeadas comuns e numéricas (&#233; e &#xE9;) e deixa intactas as que não reconhece.',
});

// ---------- código Morse ----------

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
};
const MORSE_REVERSE = new Map(Object.entries(MORSE).map(([ch, code]) => [code, ch]));

export function textToMorse(text: string): { morse: string; ignored: string[] } {
  const ignored: string[] = [];
  const words = removeDiacritics(text).toUpperCase().split(/\s+/).filter(Boolean);
  const morse = words
    .map((word) =>
      Array.from(word)
        .map((ch) => {
          const code = MORSE[ch];
          if (code === undefined) {
            if (!ignored.includes(ch)) ignored.push(ch);
            return '';
          }
          return code;
        })
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ');
  return { morse, ignored };
}

export function morseToText(morse: string): { text: string; unknown: string[] } {
  const normalized = morse.replace(/[·•∙]/g, '.').replace(/[–—−_]/g, '-');
  const unknown: string[] = [];
  const text = normalized
    .split(/\s*\/\s*|\s{3,}|\n+/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((code) => {
          const ch = MORSE_REVERSE.get(code);
          if (ch === undefined) {
            if (!unknown.includes(code)) unknown.push(code);
            return '?';
          }
          return ch;
        })
        .join(''),
    )
    .filter(Boolean)
    .join(' ');
  return { text, unknown };
}

export const morseTool = defineTool({
  id: 'codigo-morse',
  name: 'Tradutor de Código Morse',
  description: 'Traduz texto para código Morse e Morse para texto, com a tabela internacional de letras, números e pontuação',
  category: 'conversores',
  keywords: ['código morse', 'tradutor morse', 'texto para morse', 'morse para texto', 'alfabeto morse', 'sos', 'telégrafo', 'pontos e traços'],
  icon: '📡',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ text: z.string().max(100_000).default(''), mode: z.enum(['to-morse', 'to-text']).default('to-morse') }),
  outputSchema: z.object({ result: z.string(), ignored: z.string() }),
  execute: ({ text, mode }) => {
    if (mode === 'to-morse') {
      const r = textToMorse(text);
      return { result: r.morse, ignored: r.ignored.length ? `Sem equivalente em Morse: ${r.ignored.join(' ')}` : '' };
    }
    const r = morseToText(text);
    return { result: r.text, ignored: r.unknown.length ? `Códigos não reconhecidos: ${r.unknown.join(' ')}` : '' };
  },
  fields: {
    text: { label: 'Texto ou código', multiline: true, placeholder: 'SOS  ou  ... --- ...' },
    mode: { label: 'Direção', optionLabels: { 'to-morse': 'Texto para Morse', 'to-text': 'Morse para texto' } },
  },
  outputLabels: { result: 'Resultado', ignored: 'Avisos' },
  examples: [{ description: 'SOS', input: { text: 'SOS', mode: 'to-morse' }, output: { result: '... --- ...' } }],
  documentation:
    'Cada letra vira uma sequência de pontos e traços, separadas por espaço; as palavras são separadas por " / ". Acentos são removidos antes da conversão (Morse internacional não tem letras acentuadas). Ao decodificar, aceite espaço entre letras e barra (ou três espaços) entre palavras; os símbolos · e − também são entendidos como ponto e traço.',
});
