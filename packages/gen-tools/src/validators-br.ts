import { defineValidator, allSame, onlyDigits, type ValidationOutcome } from './validator.js';
import { validateCPF } from './cpf.js';
import { validateCNPJ } from './cnpj.js';
import { validateEmail } from './validators-intl.js';

const SYNTAX_NOTE = 'Valida apenas a sintaxe; não confirma que o número foi emitido nem que está ativo.';

// ---------- Título de eleitor ----------

const UF_BY_CODE: Record<string, string> = {
  '01': 'SP', '02': 'MG', '03': 'RJ', '04': 'RS', '05': 'BA', '06': 'PR', '07': 'CE', '08': 'PE', '09': 'SC',
  '10': 'GO', '11': 'MA', '12': 'PB', '13': 'PA', '14': 'ES', '15': 'PI', '16': 'RN', '17': 'AL', '18': 'MT',
  '19': 'MS', '20': 'DF', '21': 'SE', '22': 'AM', '23': 'RO', '24': 'AC', '25': 'AP', '26': 'RR', '27': 'TO',
  '28': 'Exterior (ZZ)',
};

export function calculateTituloCheckDigits(sequence: string, uf: string): { first: number; second: number } {
  if (!/^\d{8}$/.test(sequence) || !/^\d{2}$/.test(uf)) throw new RangeError('Sequencial (8 dígitos) e UF (2 dígitos) são obrigatórios');
  // Em SP (01) e MG (02), resto 0 resulta em dígito 1 em vez de 0.
  const special = uf === '01' || uf === '02';
  const adjust = (sum: number) => {
    const rest = sum % 11;
    if (rest === 10) return 0;
    return rest === 0 && special ? 1 : rest;
  };
  const first = adjust([...sequence].reduce((acc, d, i) => acc + Number(d) * (i + 2), 0));
  const second = adjust(Number(uf[0]) * 7 + Number(uf[1]) * 8 + first * 9);
  return { first, second };
}

export function validateTitulo(input: string): ValidationOutcome {
  const digits = onlyDigits(input);
  if (digits.length !== 12) return { valid: false, message: 'O título de eleitor deve ter 12 dígitos' };
  const uf = digits.slice(8, 10);
  const state = UF_BY_CODE[uf];
  if (!state) return { valid: false, message: `Código de UF inválido (${uf}); deve estar entre 01 e 28` };
  const { first, second } = calculateTituloCheckDigits(digits.slice(0, 8), uf);
  if (Number(digits[10]) !== first || Number(digits[11]) !== second) {
    return { valid: false, message: 'Título inválido: dígitos verificadores incorretos' };
  }
  return {
    valid: true,
    message: 'Título de eleitor válido (formato e dígitos verificadores)',
    details: { uf: state, formatted: `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}` },
  };
}

export const tituloTool = defineValidator({
  id: 'titulo-eleitor',
  name: 'Validador de Título de Eleitor',
  description: 'Valida o número do título de eleitor e identifica a unidade da federação de emissão',
  keywords: ['título de eleitor', 'titulo', 'eleitor', 'tse', 'validar', 'documento'],
  icon: '🗳️',
  label: 'Título de eleitor',
  placeholder: '8251 6909 1279',
  detailLabels: { uf: 'UF de emissão', formatted: 'Formatado' },
  examples: [
    { description: 'Título válido', value: '825169091279', valid: true },
    { description: 'Dígito incorreto', value: '825169091270', valid: false },
    { description: 'UF inexistente', value: '825169099979', valid: false },
  ],
  documentation: `Confere os 12 dígitos: 8 do sequencial, 2 da UF de emissão (01 a 28) e 2 verificadores (módulo 11, com a exceção de SP e MG). ${SYNTAX_NOTE} Títulos antigos de 13 dígitos não são suportados.`,
  validate: validateTitulo,
});

// ---------- CNS ----------

function cnsWeightedSum(digits: string, length = digits.length): number {
  return [...digits.slice(0, length)].reduce((acc, d, i) => acc + Number(d) * (15 - i), 0);
}

/** CNS definitivo (começa com 1 ou 2): derivado do PIS, com sufixo 000 ou 001. */
export function computeCnsDefinitivo(pis: string): string {
  const sum = cnsWeightedSum(pis, 11);
  const dv = 11 - (sum % 11);
  if (dv === 11) return `${pis}0000`;
  if (dv === 10) {
    const adjusted = 11 - ((sum + 2) % 11);
    return `${pis}001${adjusted === 11 ? 0 : adjusted}`;
  }
  return `${pis}000${dv}`;
}

