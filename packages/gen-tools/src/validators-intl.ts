import { z } from 'zod';
import { XMLValidator } from 'fast-xml-parser';
import { defineTool } from '@esc/gen-core';
import { defineValidator, onlyDigits, type ValidationOutcome } from './validator.js';

// ---------- E-mail ----------

const ATEXT = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+$/;

export function validateEmail(input: string): ValidationOutcome {
  const email = input.trim();
  if (email === '') return { valid: false, message: 'Informe um e-mail' };
  if (/\s/.test(email)) return { valid: false, message: 'O e-mail não pode conter espaços' };
  const at = email.lastIndexOf('@');
  if (at < 0) return { valid: false, message: 'Falta o "@"' };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local === '') return { valid: false, message: 'Falta a parte antes do "@"' };
  if (local.length > 64) return { valid: false, message: 'A parte antes do "@" tem mais de 64 caracteres' };
  const localParts = local.split('.');
  if (localParts.some((p) => p === '')) {
    return { valid: false, message: 'A parte antes do "@" não pode começar ou terminar com ponto nem ter pontos seguidos' };
  }
  if (!localParts.every((p) => ATEXT.test(p))) {
    return { valid: false, message: 'A parte antes do "@" contém caracteres não permitidos' };
  }

  if (domain === '') return { valid: false, message: 'Falta o domínio depois do "@"' };
  let ascii: string;
  try {
    // Converte domínios internacionais (IDN) para punycode antes de validar.
    ascii = new URL(`http://${domain}`).hostname;
  } catch {
    return { valid: false, message: 'Domínio inválido' };
  }
  if (ascii.length > 253) return { valid: false, message: 'O domínio é longo demais' };
  const labels = ascii.split('.');
  if (labels.length < 2) return { valid: false, message: 'O domínio precisa de ao menos um ponto (ex.: exemplo.com)' };
  for (const label of labels) {
    if (label === '' || label.length > 63) return { valid: false, message: 'Domínio com parte vazia ou maior que 63 caracteres' };
    if (!/^[a-z0-9-]+$/i.test(label) || label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, message: 'Domínio com caracteres não permitidos' };
    }
  }
  const tld = labels[labels.length - 1] as string;
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(tld)) return { valid: false, message: 'Terminação do domínio inválida' };

  return {
    valid: true,
    message: 'E-mail com sintaxe válida (não garante que a caixa postal exista)',
    details: { local, domain: ascii },
  };
}

export const emailTool = defineValidator({
  id: 'email',
  name: 'Validador de E-mail',
  description: 'Valida a sintaxe de endereços de e-mail e aponta o motivo da rejeição',
  keywords: ['email', 'e-mail', 'correio', 'validar', 'sintaxe'],
  icon: '✉️',
  label: 'E-mail',
  placeholder: 'nome@exemplo.com.br',
  detailLabels: { local: 'Parte local', domain: 'Domínio' },
  examples: [
    { description: 'E-mail comum', value: 'maria.silva+loja@exemplo.com.br', valid: true },
    { description: 'Sem arroba', value: 'maria.exemplo.com', valid: false },
    { description: 'Pontos seguidos', value: 'maria..silva@exemplo.com', valid: false },
  ],
  documentation:
    'Confere a estrutura (parte local, "@" e domínio com terminação) com base nas regras práticas da RFC 5321/5322, e aceita domínios internacionais. Endereços entre aspas e comentários não são suportados. Um e-mail com sintaxe válida pode não existir: esta ferramenta não consulta servidores nem envia mensagens.',
  validate: validateEmail,
});

// ---------- URL ----------

