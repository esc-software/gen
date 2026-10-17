import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { createRng, type Rng } from '@esc/gen-utils';
import { BANKS } from './br-data.js';
import { calcNetSalary } from './payroll.js';
import { SUPPORTED_IR_YEARS } from './payroll-data.js';
import { today } from './calc-daily.js';
import { makeBarcodeSvg, svgToDataUrl } from './codes.js';
import { generateName } from './generators.js';
import { luhnValid } from './validators-intl.js';
import { parseIsoDate, type CalendarDate } from './dates.js';

const seedField = z.string().max(100).optional();
const seedHint = { label: 'Semente (opcional)', help: 'Com a mesma semente, os mesmos dados são gerados de novo. Deixe vazio para dados aleatórios.' };
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isoDate = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

// ---------- cartão de crédito demonstrativo ----------

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover' | 'jcb';

const BRAND_SPEC: Record<CardBrand, { label: string; length: number; prefixes: string[]; cvv: number }> = {
  visa: { label: 'Visa', length: 16, prefixes: ['4'], cvv: 3 },
  mastercard: { label: 'Mastercard', length: 16, prefixes: ['51', '52', '53', '54', '55'], cvv: 3 },
  amex: { label: 'American Express', length: 15, prefixes: ['34', '37'], cvv: 4 },
  diners: { label: 'Diners Club', length: 14, prefixes: ['36'], cvv: 3 },
  discover: { label: 'Discover', length: 16, prefixes: ['6011'], cvv: 3 },
  jcb: { label: 'JCB', length: 16, prefixes: ['353', '356'], cvv: 3 },
};

/** Completa com o dígito verificador de Luhn. */
export function withLuhn(partial: string): string {
  for (let d = 0; d <= 9; d++) if (luhnValid(partial + d)) return partial + d;
  throw new Error('Luhn: não encontrou o dígito');
}

export function generateCardNumber(rng: Rng, brand: CardBrand): string {
  const spec = BRAND_SPEC[brand];
  const prefix = rng.pick(spec.prefixes);
  return withLuhn(prefix + rng.digits(spec.length - prefix.length - 1));
}

export function formatCard(number: string): string {
  return number.length === 15 ? `${number.slice(0, 4)} ${number.slice(4, 10)} ${number.slice(10)}` : number.replace(/(.{4})/g, '$1 ').trim();
}

export const demoCardTool = defineTool({
  id: 'cartao-demonstrativo',
  name: 'Gerador de Cartão de Crédito Demonstrativo',
  description: 'Gera números de cartão fictícios com Luhn válido, validade, CVV e titular, apenas para demonstração de formulários',
  category: 'geradores',
  keywords: ['cartão de crédito', 'cartão fictício', 'luhn', 'visa', 'mastercard', 'demonstração', 'formulário', 'dados de teste'],
  icon: '💳',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: z.number().int().min(1).max(50).default(3),
    brand: z.enum(['any', 'visa', 'mastercard', 'amex', 'diners', 'discover', 'jcb']).default('any'),
    seed: seedField,
    referenceDate: isoDate('Data de referência').optional(),
  }),
  outputSchema: z.object({ cards: z.array(z.string()), note: z.string() }),
  execute: ({ count, brand, seed, referenceDate }) => {
    const rng = createRng(seed);
    const ref = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    const brands = Object.keys(BRAND_SPEC) as CardBrand[];
    return {
      cards: Array.from({ length: count }, () => {
        const b = brand === 'any' ? rng.pick(brands) : brand;
        const spec = BRAND_SPEC[b];
        const exp = new Date(Date.UTC(ref.year, ref.month - 1 + rng.between(12, 60), 1));
        const holder = generateName(rng, 'any', 1).full.toUpperCase();
        return `${spec.label} · ${formatCard(generateCardNumber(rng, b))} · validade ${pad(exp.getUTCMonth() + 1)}/${String(exp.getUTCFullYear()).slice(2)} · CVV ${rng.digits(spec.cvv)} · ${holder}`;
      }),
      note: 'Dados fictícios: o número passa na verificação de Luhn e tem o formato da bandeira, mas não foi emitido por nenhuma instituição e não funciona em pagamentos. Para testar pagamentos use os cartões de teste publicados pelos gateways.',
    };
  },
  fields: {
    count: { label: 'Quantidade' },
    brand: { label: 'Bandeira', optionLabels: { any: 'Qualquer', visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', diners: 'Diners Club', discover: 'Discover', jcb: 'JCB' } },
    seed: seedHint,
    referenceDate: { label: 'Data de referência da validade (opcional)', inputType: 'date', help: 'Padrão: hoje.' },
  },
  outputLabels: { cards: 'Cartões demonstrativos', note: 'Importante' },
  downloads: [{ field: 'cards', fileName: 'cartoes-demonstrativos.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Três cartões reproduzíveis', input: { count: 3, brand: 'any', seed: 'cartao', referenceDate: '2026-01-01' } }],
  documentation:
    'Serve para preencher e validar formulários, telas e bancos de dados de teste. Não gera dados de cartões reais, não verifica saldo nem autoriza compras. Para simular pagamentos aprovados ou recusados em um provedor, use a ferramenta de cartões de teste de gateways.',
});