export function validateCNS(input: string): ValidationOutcome {
  const digits = onlyDigits(input);
  if (digits.length !== 15) return { valid: false, message: 'O CNS deve ter 15 dígitos' };
  const first = digits[0] as string;
  if (first === '1' || first === '2') {
    if (computeCnsDefinitivo(digits.slice(0, 11)) !== digits) {
      return { valid: false, message: 'CNS inválido: dígito verificador incorreto' };
    }
    return { valid: true, message: 'CNS definitivo válido', details: { type: 'definitivo' } };
  }
  if (first === '7' || first === '8' || first === '9') {
    if (cnsWeightedSum(digits) % 11 !== 0) return { valid: false, message: 'CNS inválido: dígito verificador incorreto' };
    return { valid: true, message: 'CNS provisório válido', details: { type: 'provisório' } };
  }
  return { valid: false, message: 'CNS inválido: deve começar com 1, 2, 7, 8 ou 9' };
}

export const cnsTool = defineValidator({
  id: 'cns',
  name: 'Validador de CNS (Cartão Nacional de Saúde)',
  description: 'Valida o número do Cartão Nacional de Saúde, definitivo ou provisório',
  keywords: ['cns', 'cartão sus', 'cartao nacional de saude', 'sus', 'validar', 'saúde'],
  icon: '🏥',
  label: 'CNS',
  placeholder: '700 0000 0000 0005',
  detailLabels: { type: 'Tipo' },
  examples: [
    { description: 'Provisório válido (soma múltipla de 11)', value: '700000000000005', valid: true },
    { description: 'Dígito incorreto', value: '700000000000006', valid: false },
    { description: 'Prefixo inválido', value: '300000000000000', valid: false },
  ],
  documentation: `O CNS definitivo (começa com 1 ou 2) deriva do PIS do titular; o provisório (7, 8 ou 9) é validado por soma ponderada com módulo 11, conforme o algoritmo divulgado pela ANS. ${SYNTAX_NOTE}`,
  validate: validateCNS,
});

// ---------- RENAVAM ----------