export function validateUrl(input: string): ValidationOutcome {
  const text = input.trim();
  if (text === '') return { valid: false, message: 'Informe uma URL' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return { valid: false, message: 'Inclua o protocolo, como https:// ou http://' };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { valid: false, message: 'URL malformada' };
  }
  const protocol = url.protocol.replace(':', '');
  if (!['http', 'https', 'ftp', 'ftps', 'ws', 'wss'].includes(protocol)) {
    return { valid: false, message: `Protocolo "${protocol}" não suportado (use http, https, ftp, ws...)` };
  }
  const host = url.hostname;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (host === '' || (!host.includes('.') && host !== 'localhost' && !isIp)) {
    return { valid: false, message: 'Endereço sem domínio válido' };
  }
  return {
    valid: true,
    message: 'URL com sintaxe válida (não garante que o endereço exista)',
    details: {
      protocol,
      host,
      port: url.port || '(padrão)',
      path: url.pathname,
      query: url.search || '(nenhuma)',
      fragment: url.hash || '(nenhum)',
    },
  };
}

export const urlTool = defineValidator({
  id: 'url',
  name: 'Validador de URL',
  description: 'Valida URLs e separa protocolo, domínio, porta, caminho, parâmetros e âncora',
  keywords: ['url', 'link', 'endereço', 'site', 'validar', 'http', 'https'],
  icon: '🔗',
  label: 'URL',
  placeholder: 'https://www.exemplo.com.br/pagina?x=1#topo',
  detailLabels: { protocol: 'Protocolo', host: 'Domínio', port: 'Porta', path: 'Caminho', query: 'Parâmetros', fragment: 'Âncora' },
  examples: [
    { description: 'URL completa', value: 'https://exemplo.com.br/a/b?x=1#topo', valid: true },
    { description: 'Sem protocolo', value: 'exemplo.com.br', valid: false },
    { description: 'Protocolo não suportado', value: 'javascript://alert(1)', valid: false },
  ],
  documentation:
    'Exige protocolo (http, https, ftp, ftps, ws ou wss) e um domínio, endereço IP ou localhost. Esquemas como javascript: e data: são rejeitados de propósito. Não acessa a URL: não sabe se ela responde.',
  maxLength: 2048,
  validate: validateUrl,
});

// ---------- IP ----------

export function parseIPv4(text: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map((p) => ({ s: p, n: Number(p) }));
  // Zeros à esquerda (como 010) são ambíguos (octal em alguns sistemas) e rejeitados.
  if (parts.some(({ s, n }) => n > 255 || (s.length > 1 && s.startsWith('0')))) return null;
  return parts.map((p) => p.n);
}