// ---------- cartões de teste de gateways ----------

export interface GatewayCard {
  gateway: 'stripe' | 'mercadopago';
  brand: string;
  number: string;
  scenario: string;
  /** Instrução adicional (CVV, titular, validade). */
  how: string;
}

export const GATEWAY_SOURCES = {
  stripe: { name: 'Stripe', url: 'https://docs.stripe.com/testing', verifiedOn: '2026-10-16' },
  mercadopago: { name: 'Mercado Pago', url: 'https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-cards', verifiedOn: '2026-10-16' },
} as const;

const STRIPE_HOW = 'Use qualquer validade futura e qualquer CVC (3 dígitos; 4 no Amex).';
const MP_HOW = 'Validade 11/30; o resultado depende do nome do titular (veja os códigos).';

export const GATEWAY_CARDS: readonly GatewayCard[] = [
  { gateway: 'stripe', brand: 'Visa', number: '4242 4242 4242 4242', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa (débito)', number: '4000 0566 5566 5556', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Mastercard', number: '5555 5555 5555 4444', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'American Express', number: '3782 822463 10005', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Discover', number: '6011 1111 1111 1117', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Diners Club', number: '3056 9300 0902 0004', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'JCB', number: '3566 0020 2036 0505', scenario: 'Pagamento bem-sucedido', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 0002', scenario: 'Recusa genérica (card_declined / generic_decline)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 9995', scenario: 'Recusa por fundos insuficientes (insufficient_funds)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 9987', scenario: 'Recusa: cartão perdido (lost_card)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 9979', scenario: 'Recusa: cartão roubado (stolen_card)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 0069', scenario: 'Erro: cartão vencido (expired_card)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 0127', scenario: 'Erro: CVC incorreto (incorrect_cvc)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 0119', scenario: 'Erro de processamento (processing_error)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4242 4242 4242 4241', scenario: 'Erro: número incorreto (incorrect_number)', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 3220', scenario: '3D Secure obrigatório: a autenticação precisa ser concluída', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0084 0000 1629', scenario: '3D Secure obrigatório e pagamento recusado depois da autenticação', how: STRIPE_HOW },
  { gateway: 'stripe', brand: 'Visa', number: '4000 0000 0000 3055', scenario: '3D Secure aceito, mas não obrigatório', how: STRIPE_HOW },
  { gateway: 'mercadopago', brand: 'Mastercard', number: '5480 8328 0103 3311', scenario: 'Cartão de crédito de teste', how: `CVV 123. ${MP_HOW}` },
  { gateway: 'mercadopago', brand: 'Visa', number: '4235 6477 2802 5682', scenario: 'Cartão de crédito de teste', how: `CVV 123. ${MP_HOW}` },
  { gateway: 'mercadopago', brand: 'American Express', number: '3753 651535 56885', scenario: 'Cartão de crédito de teste', how: `CVV 1234. ${MP_HOW}` },
  { gateway: 'mercadopago', brand: 'Elo (débito)', number: '5067 7667 8388 8311', scenario: 'Cartão de débito de teste', how: `CVV 123. ${MP_HOW}` },
];

export const MP_HOLDER_CODES: readonly { code: string; result: string }[] = [
  { code: 'APRO', result: 'Pagamento aprovado (documento: CPF 12345678909)' },
  { code: 'OTHE', result: 'Recusado por erro geral (documento: CPF 12345678909)' },
  { code: 'CONT', result: 'Pagamento pendente' },
  { code: 'CALL', result: 'Recusado: validar para autorizar' },
  { code: 'FUND', result: 'Recusado: saldo insuficiente' },
  { code: 'SECU', result: 'Recusado: código de segurança inválido' },
  { code: 'EXPI', result: 'Recusado: problema com a data de validade' },
  { code: 'FORM', result: 'Recusado: erro no formulário' },
];

export const testCardsTool = defineTool({
  id: 'cartao-teste-pagamento',
  name: 'Cartões de Teste de Gateways de Pagamento',
  description: 'Lista os cartões de teste publicados pelo Stripe e pelo Mercado Pago, com o cenário que cada um simula',
  category: 'geradores',
  keywords: ['cartão de teste', 'stripe', 'mercado pago', 'sandbox', 'pagamento', '4242', 'gateway', 'recusado', 'aprovado', '3d secure'],
  icon: '🧪',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    gateway: z.enum(['all', 'stripe', 'mercadopago']).default('all'),
    search: z.string().max(60).optional(),
  }),
  outputSchema: z.object({ cards: z.array(z.string()), sources: z.string(), note: z.string() }),
  execute: ({ gateway, search }) => {
    const q = (search ?? '').toLowerCase().trim();
    const cards = GATEWAY_CARDS.filter((c) => (gateway === 'all' || c.gateway === gateway) && (q === '' || `${c.brand} ${c.scenario} ${c.number}`.toLowerCase().includes(q)));
    if (cards.length === 0) throw new ToolError('Nenhum cartão encontrado para esse filtro');
    const sources = (['stripe', 'mercadopago'] as const)
      .filter((g) => gateway === 'all' || gateway === g)
      .map((g) => `${GATEWAY_SOURCES[g].name}: ${GATEWAY_SOURCES[g].url} (conferido em ${GATEWAY_SOURCES[g].verifiedOn})`)
      .join(' | ');
    const lines = cards.map((c) => `[${GATEWAY_SOURCES[c.gateway].name}] ${c.brand} ${c.number} — ${c.scenario}. ${c.how}`);
    if (gateway !== 'stripe' && cards.some((c) => c.gateway === 'mercadopago')) {
      lines.push('', 'Mercado Pago — nome do titular define o resultado:', ...MP_HOLDER_CODES.map((h) => `  ${h.code}: ${h.result}`));
    }
    return {
      cards: lines, sources,
      note: 'São cartões de teste: só funcionam no modo de teste (sandbox) de cada provedor, com as chaves de teste. Não têm saldo nem valor, e os provedores podem alterar a lista; confirme na documentação oficial antes de depender de um número.',
    };
  },
  fields: {
    gateway: { label: 'Provedor', optionLabels: { all: 'Todos', stripe: 'Stripe', mercadopago: 'Mercado Pago' } },
    search: { label: 'Filtrar (opcional)', placeholder: 'recusado, 3d secure, visa…' },
  },
  outputLabels: { cards: 'Cartões de teste', sources: 'Fontes oficiais', note: 'Importante' },
  examples: [{ description: 'Todos os cartões do Stripe', input: { gateway: 'stripe' } }],
  documentation:
    'Reúne os números publicados na documentação oficial do Stripe e do Mercado Pago (conferidos em 16/10/2026). Eles só funcionam no ambiente de testes de cada provedor. Em produção, nenhum deles é aceito.',
});

