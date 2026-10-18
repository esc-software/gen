import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { remoteJson } from './remote.js';

const ipSchema = z.object({ ip: z.string().min(2).max(45), version: z.union([z.literal(4), z.literal(6)]) });

export const publicIpTool = defineTool({
  id: 'ip-publico',
  name: 'Qual é o Meu IP Público',
  description: 'Mostra o endereço IP (IPv4 ou IPv6) com que a sua conexão aparece na internet',
  category: 'utilidades',
  keywords: ['meu ip', 'qual é o meu ip', 'ip público', 'meu endereço ip', 'ipv4', 'ipv6', 'ver ip', 'what is my ip'],
  icon: '🌐',
  modes: ['remote'],
  live: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ ip: z.string(), version: z.string(), note: z.string() }),
  execute: async () => {
    const parsed = ipSchema.safeParse(await remoteJson('/v1/ip'));
    if (!parsed.success) throw new ToolError('A API respondeu algo inesperado. Tente de novo.');
    const { ip, version } = parsed.data;
    return {
      ip,
      version: `IPv${version}`,
      note: 'É o endereço que o seu provedor (ou a sua VPN) apresenta ao site. Ele não diz onde você está: não consultamos geolocalização nem guardamos o endereço.',
    };
  },
  fields: {},
  outputLabels: { ip: 'Seu IP público', version: 'Versão', note: 'Observação' },
  examples: [],
  documentation:
    'O navegador não sabe o próprio IP público, então esta ferramenta pergunta à API do Gen, que devolve o endereço de onde a requisição chegou. Nada além do endereço é enviado ou guardado: o endereço aparece apenas na resposta. Se você usa VPN, proxy ou a rede de uma empresa, o IP mostrado é o dela. O IP de dentro da sua casa (como 192.168.0.10) é outro, privado, e não aparece aqui.',
});

const ratesSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bulletin: z.string(),
  source: z.string(),
  rates: z.array(z.object({ code: z.string().min(3).max(3), name: z.string(), buy: z.number().positive(), sell: z.number().positive() })).min(1),
});
export type RatesPayload = z.infer<typeof ratesSchema>;

const RATES_TTL_MS = 10 * 60 * 1000;
let ratesCache: { at: number; payload: RatesPayload } | undefined;

async function loadRates(): Promise<RatesPayload> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.payload;
  const parsed = ratesSchema.safeParse(await remoteJson('/v1/rates'));
  if (!parsed.success) throw new ToolError('A API respondeu algo inesperado. Tente de novo.');
  ratesCache = { at: Date.now(), payload: parsed.data };
  return parsed.data;
}

/** Só para testes: esquece as cotações guardadas em memória. */
export function resetRatesCache(): void {
  ratesCache = undefined;
}

export type RateKind = 'average' | 'buy' | 'sell';

/** Reais por 1 unidade da moeda; o real vale 1. */
export function brlPerUnit(payload: RatesPayload, code: string, kind: RateKind): number {
  if (code === 'BRL') return 1;
  const row = payload.rates.find((r) => r.code === code);
  if (!row) throw new ToolError(`A moeda ${code} não tem cotação na PTAX`);
  return kind === 'buy' ? row.buy : kind === 'sell' ? row.sell : (row.buy + row.sell) / 2;
}

export function convertCurrency(amount: number, from: string, to: string, payload: RatesPayload, kind: RateKind): { result: number; rate: number } {
  const rate = brlPerUnit(payload, from, kind) / brlPerUnit(payload, to, kind);
  return { result: amount * rate, rate };
}

const CODES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'DKK', 'NOK', 'SEK'] as const;
const money = (n: number, code: string) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: code === 'JPY' ? 4 : 2 })} ${code}`;
const NAMES: Record<string, string> = {
  BRL: 'Real (BRL)', USD: 'Dólar dos EUA (USD)', EUR: 'Euro (EUR)', GBP: 'Libra esterlina (GBP)', JPY: 'Iene (JPY)', CHF: 'Franco suíço (CHF)',
  CAD: 'Dólar canadense (CAD)', AUD: 'Dólar australiano (AUD)', DKK: 'Coroa dinamarquesa (DKK)', NOK: 'Coroa norueguesa (NOK)', SEK: 'Coroa sueca (SEK)',
};

export const currencyTool = defineTool({
  id: 'moeda',
  name: 'Conversor de Moedas (Cotação do Banco Central)',
  description: 'Converte reais, dólar, euro, libra, iene e outras moedas com a cotação PTAX do Banco Central, com a data da cotação à vista',
  category: 'conversores',
  keywords: ['conversor de moedas', 'dólar hoje', 'euro hoje', 'cotação do dólar', 'converter dólar em real', 'ptax', 'câmbio', 'banco central', 'libra', 'iene'],
  icon: '💱',
  modes: ['remote'],
  live: true,
  inputSchema: z.object({
    amount: z.number().finite().min(0).max(1e12).default(100),
    from: z.enum(CODES).default('USD'),
    to: z.enum(CODES).default('BRL'),
    kind: z.enum(['average', 'buy', 'sell']).default('average'),
  }),
  outputSchema: z.object({ result: z.string(), rate: z.string(), date: z.string(), bulletin: z.string(), source: z.string(), note: z.string() }),
  execute: async ({ amount, from, to, kind }) => {
    const payload = await loadRates();
    const { result, rate } = convertCurrency(amount, from, to, payload, kind);
    const [y, m, d] = payload.date.split('-');
    return {
      result: money(result, to),
      rate: `1 ${from} = ${rate.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} ${to}`,
      date: `${d}/${m}/${y}`,
      bulletin: payload.bulletin,
      source: payload.source,
      note: 'É a cotação de referência do mercado interbancário. Bancos, casas de câmbio e cartões aplicam spread, tarifas e IOF, então o valor que você paga ou recebe é diferente.',
    };
  },
  fields: {
    amount: { label: 'Valor' },
    from: { label: 'De', optionLabels: NAMES },
    to: { label: 'Para', optionLabels: NAMES },
    kind: { label: 'Cotação', optionLabels: { average: 'Média entre compra e venda', buy: 'Compra', sell: 'Venda' } },
  },
  outputLabels: { result: 'Valor convertido', rate: 'Taxa usada', date: 'Data da cotação', bulletin: 'Boletim', source: 'Fonte', note: 'Observação' },
  examples: [],
  documentation:
    'Usa a PTAX, a taxa de câmbio de referência calculada e divulgada pelo Banco Central do Brasil a partir das negociações no mercado interbancário. A API do Gen busca o boletim de fechamento do último dia útil com cotação, guarda por 30 minutos e entrega ao site; a data aparece no resultado. Moedas sem cotação na PTAX (como o peso argentino) não estão disponíveis. Para converter entre duas moedas estrangeiras, a conta passa pelo real. O valor que você digita não é enviado: a conversão é feita no seu navegador.',
});

export const remoteTools = [publicIpTool, currencyTool];