export function parseIPv6(text: string): number[] | null {
  if (text.includes('%') || !/^[0-9a-f:.]+$/i.test(text)) return null;
  const dc = text.split('::');
  if (dc.length > 2) return null;

  const toGroups = (part: string): string[] | null => (part === '' ? [] : part.split(':'));
  let head = toGroups(dc[0] as string);
  let tail = dc.length === 2 ? toGroups(dc[1] as string) : [];
  if (!head || !tail) return null;

  // IPv4 embutido no final (::ffff:192.168.0.1).
  const last = dc.length === 2 ? tail : head;
  const lastGroup = last[last.length - 1];
  if (lastGroup !== undefined && lastGroup.includes('.')) {
    const v4 = parseIPv4(lastGroup);
    if (!v4) return null;
    last.splice(last.length - 1, 1, ((v4[0] as number) * 256 + (v4[1] as number)).toString(16), ((v4[2] as number) * 256 + (v4[3] as number)).toString(16));
  }
  head = dc.length === 2 ? head : last;
  tail = dc.length === 2 ? last : [];

  const all = [...head, ...tail];
  if (!all.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  if (dc.length === 2) {
    if (all.length > 7) return null;
    const fill = new Array<string>(8 - all.length).fill('0');
    return [...head, ...fill, ...tail].map((g) => parseInt(g, 16));
  }
  return all.length === 8 ? all.map((g) => parseInt(g, 16)) : null;
}

function classifyIPv4([a, b, c]: number[]): string {
  const [A, B, C] = [a as number, b as number, c as number];
  if (A === 0) return 'rede atual (0.0.0.0/8)';
  if (A === 10) return 'privado (10.0.0.0/8)';
  if (A === 127) return 'loopback';
  if (A === 169 && B === 254) return 'link-local';
  if (A === 172 && B >= 16 && B <= 31) return 'privado (172.16.0.0/12)';
  if (A === 192 && B === 168) return 'privado (192.168.0.0/16)';
  if (A === 100 && B >= 64 && B <= 127) return 'CGNAT (100.64.0.0/10)';
  if ((A === 192 && B === 0 && C === 2) || (A === 198 && B === 51 && C === 100) || (A === 203 && B === 0 && C === 113)) return 'documentação';
  if (A >= 224 && A <= 239) return 'multicast';
  if (A >= 240) return 'reservado';
  return 'público';
}

function classifyIPv6(g: number[]): string {
  const first = g[0] as number;
  if (g.every((x) => x === 0)) return 'não especificado (::)';
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'loopback (::1)';
  if ((first & 0xffc0) === 0xfe80) return 'link-local (fe80::/10)';
  if ((first & 0xfe00) === 0xfc00) return 'local único (fc00::/7)';
  if ((first & 0xff00) === 0xff00) return 'multicast (ff00::/8)';
  if (first === 0x2001 && g[1] === 0xdb8) return 'documentação (2001:db8::/32)';
  return 'global ou outro';
}

export function validateIp(input: string): ValidationOutcome {
  const ip = input.trim();
  if (ip === '') return { valid: false, message: 'Informe um endereço IP' };
  const v4 = parseIPv4(ip);
  if (v4) return { valid: true, message: 'Endereço IPv4 válido', details: { version: 'IPv4', kind: classifyIPv4(v4) } };
  const v6 = parseIPv6(ip);
  if (v6) return { valid: true, message: 'Endereço IPv6 válido', details: { version: 'IPv6', kind: classifyIPv6(v6) } };
  if (/^[\d.]+$/.test(ip)) return { valid: false, message: 'IPv4 inválido: use quatro números de 0 a 255 separados por ponto, sem zeros à esquerda' };
  return { valid: false, message: 'Endereço IP inválido' };
}

export const ipTool = defineValidator({
  id: 'ip',
  name: 'Validador de Endereço IP',
  description: 'Valida endereços IPv4 e IPv6 e identifica o tipo (público, privado, loopback...)',
  keywords: ['ip', 'ipv4', 'ipv6', 'endereço ip', 'rede', 'validar'],
  icon: '🧭',
  label: 'Endereço IP',
  placeholder: '192.168.0.1 ou 2001:db8::1',
  detailLabels: { version: 'Versão', kind: 'Tipo' },
  examples: [
    { description: 'IPv4 privado', value: '192.168.0.1', valid: true },
    { description: 'IPv6 abreviado', value: '2001:db8::8a2e:370:7334', valid: true },
    { description: 'Octeto acima de 255', value: '256.1.1.1', valid: false },
  ],
  documentation:
    'Aceita IPv4 em notação decimal pontuada (sem zeros à esquerda) e IPv6 completo, abreviado com "::" ou com IPv4 embutido. Máscaras CIDR e identificadores de zona (%eth0) não são suportados. O tipo informado é a faixa reservada a que o endereço pertence; a ferramenta não consulta a internet.',
  validate: validateIp,
});

// ---------- Cartão de crédito ----------

const BRANDS: { name: string; test: (d: string) => boolean; lengths: number[] }[] = [
  { name: 'Visa', test: (d) => d.startsWith('4'), lengths: [13, 16, 19] },
  { name: 'Mastercard', test: (d) => /^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(d), lengths: [16] },
  { name: 'American Express', test: (d) => /^3[47]/.test(d), lengths: [15] },
  { name: 'Diners Club', test: (d) => /^(30[0-5]|36|38|39)/.test(d), lengths: [14, 16, 19] },
  { name: 'Discover', test: (d) => /^(6011|64[4-9]|65)/.test(d), lengths: [16, 19] },
  { name: 'JCB', test: (d) => /^35(2[89]|[3-8])/.test(d), lengths: [16, 17, 18, 19] },
  { name: 'Hipercard', test: (d) => /^(606282|3841)/.test(d), lengths: [13, 16, 19] },
];

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function validateCard(input: string): ValidationOutcome {
  const text = input.trim();
  if (!/^[\d\s-]+$/.test(text)) return { valid: false, message: 'Use apenas números, espaços e hífens' };
  const digits = onlyDigits(text);
  if (digits.length < 12 || digits.length > 19) return { valid: false, message: 'O número do cartão deve ter de 12 a 19 dígitos' };
  const brand = BRANDS.find((b) => b.test(digits));
  const masked = `${digits.slice(0, 6)}${'*'.repeat(Math.max(digits.length - 10, 0))}${digits.slice(-4)}`;
  if (!luhnValid(digits)) return { valid: false, message: 'Número inválido: falha no dígito verificador (algoritmo de Luhn)' };
  if (brand && !brand.lengths.includes(digits.length)) {
    return { valid: false, message: `Tamanho incomum para ${brand.name} (${digits.length} dígitos)`, details: { brand: brand.name, masked } };
  }
  return {
    valid: true,
    message: 'Número com formato válido (Luhn). Não indica que o cartão exista',
    details: { brand: brand?.name ?? 'não identificada', length: digits.length, masked },
  };
}

export const cardTool = defineValidator({
  id: 'cartao-credito',
  name: 'Validador de Cartão de Crédito',
  description: 'Valida o número de um cartão pelo algoritmo de Luhn e identifica a bandeira pelo prefixo',
  keywords: ['cartão', 'cartao', 'crédito', 'luhn', 'visa', 'mastercard', 'bandeira', 'validar'],
  icon: '💳',
  label: 'Número do cartão',
  placeholder: '4111 1111 1111 1111',
  help: 'Processado no seu navegador. Prefira números de teste dos gateways de pagamento.',
  detailLabels: { brand: 'Bandeira', length: 'Dígitos', masked: 'Mascarado' },
  examples: [
    { description: 'Visa de teste', value: '4111 1111 1111 1111', valid: true },
    { description: 'Mastercard de teste', value: '5555 5555 5555 4444', valid: true },
    { description: 'Dígito alterado', value: '4111 1111 1111 1112', valid: false },
  ],
  documentation:
    'Confere o dígito verificador (Luhn), o tamanho e a bandeira provável pelo prefixo (Visa, Mastercard, American Express, Diners, Discover, JCB e Hipercard). Outras bandeiras, como Elo, aparecem como "não identificada". Não verifica se o cartão existe, está ativo ou tem limite, e nada é enviado a servidores.',
  validate: validateCard,
});

// ---------- IBAN ----------

/** Comprimentos do IBAN por país (registro SWIFT). Países fora da tabela têm só o dígito de controle verificado. */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
  PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

export function validateIban(input: string): ValidationOutcome {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  if (iban === '') return { valid: false, message: 'Informe um IBAN' };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return { valid: false, message: 'Formato inválido: deve começar com 2 letras do país e 2 dígitos de controle' };
  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (expected !== undefined && iban.length !== expected) {
    return { valid: false, message: `Tamanho inválido para ${country}: esperado ${expected}, recebido ${iban.length}` };
  }
  if (iban.length < 15 || iban.length > 34) return { valid: false, message: 'O IBAN deve ter de 15 a 34 caracteres' };
  if (ibanMod97(iban) !== 1) return { valid: false, message: 'IBAN inválido: dígitos de controle incorretos' };
  return {
    valid: true,
    message: expected === undefined ? 'Dígitos de controle válidos (o tamanho deste país não foi verificado)' : 'IBAN válido (tamanho e dígitos de controle)',
    details: { country, checkDigits: iban.slice(2, 4), formatted: iban.replace(/(.{4})/g, '$1 ').trim() },
  };
}

export const ibanTool = defineValidator({
  id: 'iban',
  name: 'Validador de IBAN',
  description: 'Valida o International Bank Account Number pelo tamanho do país e pelo dígito de controle (mod 97)',
  keywords: ['iban', 'conta bancária', 'internacional', 'swift', 'transferência', 'validar'],
  icon: '🏦',
  label: 'IBAN',
  placeholder: 'GB82 WEST 1234 5698 7654 32',
  detailLabels: { country: 'País', checkDigits: 'Dígitos de controle', formatted: 'Formatado' },
  examples: [
    { description: 'IBAN do Reino Unido', value: 'GB82 WEST 1234 5698 7654 32', valid: true },
    { description: 'IBAN do Brasil', value: 'BR1800360305000010009795493C1', valid: true },
    { description: 'Dígito alterado', value: 'GB82 WEST 1234 5698 7654 33', valid: false },
  ],
  documentation:
    'Confere o tamanho esperado para o país (tabela do registro SWIFT) e os dígitos de controle pelo método módulo 97 da ISO 13616. Não valida o BBAN nacional (banco e agência) nem confirma que a conta existe. Países fora da tabela têm somente o dígito de controle verificado.',
  validate: validateIban,
});

// ---------- XML ----------

export function validateXml(input: string): ValidationOutcome {
  if (input.trim() === '') return { valid: false, message: 'Informe um XML' };
  const result = XMLValidator.validate(input);
  if (result === true) return { valid: true, message: 'XML bem formado' };
  const { code, msg, line, col } = result.err;
  return { valid: false, message: `XML mal formado (linha ${line}, coluna ${col}): ${msg}`, details: { line, column: col, code } };
}

export const xmlTool = defineValidator({
  id: 'xml',
  name: 'Validador de XML',
  description: 'Verifica se um XML é bem formado e indica a linha e a coluna do erro',
  keywords: ['xml', 'validar', 'bem formado', 'sintaxe', 'tags'],
  icon: '📄',
  label: 'XML',
  placeholder: '<raiz><item id="1">texto</item></raiz>',
  multiline: true,
  maxLength: 2_000_000,
  detailLabels: { line: 'Linha', column: 'Coluna', code: 'Código do erro' },
  examples: [
    { description: 'XML correto', value: '<a><b id="1">ok</b></a>', valid: true },
    { description: 'Tag não fechada', value: '<a><b></a>', valid: false },
  ],
  documentation:
    'Verifica se o documento é "bem formado": tags corretamente abertas e fechadas, atributos entre aspas e um único elemento raiz. Não valida contra XSD ou DTD (estrutura e tipos esperados). O XML é analisado no seu dispositivo.',
  validate: validateXml,
});

// ---------- Data ----------

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function validateDateText(input: string): ValidationOutcome {
  const text = input.trim();
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!br && !iso) return { valid: false, message: 'Use DD/MM/AAAA ou AAAA-MM-DD' };
  const [day, month, year] = br ? [Number(br[1]), Number(br[2]), Number(br[3])] : [Number(iso?.[3]), Number(iso?.[2]), Number(iso?.[1])];
  if (month < 1 || month > 12) return { valid: false, message: `Mês inválido (${month}): use de 1 a 12` };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { valid: false, message: `Dia inválido: o mês ${String(month).padStart(2, '0')}/${year} tem ${days} dias` };
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dayOfYear = Math.round((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return {
    valid: true,
    message: 'Data válida no calendário',
    details: {
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      weekday: WEEKDAYS[date.getUTCDay()] as string,
      dayOfYear,
      leapYear: leap,
    },
  };
}

export const dateTool = defineValidator({
  id: 'data',
  name: 'Validador de Data',
  description: 'Valida datas (DD/MM/AAAA ou AAAA-MM-DD) e mostra o dia da semana e se o ano é bissexto',
  keywords: ['data', 'calendário', 'bissexto', 'dia da semana', 'validar'],
  icon: '🗓️',
  label: 'Data',
  placeholder: '29/02/2024',
  detailLabels: { iso: 'Formato ISO', weekday: 'Dia da semana', dayOfYear: 'Dia do ano', leapYear: 'Ano bissexto' },
  examples: [
    { description: 'Dia bissexto', value: '29/02/2024', valid: true },
    { description: 'Fevereiro sem dia 29', value: '29/02/2023', valid: false },
    { description: 'ISO', value: '2025-12-31', valid: true },
  ],
  documentation:
    'Confere se o dia existe no mês e ano informados (considerando anos bissextos) usando o calendário gregoriano, sem fuso horário. Aceita dia e mês com um ou dois dígitos e os separadores /, - e ponto.',
  validate: validateDateText,
});

// ---------- Número primo ----------

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/** Miller-Rabin determinístico: com as 12 primeiras bases primas vale para n < 3,3 × 10^24. */
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let r = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  witness: for (const a of SMALL_PRIMES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < r; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witness;
    }
    return false;
  }
  return true;
}