// ---------- conta bancária fictícia ----------

/** DV genérico (módulo 11) para dados fictícios. Não é o algoritmo de nenhuma instituição específica. */
export function genericDv(digits: string): number {
  const sum = [...digits].reverse().reduce((a, d, i) => a + Number(d) * ((i % 8) + 2), 0);
  const dv = 11 - (sum % 11);
  return dv >= 10 ? 0 : dv;
}

export const fakeBankAccountTool = defineTool({
  id: 'conta-bancaria-ficticia',
  name: 'Gerador de Conta Bancária Fictícia',
  description: 'Gera banco, agência e conta fictícios para testar formulários e cadastros de dados bancários',
  category: 'geradores',
  keywords: ['conta bancária', 'agência', 'banco', 'fictícia', 'teste', 'dados bancários', 'cadastro', 'conta corrente'],
  icon: '🏦',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: z.number().int().min(1).max(100).default(5),
    accountType: z.enum(['checking', 'savings']).default('checking'),
    seed: seedField,
  }),
  outputSchema: z.object({ accounts: z.array(z.string()), note: z.string() }),
  execute: ({ count, accountType, seed }) => {
    const rng = createRng(seed);
    return {
      accounts: Array.from({ length: count }, () => {
        const bank = rng.pick(BANKS);
        const agency = rng.digits(4);
        const account = rng.digits(rng.between(5, 8));
        return `${bank.code} - ${bank.name} · Agência ${agency}-${genericDv(agency)} · ${accountType === 'checking' ? 'Conta corrente' : 'Conta poupança'} ${account}-${genericDv(account)}`;
      }),
      note: 'Dados fictícios: o dígito verificador é genérico (módulo 11) e não segue a regra de nenhum banco específico, então não passarão na validação de um banco real. A conta não existe.',
    };
  },
  fields: {
    count: { label: 'Quantidade' },
    accountType: { label: 'Tipo de conta', optionLabels: { checking: 'Conta corrente', savings: 'Conta poupança' } },
    seed: seedHint,
  },
  outputLabels: { accounts: 'Contas fictícias', note: 'Importante' },
  downloads: [{ field: 'accounts', fileName: 'contas-ficticias.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Cinco contas reproduzíveis', input: { count: 5, accountType: 'checking', seed: 'conta' } }],
  documentation:
    'Os códigos e nomes dos bancos são reais (compe), mas agência e conta são números aleatórios. Cada instituição usa regras próprias de dígito verificador; sem uma especificação confiável de cada uma, esta ferramenta não tenta reproduzi-las.',
});