const RENAVAM_WEIGHTS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function calculateRenavamCheckDigit(base10: string): number {
  if (!/^\d{10}$/.test(base10)) throw new RangeError('A base do RENAVAM deve ter 10 dígitos');
  const sum = [...base10].reduce((acc, d, i) => acc + Number(d) * (RENAVAM_WEIGHTS[i] as number), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

export function validateRenavam(input: string): ValidationOutcome {
  const digits = onlyDigits(input);
  if (digits.length < 9 || digits.length > 11) return { valid: false, message: 'O RENAVAM deve ter 11 dígitos (9 ou 10 são completados com zeros à esquerda)' };
  const padded = digits.padStart(11, '0');
  if (allSame(padded)) return { valid: false, message: 'RENAVAM inválido: todos os dígitos são iguais' };
  if (Number(padded[10]) !== calculateRenavamCheckDigit(padded.slice(0, 10))) {
    return { valid: false, message: 'RENAVAM inválido: dígito verificador incorreto' };
  }
  return { valid: true, message: 'RENAVAM válido (formato e dígito verificador)', details: { normalized: padded } };
}

export const renavamTool = defineValidator({
  id: 'renavam',
  name: 'Validador de RENAVAM',
  description: 'Valida o código RENAVAM de veículos pelo dígito verificador',
  keywords: ['renavam', 'veículo', 'detran', 'carro', 'moto', 'validar'],
  icon: '🚘',
  label: 'RENAVAM',
  placeholder: '08804737318',
  detailLabels: { normalized: 'Com 11 dígitos' },
  examples: [
    { description: 'RENAVAM válido', value: '08804737318', valid: true },
    { description: 'Mesmo número com 10 dígitos (completado)', value: '8804737318', valid: true },
    { description: 'Dígito incorreto', value: '08804737319', valid: false },
  ],
  documentation: `O RENAVAM tem 10 dígitos mais um verificador (módulo 11, pesos 3, 2, 9, 8, 7, 6, 5, 4, 3, 2). Códigos antigos de 9 dígitos são completados com zeros à esquerda. ${SYNTAX_NOTE}`,
  validate: validateRenavam,
});

// ---------- Placa ----------

const MERCOSUL_DIGIT_TO_LETTER = 'ABCDEFGHIJ';

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function validatePlate(input: string): ValidationOutcome {
  const plate = normalizePlate(input);
  if (/^[A-Z]{3}\d{4}$/.test(plate)) {
    const mercosul = `${plate.slice(0, 4)}${MERCOSUL_DIGIT_TO_LETTER[Number(plate[4])]}${plate.slice(5)}`;
    return {
      valid: true,
      message: 'Placa válida no padrão antigo (ABC-1234)',
      details: { type: 'padrão antigo', formatted: `${plate.slice(0, 3)}-${plate.slice(3)}`, equivalent: mercosul },
    };
  }
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(plate)) {
    const digit = MERCOSUL_DIGIT_TO_LETTER.indexOf(plate[4] as string);
    const details: Record<string, string> = { type: 'Mercosul', formatted: plate };
    if (digit >= 0) details.equivalent = `${plate.slice(0, 3)}-${plate[3]}${digit}${plate.slice(5)}`;
    return { valid: true, message: 'Placa válida no padrão Mercosul (ABC1D23)', details };
  }
  return { valid: false, message: 'Formato inválido. Use ABC-1234 (antigo) ou ABC1D23 (Mercosul)' };
}

export const plateTool = defineValidator({
  id: 'placa-veiculo',
  name: 'Validador de Placa de Veículo',
  description: 'Valida placas no padrão antigo (ABC-1234) e Mercosul (ABC1D23) e mostra a equivalência',
  keywords: ['placa', 'veículo', 'mercosul', 'carro', 'moto', 'validar'],
  icon: '🔖',
  label: 'Placa',
  placeholder: 'ABC1D23',
  detailLabels: { type: 'Padrão', formatted: 'Formatada', equivalent: 'Equivalente no outro padrão' },
  examples: [
    { description: 'Padrão antigo', value: 'ABC-1234', valid: true },
    { description: 'Mercosul', value: 'abc1d23', valid: true },
    { description: 'Formato inválido', value: 'AB-12345', valid: false },
  ],
  documentation:
    'Verifica apenas o formato da placa. A equivalência entre os padrões troca o segundo dígito numérico por uma letra (0=A, 1=B, ... 9=J) e vale somente para conversões de placas já existentes. Não consulta o Detran: uma placa com formato válido pode não estar emitida.',
  validate: validatePlate,
});

// ---------- CEP ----------

export function validateCEP(input: string): ValidationOutcome {
  const digits = onlyDigits(input);
  if (digits.length !== 8) return { valid: false, message: 'O CEP deve ter 8 dígitos' };
  if (/^0{8}$/.test(digits)) return { valid: false, message: 'CEP inválido: 00000-000 não existe' };
  return { valid: true, message: 'CEP com formato válido', details: { formatted: `${digits.slice(0, 5)}-${digits.slice(5)}` } };
}

export const cepTool = defineValidator({
  id: 'cep',
  name: 'Validador de CEP',
  description: 'Valida o formato do CEP e formata com hífen',
  keywords: ['cep', 'código postal', 'endereço', 'correios', 'validar'],
  icon: '📮',
  label: 'CEP',
  placeholder: '01310-100',
  detailLabels: { formatted: 'Formatado' },
  examples: [
    { description: 'CEP bem formatado', value: '01310-100', valid: true },
    { description: 'Poucos dígitos', value: '1310100', valid: false },
  ],
  documentation:
    'Confere se o CEP tem 8 dígitos e não é 00000-000. Não consulta os Correios, então não informa se o CEP existe nem a que endereço pertence, e esta ferramenta não inventa dados de localização.',
  validate: validateCEP,
});

// ---------- Telefone ----------

const VALID_DDD = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' ')
);

export function validatePhoneBR(input: string): ValidationOutcome {
  let digits = onlyDigits(input);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) {
    return { valid: false, message: 'O telefone deve ter DDD + 8 dígitos (fixo) ou DDD + 9 dígitos (celular)' };
  }
  const ddd = digits.slice(0, 2);
  if (!VALID_DDD.has(ddd)) return { valid: false, message: `DDD ${ddd} não existe` };
  const number = digits.slice(2);
  if (number.length === 9) {
    if (number[0] !== '9') return { valid: false, message: 'Celular com 9 dígitos deve começar com 9' };
    return {
      valid: true,
      message: 'Celular com formato válido',
      details: { type: 'celular', ddd, formatted: `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`, e164: `+55${digits}` },
    };
  }
  if (!/^[2-5]/.test(number)) return { valid: false, message: 'Telefone fixo deve começar com 2, 3, 4 ou 5' };
  return {
    valid: true,
    message: 'Telefone fixo com formato válido',
    details: { type: 'fixo', ddd, formatted: `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`, e164: `+55${digits}` },
  };
}