export function factorize(n: bigint, limit = 1_000_000n): bigint[] | null {
  const factors: bigint[] = [];
  let rest = n;
  for (let p = 2n; p * p <= rest; p += p === 2n ? 1n : 2n) {
    if (p > limit) return null;
    while (rest % p === 0n) {
      factors.push(p);
      rest /= p;
    }
  }
  if (rest > 1n) factors.push(rest);
  return factors;
}

export function validatePrimeInput(input: string): ValidationOutcome {
  const text = input.replace(/[\s_.]/g, '');
  if (!/^\d+$/.test(text)) return { valid: false, message: 'Informe um número inteiro positivo' };
  if (text.length > 24) return { valid: false, message: 'Use números de até 24 dígitos (limite da verificação determinística)' };
  const n = BigInt(text);
  if (n < 2n) return { valid: false, message: `${n} não é primo (primos começam em 2)` };
  if (isPrime(n)) {
    let next = n + 1n;
    while (!isPrime(next)) next++;
    return { valid: true, message: `${n} é primo`, details: { nextPrime: next.toString() } };
  }
  const factors = factorize(n);
  if (!factors) return { valid: false, message: `${n} não é primo (composto)` };
  const grouped = new Map<string, number>();
  for (const f of factors) grouped.set(f.toString(), (grouped.get(f.toString()) ?? 0) + 1);
  const text2 = [...grouped].map(([p, e]) => (e > 1 ? `${p}^${e}` : p)).join(' × ');
  return { valid: false, message: `${n} não é primo: ${text2}`, details: { factorization: text2 } };
}