// ---------- boleto demonstrativo ----------

const BOLETO_BASE = Date.UTC(1997, 9, 7);

/** Fator de vencimento: dias desde 07/10/1997, reiniciando em 1000 depois de 9999 (a partir de 22/02/2025). */
export function dueFactor(date: CalendarDate): number {
  const days = Math.round((Date.UTC(date.year, date.month - 1, date.day) - BOLETO_BASE) / 86_400_000);
  if (days < 1000) return Math.max(days, 0);
  return 1000 + ((days - 1000) % 9000);
}

/** Dígito verificador módulo 10 de um campo da linha digitável (pesos 2 e 1 a partir da direita). */
export function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const p = Number(digits[i]) * weight;
    sum += Math.floor(p / 10) + (p % 10);
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

/** Dígito verificador geral do código de barras (módulo 11, pesos 2 a 9). */
export function boletoGeneralDv(digits43: string): number {
  const sum = [...digits43].reverse().reduce((a, d, i) => a + Number(d) * ((i % 8) + 2), 0);
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

export interface BoletoParts {
  bank: string;
  currency: string;
  factor: number;
  amountCents: number;
  freeField: string;
}

export function buildBoleto(p: BoletoParts): { barcode: string; line: string } {
  const factor = String(p.factor).padStart(4, '0');
  const value = String(p.amountCents).padStart(10, '0');
  const without = `${p.bank}${p.currency}${factor}${value}${p.freeField}`;
  const dv = boletoGeneralDv(without);
  const barcode = `${p.bank}${p.currency}${dv}${factor}${value}${p.freeField}`;
  const f1 = `${p.bank}${p.currency}${p.freeField.slice(0, 5)}`;
  const f2 = p.freeField.slice(5, 15);
  const f3 = p.freeField.slice(15, 25);
  const line = `${f1.slice(0, 5)}.${f1.slice(5)}${mod10(f1)} ${f2.slice(0, 5)}.${f2.slice(5)}${mod10(f2)} ${f3.slice(0, 5)}.${f3.slice(5)}${mod10(f3)} ${dv} ${factor}${value}`;
  return { barcode, line };
}

/** Confere os dígitos verificadores de uma linha digitável de 47 dígitos. */
export function checkBoletoLine(line: string): { valid: boolean; barcode?: string } {
  const d = line.replace(/\D/g, '');
  if (d.length !== 47) return { valid: false };
  const f1 = d.slice(0, 9);
  const f2 = d.slice(10, 20);
  const f3 = d.slice(21, 31);
  if (mod10(f1) !== Number(d[9]) || mod10(f2) !== Number(d[20]) || mod10(f3) !== Number(d[31])) return { valid: false };
  const barcode = `${d.slice(0, 4)}${d[32]}${d.slice(33, 47)}${d.slice(4, 9)}${d.slice(10, 20)}${d.slice(21, 31)}`;
  const without = barcode.slice(0, 4) + barcode.slice(5);
  return { valid: boletoGeneralDv(without) === Number(d[32]), barcode };
}

export const demoBoletoTool = defineTool({
  id: 'boleto-demonstrativo',
  name: 'Gerador de Boleto Demonstrativo',
  description: 'Gera um boleto fictício (linha digitável e código de barras) com dígitos verificadores corretos, apenas para testes',
  category: 'geradores',
  keywords: ['boleto', 'boleto fictício', 'linha digitável', 'código de barras', 'demonstrativo', 'febraban', 'teste', 'cobrança'],
  icon: '🧾',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({
    amount: z.number().finite().min(0).max(99_999_999.99).default(150),
    dueDate: isoDate('Vencimento'),
    beneficiary: z.string().min(1).max(60).default('EMPRESA DEMONSTRACAO LTDA'),
    seed: seedField,
  }),
  outputSchema: z.object({ line: z.string(), barcode: z.string(), dueFactor: z.number(), svg: z.string(), dataUrl: z.string(), document: z.string(), note: z.string() }),
  execute: async ({ amount, dueDate, beneficiary, seed }) => {
    const rng = createRng(seed);
    const due = parseIsoDate(dueDate) as CalendarDate;
    const factor = dueFactor(due);
    if (due.year < 2000 || due.year > 2099) throw new ToolError('Use um vencimento entre 2000 e 2099');
    const parts: BoletoParts = { bank: '000', currency: '9', factor, amountCents: Math.round(amount * 100), freeField: rng.digits(25) };
    const { barcode, line } = buildBoleto(parts);
    const svg = await makeBarcodeSvg('itf', barcode, { height: 14, scale: 1, showText: false });
    const document = [
      '*** BOLETO DEMONSTRATIVO — SEM VALOR LEGAL — NÃO PAGUE ***',
      `Beneficiário: ${beneficiary.toUpperCase()}`,
      `Vencimento: ${pad(due.day)}/${pad(due.month)}/${due.year}`,
      `Valor do documento: ${amount === 0 ? 'qualquer valor' : reais(amount)}`,
      `Linha digitável: ${line}`,
      `Código de barras: ${barcode}`,
      '*** Banco 000 inexistente: este documento não pode ser pago ***',
    ].join('\n');
    return {
      line, barcode, dueFactor: factor, svg, dataUrl: svgToDataUrl(svg), document,
      note: 'Documento demonstrativo: usa o código de banco 000, que não existe, então nenhum banco o reconhece, mas a estrutura e os dígitos verificadores seguem o padrão FEBRABAN. Não use para cobrar ninguém nem apresente como um boleto real.',
    };
  },
  fields: {
    amount: { label: 'Valor (R$)', help: '0 gera um boleto de valor livre.' },
    dueDate: { label: 'Vencimento', inputType: 'date' },
    beneficiary: { label: 'Nome do beneficiário fictício' },
    seed: seedHint,
  },
  outputLabels: { line: 'Linha digitável', barcode: 'Código de barras (44 dígitos)', dueFactor: 'Fator de vencimento', svg: 'Código de barras (SVG)', dataUrl: 'Data URL', document: 'Documento', note: 'Importante' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'document', fileName: 'boleto-demonstrativo.txt', mimeType: 'text/plain', label: 'Baixar .txt' }, { field: 'svg', fileName: 'boleto-codigo-de-barras.svg', mimeType: 'image/svg+xml', label: 'Baixar código de barras (SVG)' }],
  examples: [{ description: 'R$ 150 com vencimento em 15/03/2026', input: { amount: 150, dueDate: '2026-03-15', beneficiary: 'EMPRESA DEMONSTRACAO LTDA', seed: 'boleto' } }],
  documentation:
    'A linha digitável tem 47 dígitos: três campos com dígito verificador módulo 10, o dígito verificador geral (módulo 11) e o fator de vencimento mais o valor. O fator de vencimento conta dias desde 07/10/1997 e reinicia em 1000 depois de 9999 (a partir de 22/02/2025). Exclusivamente demonstrativo: o banco 000 não existe e o texto do documento afirma isso.',
});

