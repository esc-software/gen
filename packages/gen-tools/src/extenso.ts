import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const SCALES: [string, string][] = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões'], ['quatrilhão', 'quatrilhões']];

export type Gender = 'masculino' | 'feminino';

function feminize(word: string): string {
  if (word === 'um') return 'uma';
  if (word === 'dois') return 'duas';
  if (word.endsWith('entos')) return word.replace(/entos$/, 'entas');
  return word;
}

/** Texto de um grupo de 0 a 999. */
function group(n: number, gender: Gender): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(gender === 'feminino' ? feminize(HUNDREDS[hundreds] as string) : (HUNDREDS[hundreds] as string));
  if (rest > 0) {
    let word: string;
    if (rest < 20) word = UNITS[rest] as string;
    else {
      word = TENS[Math.floor(rest / 10)] as string;
      if (rest % 10 > 0) word += ` e ${gender === 'feminino' ? feminize(UNITS[rest % 10] as string) : UNITS[rest % 10]}`;
    }
    parts.push(gender === 'feminino' && rest < 3 ? feminize(word) : word);
  }
  return parts.join(' e ');
}

/** Maior inteiro suportado: 999 quatrilhões. */
export const MAX_EXTENSO = 999_999_999_999_999_999n;

export function numberToWords(value: bigint, gender: Gender = 'masculino'): string {
  if (value < 0n) return `menos ${numberToWords(-value, gender)}`;
  if (value > MAX_EXTENSO) throw new RangeError('Número grande demais');
  if (value === 0n) return 'zero';

  const groups: number[] = [];
  let rest = value;
  while (rest > 0n) {
    groups.push(Number(rest % 1000n));
    rest /= 1000n;
  }

  const parts: { text: string; value: number }[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] as number;
    if (g === 0) continue;
    // Só "mil" e a unidade concordam em gênero; milhão, bilhão... são masculinos.
    const groupGender: Gender = i <= 1 ? gender : 'masculino';
    let text: string;
    if (i === 0) text = group(g, groupGender);
    else if (i === 1) text = g === 1 ? 'mil' : `${group(g, groupGender)} mil`;
    else text = `${group(g, 'masculino')} ${g === 1 ? (SCALES[i] as [string, string])[0] : (SCALES[i] as [string, string])[1]}`;
    parts.push({ text, value: g });
  }

  if (parts.length === 1) return (parts[0] as { text: string }).text;
  const last = parts[parts.length - 1] as { text: string; value: number };
  const init = parts.slice(0, -1).map((p) => p.text).join(' ');
  // "e" antes do último grupo quando ele é menor que 100 ou múltiplo de 100.
  const joiner = last.value < 100 || last.value % 100 === 0 ? ' e ' : ' ';
  return `${init}${joiner}${last.text}`;
}