export const primeTool = defineValidator({
  id: 'numero-primo',
  name: 'Verificador de Número Primo',
  description: 'Verifica se um número é primo e, se não for, mostra a decomposição em fatores primos',
  keywords: ['primo', 'número primo', 'fatoração', 'matemática', 'divisores'],
  icon: '🔢',
  label: 'Número',
  placeholder: '97',
  help: 'Inteiros de até 24 dígitos.',
  detailLabels: { nextPrime: 'Próximo primo', factorization: 'Fatores primos' },
  examples: [
    { description: 'Primo', value: '97', valid: true },
    { description: 'Composto', value: '360', valid: false },
    { description: 'Primo grande', value: '1000000007', valid: true },
  ],
  documentation:
    '"Válido" significa "é primo". Usa o teste de Miller-Rabin determinístico, exato para números de até 24 dígitos, e divisão por tentativa para fatorar. A fatoração de números compostos muito grandes com fatores grandes pode ser omitida.',
  validate: validatePrimeInput,
});

// ---------- Senha forte ----------

const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '111111', '000000', '123123', 'password', 'senha', 'senha123',
  'qwerty', 'qwerty123', 'abc123', 'iloveyou', 'admin', 'admin123', 'letmein', 'welcome', 'monkey', 'dragon', 'brasil',
  'brasil123', 'flamengo', 'corinthians', 'palmeiras', 'gabriel', 'mudar123', 'teste123', 'master', 'login', 'princess',
  'sunshine', 'football', 'passw0rd', 'p@ssw0rd', '1q2w3e4r', '1qaz2wsx', 'q1w2e3r4', 'abcd1234', '123mudar', 'amor',
  '102030', '654321', '121212', '147258369', '987654321', 'minhasenha', 'trocar123',
]);