// ---------- comprovante demonstrativo ----------

export const demoReceiptTool = defineTool({
  id: 'comprovante-demonstrativo',
  name: 'Gerador de Comprovante Bancário Demonstrativo',
  description: 'Gera um comprovante de transferência fictício e claramente identificado como demonstrativo, para telas e protótipos',
  category: 'geradores',
  keywords: ['comprovante', 'transferência', 'pix', 'ted', 'demonstrativo', 'protótipo', 'fictício', 'banco'],
  icon: '🧾',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    kind: z.enum(['pix', 'ted', 'doc']).default('pix'),
    amount: z.number().finite().positive().max(1e9).default(100),
    payer: z.string().max(60).optional(),
    receiver: z.string().max(60).optional(),
    dateTime: z.string().max(25).optional(),
    seed: seedField,
  }),
  outputSchema: z.object({ document: z.string(), authentication: z.string() }),
  execute: ({ kind, amount, payer, receiver, dateTime, seed }) => {
    const rng = createRng(seed);
    const p = payer?.trim() || generateName(rng).full;
    const r = receiver?.trim() || generateName(rng).full;
    const when = dateTime && /^\d{4}-\d{2}-\d{2}/.test(dateTime) ? dateTime.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16);
    const auth = `${rng.digits(4)}.${rng.digits(4)}.${rng.digits(4)}.${rng.digits(4)}`;
    const label = { pix: 'Pix', ted: 'TED', doc: 'DOC' }[kind];
    const document = [
      '*** COMPROVANTE DEMONSTRATIVO — SEM VALOR LEGAL ***',
      `Tipo: ${label}`,
      `Valor: ${reais(amount)}`,
      `Data e hora: ${when}`,
      `Pagador: ${p}`,
      `Recebedor: ${r}`,
      `Código de autenticação: ${auth}`,
      '*** Documento fictício para demonstração: não comprova nenhuma operação ***',
    ].join('\n');
    return { document, authentication: auth };
  },
  fields: {
    kind: { label: 'Tipo', optionLabels: { pix: 'Pix', ted: 'TED', doc: 'DOC' } },
    amount: { label: 'Valor (R$)' },
    payer: { label: 'Pagador (opcional)' },
    receiver: { label: 'Recebedor (opcional)' },
    dateTime: { label: 'Data e hora (opcional)', placeholder: '2026-03-15 14:30' },
    seed: seedHint,
  },
  outputLabels: { document: 'Comprovante', authentication: 'Código de autenticação' },
  downloads: [{ field: 'document', fileName: 'comprovante-demonstrativo.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Pix de R$ 100', input: { kind: 'pix', amount: 100, payer: 'Fulano de Tal', receiver: 'Beltrano de Tal', dateTime: '2026-03-15 14:30', seed: 'comp' } }],
  documentation:
    'O comprovante contém o aviso de "demonstrativo, sem valor legal" no início e no fim, e não usa logotipos nem leiautes de instituições financeiras. Não use para simular uma operação que não aconteceu: apresentar um comprovante falso como verdadeiro pode configurar crime (falsidade documental).',
});