export function moneyToWords(cents: bigint): string {
  if (cents < 0n) return `menos ${moneyToWords(-cents)}`;
  const reais = cents / 100n;
  const centavos = Number(cents % 100n);
  const parts: string[] = [];

  if (reais > 0n) {
    const text = numberToWords(reais);
    // "de reais" quando a quantidade termina em milhão/bilhão/... sem resto abaixo de milhar.
    const needsDe = reais >= 1_000_000n && reais % 1_000_000n === 0n;
    parts.push(`${text} ${needsDe ? 'de ' : ''}${reais === 1n ? 'real' : 'reais'}`);
  }
  if (centavos > 0) parts.push(`${numberToWords(BigInt(centavos))} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return parts.length === 0 ? 'zero reais' : parts.join(' e ');
}

export const numberWordsTool = defineTool({
  id: 'numero-extenso',
  name: 'Número por Extenso',
  description: 'Escreve um número inteiro por extenso em português, no masculino ou no feminino',
  category: 'conversores',
  keywords: ['extenso', 'número', 'escrever', 'por extenso', 'numeral', 'cheque'],
  icon: '✍️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    value: z.string().max(30).default('0'),
    gender: z.enum(['masculino', 'feminino']).default('masculino'),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: ({ value, gender }) => {
    const text = value.replace(/[\s.]/g, '');
    if (!/^-?\d+$/.test(text)) throw new ToolError('Informe um número inteiro, como 1234 ou -50');
    const n = BigInt(text);
    if (n > MAX_EXTENSO || n < -MAX_EXTENSO) throw new ToolError('Número grande demais (o limite é 999 quatrilhões)');
    return { text: numberToWords(n, gender) };
  },
  fields: {
    value: { label: 'Número', placeholder: '1250' },
    gender: { label: 'Gênero', optionLabels: { masculino: 'Masculino (dois, duzentos)', feminino: 'Feminino (duas, duzentas)' } },
  },
  outputLabels: { text: 'Por extenso' },
  examples: [
    { description: 'Número composto', input: { value: '12345', gender: 'masculino' }, output: { text: 'doze mil trezentos e quarenta e cinco' } },
    { description: 'Feminino', input: { value: '2200', gender: 'feminino' }, output: { text: 'duas mil e duzentas' } },
  ],
  documentation:
    'Segue a norma culta: "cem" para 100 e "cento" nas demais centenas, "mil" sem "um" na frente, plural de milhão e bilhão, e "e" antes do último grupo quando ele é menor que 100 ou centena exata (mil e quinhentos; mil duzentos e três). Na escala longa usada no Brasil, 1 bilhão = 10^9. Aceita inteiros de até 999 quatrilhões, positivos ou negativos. Pontos de milhar na entrada são ignorados.',
});

export const moneyWordsTool = defineTool({
  id: 'valor-extenso',
  name: 'Valor Monetário por Extenso',
  description: 'Escreve um valor em reais por extenso, com centavos, como em cheques e recibos',
  category: 'conversores',
  keywords: ['valor', 'extenso', 'reais', 'centavos', 'cheque', 'recibo', 'moeda', 'por extenso'],
  icon: '💵',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ value: z.string().max(30).default('0,00') }),
  outputSchema: z.object({ text: z.string(), normalized: z.string() }),
  execute: ({ value }) => {
    const raw = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    // Aceita 1.234,56 (padrão brasileiro) e 1234.56 (ponto decimal).
    const br = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(raw);
    const us = /^-?\d+(\.\d{1,2})?$/.test(raw);
    if (!br && !us) throw new ToolError('Valor inválido. Use 1234,56 ou 1.234,56 (no máximo 2 casas decimais)');
    const normalized = br ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const negative = normalized.startsWith('-');
    const [intPart = '0', frac = ''] = normalized.replace('-', '').split('.');
    if (intPart.length > 15) throw new ToolError('Valor grande demais (o limite é 999 trilhões)');
    const cents = BigInt(intPart) * 100n + BigInt(frac.padEnd(2, '0'));
    return {
      text: (negative && cents > 0n ? 'menos ' : '') + moneyToWords(cents),
      normalized: `R$ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac.padEnd(2, '0')}`,
    };
  },
  fields: { value: { label: 'Valor em reais', placeholder: 'R$ 1.250,50' } },
  outputLabels: { text: 'Por extenso', normalized: 'Valor interpretado' },
  examples: [
    { description: 'Reais e centavos', input: { value: 'R$ 1.250,50' }, output: { text: 'mil duzentos e cinquenta reais e cinquenta centavos' } },
    { description: 'Milhão exato', input: { value: '1000000' }, output: { text: 'um milhão de reais' } },
    { description: 'Um centavo', input: { value: '0,01' }, output: { text: 'um centavo' } },
  ],
  documentation:
    'Escreve o valor em reais e centavos conforme o uso em cheques e recibos. Usa "de reais" quando o valor termina em milhão, bilhão etc. exatos (um milhão de reais), singular para um real e um centavo, e aceita o formato brasileiro (1.234,56) ou com ponto decimal (1234.56). Não use como única conferência em documentos de valor legal.',
});