export function assessPassword(password: string) {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const pool = (/[a-z]/.test(password) ? 26 : 0) + (/[A-Z]/.test(password) ? 26 : 0) + (/\d/.test(password) ? 10 : 0) + (/[^A-Za-z0-9]/.test(password) ? 33 : 0);
  const unique = new Set(password).size;
  let entropy = Math.round(password.length * Math.log2(Math.max(pool, 1)) * 10) / 10;
  const problems: string[] = [];

  const lower = password.toLowerCase();
  const common = COMMON_PASSWORDS.has(lower);
  if (common) problems.push('é uma senha muito comum');
  if (/(.)\1{2,}/.test(password)) problems.push('tem caracteres repetidos em sequência');
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|erty|asdf|sdfg|zxcv)/i.test(password)) problems.push('contém uma sequência previsível');
  if (unique <= Math.floor(password.length / 3)) problems.push('usa poucos caracteres diferentes');
  if (password.length < 8) problems.push('tem menos de 8 caracteres');
  else if (password.length < 12) problems.push('é curta (prefira 12 ou mais caracteres)');
  if (classes < 3) problems.push('mistura poucos tipos de caractere');

  // Padrões previsíveis reduzem a entropia efetiva.
  if (common) entropy = Math.min(entropy, 10);
  else if (problems.some((p) => p.includes('repetidos') || p.includes('sequência') || p.includes('poucos caracteres diferentes'))) entropy *= 0.6;
  entropy = Math.round(entropy * 10) / 10;

  const score = common || password.length < 8 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  return { score, entropy, classes, problems };
}

