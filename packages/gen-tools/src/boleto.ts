import { today } from './calc-daily.js';
import type { CalendarDate } from './dates.js';
import { boletoGeneralDv, mod10 } from './finance-demo.js';
import { defineValidator, onlyDigits, type ValidationOutcome } from './validator.js';

const BASE = Date.UTC(1997, 9, 7);
const DAY = 86_400_000;
const CYCLE_DAYS = 9000;

const BANKS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '041': 'Banrisul', '070': 'BRB', '077': 'Inter', '104': 'Caixa Econômica Federal', '197': 'Stone', '212': 'Banco Original',
  '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank', '323': 'Mercado Pago', '336': 'C6 Bank', '341': 'Itaú', '380': 'PicPay', '403': 'Cora', '422': 'Safra',
  '748': 'Sicredi', '756': 'Sicoob',
};

const SEGMENTS: Record<string, string> = {
  '1': 'Prefeituras', '2': 'Saneamento', '3': 'Energia elétrica e gás', '4': 'Telecomunicações', '5': 'Órgãos governamentais', '6': 'Carnês e assemelhados',
  '7': 'Multas de trânsito', '8': 'Uso exclusivo do banco', '9': 'Outros',
};

const pad = (n: number) => String(n).padStart(2, '0');
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: CalendarDate) => `${pad(d.day)}/${pad(d.month)}/${d.year}`;
const toCalendar = (ms: number): CalendarDate => {
  const x = new Date(ms);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
};

/** Dígito verificador módulo 11 dos boletos de arrecadação (convênio): resto 0 ou 1 vira 0. */
export function convenioMod11(digits: string): number {
  const sum = [...digits].reverse().reduce((acc, d, i) => acc + Number(d) * ((i % 8) + 2), 0);
  const rest = sum % 11;
  return rest <= 1 ? 0 : 11 - rest;
}

/**
 * Data de vencimento a partir do fator. O fator conta dias desde 07/10/1997 e recomeça em 1000 depois de 9999
 * (a partir de 22/02/2025), então um fator de 1000 a 9999 serve a duas datas; escolhemos a mais próxima da referência.
 */
export function dueDateFromFactor(factor: number, reference: CalendarDate): { date: CalendarDate; repeats: boolean; other?: CalendarDate } | null {
  if (factor === 0) return null;
  const first = BASE + factor * DAY;
  if (factor < 1000) return { date: toCalendar(first), repeats: false };
  const second = first + CYCLE_DAYS * DAY;
  const ref = Date.UTC(reference.year, reference.month - 1, reference.day);
  const firstIsCloser = Math.abs(first - ref) <= Math.abs(second - ref);
  return { date: toCalendar(firstIsCloser ? first : second), repeats: true, other: toCalendar(firstIsCloser ? second : first) };
}

export function lineFromBankBarcode(barcode: string): string {
  const f1 = barcode.slice(0, 4) + barcode.slice(19, 24);
  const f2 = barcode.slice(24, 34);
  const f3 = barcode.slice(34, 44);
  return `${f1.slice(0, 5)}.${f1.slice(5)}${mod10(f1)} ${f2.slice(0, 5)}.${f2.slice(5)}${mod10(f2)} ${f3.slice(0, 5)}.${f3.slice(5)}${mod10(f3)} ${barcode[4]} ${barcode.slice(5, 19)}`;
}

function analyzeBank(barcode: string, line: string | undefined, reference: CalendarDate): ValidationOutcome {
  const expected = boletoGeneralDv(barcode.slice(0, 4) + barcode.slice(5));
  const valid = Number(barcode[4]) === expected;
  const bank = barcode.slice(0, 3);
  const factor = Number(barcode.slice(5, 9));
  const cents = Number(barcode.slice(9, 19));
  const due = dueDateFromFactor(factor, reference);
  const details: Record<string, string | number | boolean> = {
    type: 'Boleto de cobrança bancária',
    bank: BANKS[bank] ? `${bank} (${BANKS[bank]})` : bank,
    amount: cents === 0 ? 'Sem valor fixo (definido no pagamento)' : reais(cents / 100),
    dueDate: due ? br(due.date) : 'Sem data de vencimento (à vista)',
    barcode,
    line: line ?? lineFromBankBarcode(barcode),
  };
  if (due?.repeats && due.other) details.dueNote = `O fator ${factor} serve a duas datas, ${br(due.date)} e ${br(due.other)} (o fator recomeça a cada 9.000 dias); mostramos a mais próxima de hoje.`;
  return { valid, message: valid ? 'Os dígitos verificadores conferem' : 'O dígito verificador geral do código de barras não confere', details };
}