// ---------- holerite demonstrativo ----------

export const demoPayslipTool = defineTool({
  id: 'holerite-demonstrativo',
  name: 'Gerador de Holerite Demonstrativo',
  description: 'Gera um contracheque fictício com INSS e imposto de renda calculados, para protótipos e treinamento',
  category: 'geradores',
  keywords: ['holerite', 'contracheque', 'demonstrativo de pagamento', 'folha', 'fictício', 'treinamento', 'protótipo'],
  icon: '📃',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    employee: z.string().max(60).optional(),
    company: z.string().min(1).max(60).default('EMPRESA DEMONSTRACAO LTDA'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Use AAAA-MM').default('2026-01'),
    gross: z.number().finite().positive().max(1e7).default(3000),
    dependents: z.number().int().min(0).max(20).default(0),
    transportVoucher: z.boolean().default(false),
    year: z.coerce.number().int().refine((y) => SUPPORTED_IR_YEARS.includes(y), { message: `Competências disponíveis: ${SUPPORTED_IR_YEARS.join(', ')}` }).default(Math.max(...SUPPORTED_IR_YEARS)),
    seed: seedField,
  }),
  outputSchema: z.object({ document: z.string(), net: z.number() }),
  execute: ({ employee, company, month, gross, dependents, transportVoucher, year, seed }) => {
    const rng = createRng(seed);
    const name = employee?.trim() || generateName(rng).full;
    const r = calcNetSalary({ gross, dependents, pension: 0, transportDiscount: transportVoucher ? Math.round(gross * 0.06 * 100) / 100 : 0, other: 0, deduction: 'auto', year });
    const [y, m] = month.split('-');
    const rows = [
      ['001', 'Salário base', reais(gross), ''],
      ['901', 'INSS', '', reais(r.inss)],
      ['902', 'IRRF', '', reais(r.irrf)],
      ...(transportVoucher ? [['903', 'Vale-transporte (6%)', '', reais(r.transport)]] : []),
    ];
    const document = [
      '*** HOLERITE DEMONSTRATIVO — SEM VALOR LEGAL ***',
      `Empresa: ${company.toUpperCase()}`,
      `Funcionário: ${name}`,
      `Competência: ${m}/${y}`,
      '',
      'Cód  Descrição                 Proventos      Descontos',
      ...rows.map(([c, d, p, x]) => `${String(c).padEnd(4)} ${String(d).padEnd(24)} ${String(p).padStart(12)} ${String(x).padStart(12)}`),
      '',
      `Total de proventos: ${reais(gross)}`,
      `Total de descontos: ${reais(gross - r.net)}`,
      `Líquido a receber: ${reais(r.net)}`,
      `FGTS do mês (depósito da empresa): ${reais(r.fgts)}`,
      '',
      '*** Documento fictício, gerado para demonstração. ***',
    ].join('\n');
    return { document, net: r.net };
  },
  fields: {
    employee: { label: 'Nome do funcionário (opcional)' },
    company: { label: 'Nome da empresa fictícia' },
    month: { label: 'Competência (AAAA-MM)', placeholder: '2026-01' },
    gross: { label: 'Salário bruto (R$)' },
    dependents: { label: 'Dependentes' },
    transportVoucher: { label: 'Incluir vale-transporte' },
    year: { label: 'Tabelas do ano', help: `Tabelas cadastradas: ${SUPPORTED_IR_YEARS.join(', ')}.` },
    seed: seedHint,
  },
  outputLabels: { document: 'Holerite', net: 'Líquido (R$)' },
  downloads: [{ field: 'document', fileName: 'holerite-demonstrativo.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Salário de R$ 3.000', input: { company: 'EMPRESA DEMONSTRACAO LTDA', month: '2026-01', gross: 3000, dependents: 0, transportVoucher: false, year: 2026, employee: 'Fulana de Tal' }, output: { net: 2751.4 } }],
  documentation:
    'Os descontos de INSS e imposto de renda são calculados com as tabelas da competência escolhida (mesma lógica da calculadora de salário líquido). O documento traz o aviso de demonstrativo no início e no fim. Não o utilize como comprovante de renda: um contracheque falso apresentado como verdadeiro pode configurar crime.',
});