const STRENGTH = ['muito fraca', 'fraca', 'razoável', 'forte', 'muito forte'];

export const strongPasswordTool = defineValidator({
  id: 'senha-forte',
  name: 'Verificador de Senha Forte',
  description: 'Avalia a força de uma senha e aponta o que melhorar, sem enviá-la a nenhum servidor',
  keywords: ['senha', 'força', 'segurança', 'forte', 'password', 'entropia', 'verificar'],
  icon: '🛡️',
  label: 'Senha',
  help: 'A análise acontece só no seu navegador. Mesmo assim, evite digitar senhas reais em qualquer site.',
  maxLength: 128,
  detailLabels: { strength: 'Força', entropyBits: 'Entropia estimada (bits)', length: 'Tamanho', problems: 'Pontos de atenção' },
  examples: [
    { description: 'Senha longa e variada', value: 'cavalo-Bateria_8-grampo!', valid: true },
    { description: 'Senha comum', value: 'senha123', valid: false },
  ],
  documentation:
    'A nota combina tamanho, variedade de caracteres, uma lista de senhas muito comuns e padrões previsíveis (sequências e repetições). É uma estimativa: uma senha longa, aleatória e única, guardada em um gerenciador, é sempre melhor. "Válido" significa nota "forte" ou "muito forte".',
  validate: (value) => {
    if (value === '') return { valid: false, message: 'Digite uma senha para avaliar' };
    const { score, entropy, problems } = assessPassword(value);
    return {
      valid: score >= 3,
      message: `Senha ${STRENGTH[score]}`,
      details: {
        strength: STRENGTH[score] as string,
        entropyBits: entropy,
        length: value.length,
        problems: problems.length ? problems.join('; ') : 'nenhum encontrado',
      },
    };
  },
});