function analyzeConvenio(barcode: string): ValidationOutcome {
  const id = barcode[2] as string;
  const moduleOf = id === '6' || id === '7' ? 10 : id === '8' || id === '9' ? 11 : undefined;
  if (moduleOf === undefined) return { valid: false, message: 'O 3º dígito (identificação de valor e módulo) deve ser 6, 7, 8 ou 9' };
  const dv = (digits: string) => (moduleOf === 10 ? mod10(digits) : convenioMod11(digits));
  const valid = Number(barcode[3]) === dv(barcode.slice(0, 3) + barcode.slice(4));
  const effective = id === '6' || id === '8';
  const cents = Number(barcode.slice(4, 15));
  const blocks = [0, 1, 2, 3].map((i) => {
    const data = barcode.slice(i * 11, i * 11 + 11);
    return `${data}-${dv(data)}`;
  });
  return {
    valid,
    message: valid ? 'Os dígitos verificadores conferem' : 'O dígito verificador geral do código de barras não confere',
    details: {
      type: 'Boleto de arrecadação (convênio)',
      segment: SEGMENTS[barcode[1] as string] ?? 'Desconhecido',
      amount: effective ? (cents === 0 ? 'Sem valor fixo' : reais(cents / 100)) : 'Valor de referência (não é em reais)',
      module: `Módulo ${moduleOf}`,
      barcode,
      line: blocks.join(' '),
    },
  };
}

export function analyzeBoleto(input: string, reference: CalendarDate = today()): ValidationOutcome {
  const d = onlyDigits(input);
  if (d === '') return { valid: false, message: 'Digite ou cole a linha digitável ou o código de barras' };

  if (d.length === 47) {
    const fields: Array<[string, string, string]> = [
      ['1', d.slice(0, 9), d[9] as string],
      ['2', d.slice(10, 20), d[20] as string],
      ['3', d.slice(21, 31), d[31] as string],
    ];
    for (const [n, data, check] of fields) {
      if (mod10(data) !== Number(check)) return { valid: false, message: `O dígito verificador do campo ${n} não confere (esperado ${mod10(data)})` };
    }
    const barcode = `${d.slice(0, 4)}${d[32]}${d.slice(33, 47)}${d.slice(4, 9)}${d.slice(10, 20)}${d.slice(21, 31)}`;
    return analyzeBank(barcode, `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`, reference);
  }

  if (d.length === 48) {
    if (d[0] !== '8') return { valid: false, message: 'Linha de arrecadação (48 dígitos) começa com 8; esta não começa' };
    const id = d[2] as string;
    const moduleOf = id === '6' || id === '7' ? 10 : id === '8' || id === '9' ? 11 : undefined;
    if (moduleOf === undefined) return { valid: false, message: 'O 3º dígito (identificação de valor e módulo) deve ser 6, 7, 8 ou 9' };
    const dv = (digits: string) => (moduleOf === 10 ? mod10(digits) : convenioMod11(digits));
    for (let i = 0; i < 4; i++) {
      const data = d.slice(i * 12, i * 12 + 11);
      if (dv(data) !== Number(d[i * 12 + 11])) return { valid: false, message: `O dígito verificador do campo ${i + 1} não confere (esperado ${dv(data)})` };
    }
    return analyzeConvenio([0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 11)).join(''));
  }

  if (d.length === 44) return d[0] === '8' ? analyzeConvenio(d) : analyzeBank(d, undefined, reference);

  return { valid: false, message: `Linha digitável tem 47 dígitos (cobrança) ou 48 (arrecadação) e o código de barras tem 44; foram informados ${d.length}` };
}

export const boletoValidatorTool = defineValidator({
  id: 'validador-boleto',
  name: 'Validador de Boleto (Linha Digitável e Código de Barras)',
  description: 'Confere os dígitos verificadores da linha digitável ou do código de barras de um boleto e mostra banco, valor e vencimento',
  keywords: ['validar boleto', 'linha digitável', 'código de barras boleto', 'boleto válido', 'verificar boleto', 'boleto de cobrança', 'boleto de convênio', 'conta de luz', 'febraban', 'vencimento do boleto'],
  icon: '🧾',
  label: 'Linha digitável ou código de barras',
  placeholder: '00190.50095 40144.816069 06809.350314 3 37370000000100',
  help: 'Aceita boleto de cobrança (47 dígitos) e de arrecadação/convênio (48 dígitos), com ou sem pontos e espaços; também o código de barras de 44 dígitos.',
  maxLength: 120,
  detailLabels: {
    type: 'Tipo', bank: 'Banco emissor', segment: 'Segmento', amount: 'Valor', dueDate: 'Vencimento', dueNote: 'Observação', module: 'Dígito verificador', barcode: 'Código de barras', line: 'Linha digitável',
  },
  examples: [
    { description: 'Linha digitável de cobrança bancária', value: '00190.50095 40144.816069 06809.350314 3 37370000000100', valid: true },
    { description: 'Um dígito trocado', value: '00190.50095 40144.816069 06809.350314 4 37370000000100', valid: false },
  ],
  documentation:
    'Confere a estrutura e os dígitos verificadores definidos pela FEBRABAN: nos boletos de cobrança (47 dígitos), os três primeiros campos usam módulo 10 e o dígito geral do código de barras usa módulo 11; nos de arrecadação (48 dígitos), os quatro campos usam módulo 10 ou 11 conforme o 3º dígito. Mostra banco, valor e vencimento quando o boleto os informa. A ferramenta confere a forma: ela não consulta o banco, então não diz se o boleto foi emitido, se está pago nem se o beneficiário é quem parece. Antes de pagar, confira sempre o nome do beneficiário no app do banco.',
  validate: (value) => analyzeBoleto(value),
});