export const phoneTool = defineValidator({
  id: 'telefone',
  name: 'Validador de Telefone',
  description: 'Valida telefones brasileiros fixos e celulares, com DDD e prefixo +55 opcionais',
  keywords: ['telefone', 'celular', 'ddd', 'fone', 'whatsapp', 'validar', 'e164'],
  icon: '📱',
  label: 'Telefone',
  placeholder: '+55 (11) 91234-5678',
  detailLabels: { type: 'Tipo', ddd: 'DDD', formatted: 'Formatado', e164: 'Formato internacional (E.164)' },
  examples: [
    { description: 'Celular com DDD', value: '(11) 91234-5678', valid: true },
    { description: 'Fixo com +55', value: '+55 21 3456-7890', valid: true },
    { description: 'DDD inexistente', value: '(10) 91234-5678', valid: false },
  ],
  documentation:
    'Confere o DDD (lista dos DDDs em uso no Brasil), o tamanho e o primeiro dígito do número: celulares têm 9 dígitos começando com 9; fixos têm 8 dígitos começando de 2 a 5. Não verifica se a linha existe ou está ativa. Números de serviço (0800, 4004) não são tratados.',
  validate: validatePhoneBR,
});

// ---------- Chave Pix ----------

export function validatePixKey(input: string): ValidationOutcome {
  const key = input.trim();
  if (key === '') return { valid: false, message: 'Informe uma chave Pix' };

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return { valid: true, message: 'Chave aleatória (EVP) com formato válido', details: { type: 'aleatória' } };
  }
  if (key.includes('@')) {
    const email = validateEmail(key);
    if (!email.valid) return { valid: false, message: `Chave de e-mail inválida: ${email.message}` };
    if (key.length > 77) return { valid: false, message: 'Chave de e-mail inválida: o limite é 77 caracteres' };
    return { valid: true, message: 'Chave de e-mail com formato válido', details: { type: 'e-mail' } };
  }
  if (key.startsWith('+')) {
    if (!/^\+55\d{10,11}$/.test(key)) return { valid: false, message: 'Chave de telefone deve estar no formato +55DDNNNNNNNNN' };
    const phone = validatePhoneBR(key);
    return phone.valid
      ? { valid: true, message: 'Chave de telefone com formato válido', details: { type: 'telefone' } }
      : { valid: false, message: `Chave de telefone inválida: ${phone.message}` };
  }
  const digits = key.replace(/[.\-/]/g, '');
  if (/^\d{11}$/.test(digits)) {
    const cpf = validateCPF(digits);
    return cpf.valid
      ? { valid: true, message: 'Chave CPF válida', details: { type: 'CPF' } }
      : { valid: false, message: `Chave CPF inválida: ${cpf.message}` };
  }
  if (/^[0-9A-Za-z]{14}$/.test(digits)) {
    const cnpj = validateCNPJ(digits);
    return cnpj.valid
      ? { valid: true, message: 'Chave CNPJ válida', details: { type: 'CNPJ' } }
      : { valid: false, message: `Chave CNPJ inválida: ${cnpj.message}` };
  }
  return { valid: false, message: 'Formato não reconhecido. Use CPF, CNPJ, e-mail, telefone (+55...) ou chave aleatória' };
}

export const pixKeyTool = defineValidator({
  id: 'chave-pix',
  name: 'Validador de Chave Pix',
  description: 'Identifica o tipo da chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória) e valida o formato',
  keywords: ['pix', 'chave pix', 'cpf', 'cnpj', 'evp', 'validar', 'pagamento'],
  icon: '💠',
  label: 'Chave Pix',
  placeholder: '529.982.247-25, nome@exemplo.com, +5511912345678…',
  detailLabels: { type: 'Tipo da chave' },
  examples: [
    { description: 'CPF', value: '529.982.247-25', valid: true },
    { description: 'Telefone', value: '+5511912345678', valid: true },
    { description: 'Chave aleatória', value: '123e4567-e89b-42d3-a456-426614174000', valid: true },
    { description: 'CPF com dígito errado', value: '52998224726', valid: false },
  ],
  documentation:
    'Reconhece os cinco tipos de chave e aplica a validação de cada um (dígitos verificadores de CPF/CNPJ, sintaxe de e-mail, telefone com +55 e UUID). Não consulta o Banco Central: a chave pode ter formato válido e não estar cadastrada em nenhuma conta.',
  validate: validatePixKey,
});