// ---------- Regex ----------

const FLAGS = /^[dgimsuvy]*$/;
/** Padrões clássicos de backtracking catastrófico, como (a+)+ ou (.*)*. */
const CATASTROPHIC = /\((?:[^()|\\]|\\.)[+*]\)[+*]/;

export interface RegexMatch {
  index: number;
  text: string;
  groups: string[];
}

export function runRegex(pattern: string, flags: string, text: string, maxMatches = 500) {
  if (!FLAGS.test(flags) || new Set(flags).size !== flags.length) {
    return { valid: false, message: 'Flags inválidas: use letras sem repetição de "dgimsuvy"', matches: [] as RegexMatch[], total: 0 };
  }
  if (CATASTROPHIC.test(pattern)) {
    return { valid: false, message: 'Padrão recusado: quantificadores aninhados como (a+)+ podem travar o navegador (backtracking catastrófico)', matches: [], total: 0 };
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  } catch (e) {
    return { valid: false, message: `Expressão inválida: ${e instanceof Error ? e.message : String(e)}`, matches: [], total: 0 };
  }
  const matches: RegexMatch[] = [];
  let total = 0;
  for (const m of text.matchAll(regex)) {
    total++;
    if (matches.length < maxMatches) {
      matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1).map((g) => g ?? '(não participou)') });
    }
  }
  return { valid: true, message: total === 0 ? 'Expressão válida, sem correspondências no texto' : `${total} correspondência${total === 1 ? '' : 's'}`, matches, total };
}

export const regexTool = defineTool({
  id: 'regex',
  name: 'Testador de Expressões Regulares',
  description: 'Valida uma expressão regular (JavaScript) e mostra as correspondências e os grupos capturados',
  category: 'validadores',
  keywords: ['regex', 'expressão regular', 'regexp', 'testar', 'padrão', 'grupos'],
  icon: '🔍',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    pattern: z.string().max(1000),
    flags: z.string().max(8).default('g'),
    text: z.string().max(100_000),
  }),
  outputSchema: z.object({ valid: z.boolean(), message: z.string(), total: z.number(), matches: z.array(z.string()) }),
  execute: ({ pattern, flags, text }) => {
    if (pattern === '') return { valid: false, message: 'Informe uma expressão', total: 0, matches: [] };
    const r = runRegex(pattern, flags, text);
    return {
      valid: r.valid,
      message: r.message,
      total: r.total,
      matches: r.matches.map((m, i) => `#${i + 1} posição ${m.index}: "${m.text}"${m.groups.length ? ` grupos: ${m.groups.map((g, j) => `${j + 1}="${g}"`).join(', ')}` : ''}`),
    };
  },
  fields: {
    pattern: { label: 'Expressão', placeholder: '(\\d{3})-(\\d{4})' },
    flags: { label: 'Flags', help: 'g (todas), i (ignorar caixa), m, s, u, y, d, v.' },
    text: { label: 'Texto de teste', multiline: true },
  },
  outputLabels: { valid: 'Expressão válida', message: 'Mensagem', total: 'Correspondências', matches: 'Resultados' },
  examples: [
    { description: 'Telefones', input: { pattern: '(\\d{3})-(\\d{4})', flags: 'g', text: 'ligue 555-1234 ou 555-9876' }, output: { valid: true, total: 2 } },
    { description: 'Expressão inválida', input: { pattern: '(abc', flags: 'g', text: 'abc' }, output: { valid: false, total: 0 } },
  ],
  documentation:
    'Usa o motor de expressões regulares do JavaScript (do seu navegador). O teste roda no seu dispositivo, então padrões com backtracking catastrófico podem congelar a aba; os casos clássicos como (a+)+ são recusados, mas não há garantia contra todos. Limites: 1000 caracteres de padrão, 100 mil de texto e 500 correspondências exibidas.',
});
