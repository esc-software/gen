import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { createRng, type Rng } from '@esc/gen-utils';
import {
  ADVERBIALS, CEP_RANGES, CITIES, COMPANY_NOUN, COMPANY_PREFIX, COMPANY_SUFFIX, COMPLEMENTS, FEMALE_NAMES, MALE_NAMES, NEIGHBORHOODS, NICK_PREFIX,
  NICK_SUFFIX, OBJECTS, STREET_NAMES, STREET_TYPES, SUBJECTS, SURNAMES, USER_ADJECTIVES, USER_NOUNS, VERBS, type CityInfo,
} from './br-data.js';
import { calculateCPFCheckDigits, formatCPF } from './cpf.js';
import { today } from './calc-daily.js';
import { removeDiacritics } from './slug.js';
import { computeCnsDefinitivo } from './validators-br.js';

const seedField = z.string().max(100).optional();
const seedHint = { label: 'Semente (opcional)', help: 'Com a mesma semente, a mesma lista é gerada de novo, útil para testes reproduzíveis. Deixe vazio para dados aleatórios.' };
const countField = (max = 100, def = 5) => z.number().int().min(1).max(max).default(def);

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

// ---------- nomes ----------

export type Sex = 'any' | 'female' | 'male';

export function resolveSex(rng: Rng, sex: Sex): 'female' | 'male' {
  return sex === 'any' ? (rng.chance(0.5) ? 'female' : 'male') : sex;
}

export function generateName(rng: Rng, sex: Sex = 'any', surnames = 2): { full: string; sex: 'female' | 'male'; given: string } {
  const s = resolveSex(rng, sex);
  const given = rng.pick(s === 'female' ? FEMALE_NAMES : MALE_NAMES);
  const used = new Set<string>();
  while (used.size < surnames) used.add(rng.pick(SURNAMES));
  return { full: [given, ...used].join(' '), sex: s, given };
}

export const randomNameTool = defineTool({
  id: 'nome-aleatorio',
  name: 'Gerador de Nomes Aleatórios',
  description: 'Gera nomes completos brasileiros fictícios, masculinos ou femininos',
  category: 'geradores',
  keywords: ['nome', 'nomes', 'aleatório', 'fictício', 'sobrenome', 'teste', 'gerador de nomes'],
  icon: '🧑',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: countField(200, 10),
    sex: z.enum(['any', 'female', 'male']).default('any'),
    surnames: z.number().int().min(1).max(3).default(2),
    seed: seedField,
  }),
  outputSchema: z.object({ names: z.array(z.string()) }),
  execute: ({ count, sex, surnames, seed }) => {
    const rng = createRng(seed);
    return { names: Array.from({ length: count }, () => generateName(rng, sex, surnames).full) };
  },
  fields: {
    count: { label: 'Quantidade' },
    sex: { label: 'Sexo', optionLabels: { any: 'Qualquer', female: 'Feminino', male: 'Masculino' } },
    surnames: { label: 'Sobrenomes' },
    seed: seedHint,
  },
  outputLabels: { names: 'Nomes' },
  downloads: [{ field: 'names', fileName: 'nomes.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Cinco nomes reproduzíveis', input: { count: 5, sex: 'any', surnames: 2, seed: 'exemplo' } }],
  documentation:
    'Combina nomes e sobrenomes comuns no Brasil a partir de listas curtas. Os nomes são fictícios: uma combinação pode coincidir com o nome de uma pessoa real por acaso. Use para testes, protótipos e dados de demonstração.',
});

// ---------- empresas ----------

export function generateCompanyName(rng: Rng): string {
  const shape = rng.int(3);
  const prefix = rng.pick(COMPANY_PREFIX);
  const noun = rng.pick(COMPANY_NOUN);
  const suffix = rng.pick(COMPANY_SUFFIX);
  if (shape === 0) return `${prefix} ${noun} ${suffix}`;
  if (shape === 1) return `${prefix}${rng.pick(COMPANY_PREFIX).toLowerCase()} ${noun} ${suffix}`;
  return `${noun} ${prefix} ${suffix}`;
}

export const companyNameTool = defineTool({
  id: 'nome-fantasia',
  name: 'Gerador de Nome Fantasia',
  description: 'Gera nomes de empresas fictícios para projetos, protótipos e dados de teste',
  category: 'geradores',
  keywords: ['nome fantasia', 'empresa', 'razão social', 'nome de empresa', 'negócio', 'startup', 'marca'],
  icon: '🏢',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 10), seed: seedField }),
  outputSchema: z.object({ names: z.array(z.string()) }),
  execute: ({ count, seed }) => {
    const rng = createRng(seed);
    return { names: Array.from({ length: count }, () => generateCompanyName(rng)) };
  },
  fields: { count: { label: 'Quantidade' }, seed: seedHint },
  outputLabels: { names: 'Nomes' },
  examples: [{ description: 'Sugestões reproduzíveis', input: { count: 5, seed: 'loja' } }],
  documentation:
    'Combina palavras comuns de nomes empresariais. Os nomes são fictícios, mas podem coincidir com empresas existentes; antes de usar um nome de verdade, pesquise o registro da marca no INPI e a disponibilidade do domínio e da razão social.',
});

// ---------- e-mails e usernames ----------

const EMAIL_DOMAINS = ['exemplo.test', 'exemplo.example', 'teste.invalid'] as const;

export function generateEmail(rng: Rng, name?: string): string {
  const base = removeDiacritics(name ?? generateName(rng).full).toLowerCase().split(/\s+/).filter(Boolean);
  const first = base[0] ?? 'usuario';
  const last = base[base.length - 1] ?? 'teste';
  const style = rng.int(4);
  const local = style === 0 ? `${first}.${last}` : style === 1 ? `${first}${last}` : style === 2 ? `${first}_${last}${rng.between(1, 99)}` : `${first[0]}${last}${rng.between(10, 999)}`;
  return `${local}@${rng.pick(EMAIL_DOMAINS)}`;
}

export const fakeEmailTool = defineTool({
  id: 'email-ficticio',
  name: 'Gerador de E-mails Fictícios',
  description: 'Gera endereços de e-mail fictícios em domínios reservados para testes, que nunca recebem mensagens reais',
  category: 'geradores',
  keywords: ['email', 'e-mail', 'fictício', 'teste', 'falso', 'descartável', 'gerador de email'],
  icon: '📧',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(200, 10), seed: seedField }),
  outputSchema: z.object({ emails: z.array(z.string()) }),
  execute: ({ count, seed }) => {
    const rng = createRng(seed);
    return { emails: Array.from({ length: count }, () => generateEmail(rng)) };
  },
  fields: { count: { label: 'Quantidade' }, seed: seedHint },
  outputLabels: { emails: 'E-mails' },
  downloads: [{ field: 'emails', fileName: 'emails.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Cinco e-mails reproduzíveis', input: { count: 5, seed: 'teste' } }],
  documentation:
    'Os domínios usados (.test, .example e .invalid) são reservados pela IETF (RFC 2606) e não existem na internet, então esses endereços nunca entregam mensagens a uma pessoa real. Têm sintaxe válida, mas nenhuma caixa de entrada: servem para testar formulários e cadastros.',
});

export function generateUsername(rng: Rng, style: 'snake' | 'dot' | 'camel' | 'plain', withNumber: boolean, maxLength: number): string {
  const a = rng.pick(USER_ADJECTIVES);
  const n = rng.pick(USER_NOUNS);
  const num = withNumber ? String(rng.between(1, 9999)) : '';
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const joined = { snake: `${a}_${n}`, dot: `${a}.${n}`, camel: `${a}${cap(n)}`, plain: `${a}${n}` }[style];
  const base = joined.slice(0, Math.max(1, maxLength - num.length));
  return `${base}${num}`;
}

export const usernameTool = defineTool({
  id: 'username',
  name: 'Gerador de Username',
  description: 'Sugere nomes de usuário criativos combinando adjetivos e substantivos',
  category: 'geradores',
  keywords: ['username', 'nome de usuário', 'usuário', 'login', 'apelido', 'perfil', 'redes sociais'],
  icon: '👤',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: countField(100, 10),
    style: z.enum(['snake', 'dot', 'camel', 'plain']).default('snake'),
    withNumber: z.boolean().default(true),
    maxLength: z.number().int().min(6).max(40).default(20),
    seed: seedField,
  }),
  outputSchema: z.object({ usernames: z.array(z.string()) }),
  execute: ({ count, style, withNumber, maxLength, seed }) => {
    const rng = createRng(seed);
    return { usernames: Array.from({ length: count }, () => generateUsername(rng, style, withNumber, maxLength)) };
  },
  fields: {
    count: { label: 'Quantidade' },
    style: { label: 'Estilo', optionLabels: { snake: 'sublinhado (rapido_gato)', dot: 'ponto (rapido.gato)', camel: 'camelCase (rapidoGato)', plain: 'junto (rapidogato)' } },
    withNumber: { label: 'Terminar com número' },
    maxLength: { label: 'Tamanho máximo' },
    seed: seedHint,
  },
  outputLabels: { usernames: 'Usernames' },
  examples: [{ description: 'Dez sugestões reproduzíveis', input: { count: 10, style: 'snake', withNumber: true, maxLength: 20, seed: 'perfil' } }],
  documentation:
    'Gera sugestões sem acentos. Disponibilidade em cada rede social não é verificada: confirme no serviço desejado.',
});

// ---------- frases ----------

export function generateSentence(rng: Rng): string {
  return `${rng.pick(SUBJECTS)} ${rng.pick(VERBS)} ${rng.pick(OBJECTS)} ${rng.pick(ADVERBIALS)}.`;
}

export const randomSentenceTool = defineTool({
  id: 'frase-aleatoria',
  name: 'Gerador de Frases Aleatórias',
  description: 'Gera frases curtas em português, com sentido e gramática corretos, para testes e preenchimento',
  category: 'geradores',
  keywords: ['frase', 'frases', 'texto aleatório', 'sentença', 'preenchimento', 'teste', 'exemplo'],
  icon: '💬',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 5), seed: seedField }),
  outputSchema: z.object({ sentences: z.array(z.string()) }),
  execute: ({ count, seed }) => {
    const rng = createRng(seed);
    return { sentences: Array.from({ length: count }, () => generateSentence(rng)) };
  },
  fields: { count: { label: 'Quantidade' }, seed: seedHint },
  outputLabels: { sentences: 'Frases' },
  examples: [{ description: 'Três frases reproduzíveis', input: { count: 3, seed: 'frase' } }],
  documentation:
    'Monta frases a partir de listas de sujeitos, verbos, complementos e circunstâncias que concordam entre si (sempre na terceira pessoa do singular). Para texto de preenchimento mais longo, use o gerador de Lorem Ipsum.',
});

// ---------- nick para jogos ----------

const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' };

export function generateNick(rng: Rng, style: 'clean' | 'leet' | 'xx' | 'underscore'): string {
  const pre = rng.pick(NICK_PREFIX);
  const suf = rng.pick(NICK_SUFFIX);
  const num = rng.chance(0.5) ? String(rng.between(1, 99)) : '';
  if (style === 'leet') return `${pre}${suf}`.replace(/[aeiost]/gi, (c) => (rng.chance(0.6) ? (LEET[c.toLowerCase()] as string) : c)) + num;
  if (style === 'xx') return `xX_${pre}${suf}_Xx`;
  if (style === 'underscore') return `${pre}_${suf}${num}`;
  return `${pre}${suf}${num}`;
}

export const gameNickTool = defineTool({
  id: 'nick-jogos',
  name: 'Gerador de Nick para Jogos',
  description: 'Cria nicknames para jogos online em estilos limpo, leet, com “xX” ou com sublinhado',
  category: 'geradores',
  keywords: ['nick', 'nickname', 'gamer', 'jogos', 'gamertag', 'apelido', 'free fire', 'valorant', 'nome de jogador'],
  icon: '🎮',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: countField(100, 10),
    style: z.enum(['clean', 'leet', 'xx', 'underscore']).default('clean'),
    seed: seedField,
  }),
  outputSchema: z.object({ nicks: z.array(z.string()) }),
  execute: ({ count, style, seed }) => {
    const rng = createRng(seed);
    return { nicks: Array.from({ length: count }, () => generateNick(rng, style)) };
  },
  fields: {
    count: { label: 'Quantidade' },
    style: { label: 'Estilo', optionLabels: { clean: 'Limpo (DarkWolf42)', leet: 'Leet (D4rkW0lf)', xx: 'Com xX (xX_DarkWolf_Xx)', underscore: 'Com sublinhado (Dark_Wolf)' } },
    seed: seedHint,
  },
  outputLabels: { nicks: 'Nicks' },
  examples: [{ description: 'Dez nicks reproduzíveis', input: { count: 10, style: 'clean', seed: 'game' } }],
  documentation:
    'Combina prefixos e sufixos comuns do universo gamer. Disponibilidade e limites de caracteres variam por jogo, e alguns não aceitam símbolos; verifique no jogo.',
});

// ---------- endereço, CEP e pessoa ----------

export interface FakeAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
}

export function generateCep(rng: Rng, uf: string): string {
  const ranges = CEP_RANGES[uf];
  if (!ranges) throw new ToolError(`UF desconhecida: ${uf}`);
  const range = rng.pick(ranges);
  const prefix = rng.between(range[0], range[1]);
  return `${pad(prefix, 5)}-${rng.digits(3)}`;
}

export function generateAddress(rng: Rng, uf?: string): FakeAddress & { cityInfo: CityInfo } {
  const pool = uf ? CITIES.filter((c) => c.uf === uf) : CITIES;
  if (pool.length === 0) throw new ToolError(`UF desconhecida: ${uf}`);
  const cityInfo = rng.pick(pool);
  const address: FakeAddress = {
    street: `${rng.pick(STREET_TYPES)} ${rng.pick(STREET_NAMES)}`,
    number: String(rng.between(1, 3999)),
    neighborhood: rng.pick(NEIGHBORHOODS),
    city: cityInfo.city,
    uf: cityInfo.uf,
    cep: generateCep(rng, cityInfo.uf),
  };
  if (rng.chance(0.3)) address.complement = rng.pick(COMPLEMENTS);
  return { ...address, cityInfo };
}

export const AMBIGUITY_NOTE =
  'Endereço de demonstração: o CEP tem formato válido e pertence à faixa do estado, mas a combinação rua, número e CEP é inventada e não corresponde a um endereço verificado.';

const UFS = Object.keys(CEP_RANGES) as [string, ...string[]];

export const fakeAddressTool = defineTool({
  id: 'endereco-ficticio',
  name: 'Gerador de CEP e Endereço Fictício',
  description: 'Gera endereços brasileiros sintéticos com CEP na faixa do estado, para testes de formulários',
  category: 'geradores',
  keywords: ['endereço', 'cep', 'rua', 'cidade', 'estado', 'fictício', 'teste', 'formulário', 'logradouro'],
  icon: '📍',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 5), uf: z.enum(['any', ...UFS]).default('any'), seed: seedField }),
  outputSchema: z.object({ addresses: z.array(z.string()), note: z.string() }),
  execute: ({ count, uf, seed }) => {
    const rng = createRng(seed);
    return {
      addresses: Array.from({ length: count }, () => {
        const a = generateAddress(rng, uf === 'any' ? undefined : uf);
        return `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ''} — ${a.neighborhood}, ${a.city}/${a.uf} — CEP ${a.cep}`;
      }),
      note: AMBIGUITY_NOTE,
    };
  },
  fields: {
    count: { label: 'Quantidade' },
    uf: { label: 'Estado (UF)', optionLabels: { any: 'Qualquer', ...Object.fromEntries(UFS.map((u) => [u, u])) } },
    seed: seedHint,
  },
  outputLabels: { addresses: 'Endereços', note: 'Importante' },
  downloads: [{ field: 'addresses', fileName: 'enderecos.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Endereços de São Paulo', input: { count: 3, uf: 'SP', seed: 'sp' } }],
  documentation: `${AMBIGUITY_NOTE} Para endereços reais, consulte os Correios ou um serviço de CEP; esta ferramenta não consulta nenhuma base e não inventa dados de localização de forma apresentada como verdadeira.`,
});

const SEX_LABEL = { female: 'Feminino', male: 'Masculino' } as const;

export interface FakePerson {
  nome: string;
  sexo: string;
  nascimento: string;
  idade: number;
  cpf: string;
  rg: string;
  email: string;
  telefone: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
}

/** DV do RG no modelo de São Paulo: módulo 11 com pesos 2 a 9 ("X" quando o resto é 10). */
export function rgCheckDigit(base8: string): string {
  const sum = [...base8].reduce((a, d, i) => a + Number(d) * (i + 2), 0);
  const dv = 11 - (sum % 11);
  return dv === 10 ? 'X' : dv === 11 ? '0' : String(dv);
}

export function generateRg(rng: Rng): string {
  const base = String(rng.between(10_000_000, 99_999_999));
  return `${base.slice(0, 2)}.${base.slice(2, 5)}.${base.slice(5, 8)}-${rgCheckDigit(base)}`;
}

function syntheticCpf(rng: Rng): string {
  let base: string;
  do base = rng.digits(9);
  while (/^(\d)\1{8}$/.test(base));
  const { first, second } = calculateCPFCheckDigits(base);
  return formatCPF(`${base}${first}${second}`);
}

export function generatePerson(rng: Rng, opts: { sex: Sex; minAge: number; maxAge: number; uf?: string | undefined; referenceDate?: { year: number; month: number; day: number } }): FakePerson {
  const ref = opts.referenceDate ?? today();
  const name = generateName(rng, opts.sex);
  const age = rng.between(opts.minAge, opts.maxAge);
  const birthYear = ref.year - age - (rng.chance(0.5) ? 1 : 0);
  const month = rng.between(1, 12);
  const day = rng.between(1, new Date(Date.UTC(birthYear, month, 0)).getUTCDate());
  // A idade exibida considera o aniversário em relação à data de referência.
  const hadBirthday = month < ref.month || (month === ref.month && day <= ref.day);
  const realAge = ref.year - birthYear - (hadBirthday ? 0 : 1);
  const a = generateAddress(rng, opts.uf);
  return {
    nome: name.full,
    sexo: SEX_LABEL[name.sex],
    nascimento: `${pad(day)}/${pad(month)}/${birthYear}`,
    idade: realAge,
    cpf: syntheticCpf(rng),
    rg: generateRg(rng),
    email: generateEmail(rng, name.full),
    telefone: `(${a.cityInfo.ddd}) 9${rng.digits(4)}-${rng.digits(4)}`,
    endereco: `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ''} — ${a.neighborhood}`,
    cep: a.cep,
    cidade: a.city,
    uf: a.uf,
  };
}

const PERSON_NOTE =
  'Dados sintéticos para testes: o CPF tem dígitos verificadores corretos mas não pertence a ninguém; o RG segue o modelo de São Paulo e não é um documento emitido; e-mails usam domínios reservados; o endereço é de demonstração; o telefone é aleatório e pode coincidir com uma linha real.';

export const fakePersonTool = defineTool({
  id: 'pessoa-ficticia',
  name: 'Gerador de Pessoa Fictícia',
  description: 'Gera pessoas fictícias completas (nome, CPF, RG, nascimento, e-mail, telefone e endereço) para testar sistemas',
  category: 'geradores',
  keywords: ['pessoa', 'fictícia', 'cadastro', 'dados de teste', 'cpf', 'rg', 'endereço', 'perfil', 'mock', 'fake'],
  icon: '🧾',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: countField(50, 3),
    sex: z.enum(['any', 'female', 'male']).default('any'),
    minAge: z.number().int().min(0).max(110).default(18),
    maxAge: z.number().int().min(0).max(110).default(65),
    uf: z.enum(['any', ...UFS]).default('any'),
    seed: seedField,
    referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  outputSchema: z.object({ people: z.string(), json: z.string(), note: z.string() }),
  execute: ({ count, sex, minAge, maxAge, uf, seed, referenceDate }) => {
    if (maxAge < minAge) throw new ToolError('A idade máxima deve ser maior ou igual à mínima');
    const rng = createRng(seed);
    const ref = referenceDate ? { year: Number(referenceDate.slice(0, 4)), month: Number(referenceDate.slice(5, 7)), day: Number(referenceDate.slice(8, 10)) } : undefined;
    const list = Array.from({ length: count }, () => generatePerson(rng, { sex, minAge, maxAge, uf: uf === 'any' ? undefined : uf, ...(ref ? { referenceDate: ref } : {}) }));
    const text = list
      .map((p) => `${p.nome} (${p.sexo}, ${p.idade} anos)\nNascimento: ${p.nascimento}\nCPF: ${p.cpf}\nRG: ${p.rg}\nE-mail: ${p.email}\nTelefone: ${p.telefone}\nEndereço: ${p.endereco}, ${p.cidade}/${p.uf}, CEP ${p.cep}`)
      .join('\n\n');
    return { people: text, json: JSON.stringify(list, null, 2), note: PERSON_NOTE };
  },
  fields: {
    count: { label: 'Quantidade' },
    sex: { label: 'Sexo', optionLabels: { any: 'Qualquer', female: 'Feminino', male: 'Masculino' } },
    minAge: { label: 'Idade mínima' },
    maxAge: { label: 'Idade máxima' },
    uf: { label: 'Estado (UF)', optionLabels: { any: 'Qualquer', ...Object.fromEntries(UFS.map((u) => [u, u])) } },
    seed: seedHint,
    referenceDate: { label: 'Data de referência da idade (opcional)', placeholder: '2026-01-01', help: 'Padrão: hoje. Fixe uma data para resultados idênticos ao longo do tempo.' },
  },
  outputLabels: { people: 'Pessoas', json: 'JSON', note: 'Importante' },
  downloads: [{ field: 'json', fileName: 'pessoas.json', mimeType: 'application/json', label: 'Baixar .json' }],
  examples: [{ description: 'Duas pessoas reproduzíveis', input: { count: 2, sex: 'any', minAge: 18, maxAge: 65, uf: 'any', seed: 'demo', referenceDate: '2026-01-01' } }],
  documentation: `${PERSON_NOTE} Não use estes dados em cadastros reais nem para se passar por alguém.`,
});

// ---------- inscrição estadual ----------

const weightedSum = (digits: string, weights: number[]) => [...digits].reduce((a, d, i) => a + Number(d) * (weights[i] as number), 0);
const mod11Dv = (sum: number) => {
  const rest = sum % 11;
  return rest <= 1 ? 0 : 11 - rest;
};

interface StateIe {
  name: string;
  length: number;
  /** Completa uma base (sem dígitos verificadores) com os DVs. */
  complete: (base: string) => string;
  baseLength: number;
  mask: (digits: string) => string;
}

const sp: StateIe = {
  name: 'São Paulo', length: 12, baseLength: 10,
  complete: (b) => {
    // b tem 10 dígitos: 8 + (posição do DV1 vazia) + 2. Recebemos 8 + 2 e montamos.
    const first8 = b.slice(0, 8);
    const mid = b.slice(8, 10);
    const dv1 = weightedSum(first8, [1, 3, 4, 5, 6, 7, 8, 10]) % 11 % 10;
    const eleven = `${first8}${dv1}${mid}`;
    const dv2 = weightedSum(eleven, [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2]) % 11 % 10;
    return `${eleven}${dv2}`;
  },
  mask: (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}.${d.slice(9, 12)}`,
};

const rj: StateIe = {
  name: 'Rio de Janeiro', length: 8, baseLength: 7,
  complete: (b) => `${b}${mod11Dv(weightedSum(b, [2, 7, 6, 5, 4, 3, 2]))}`,
  mask: (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 7)}-${d.slice(7, 8)}`,
};

const pr: StateIe = {
  name: 'Paraná', length: 10, baseLength: 8,
  complete: (b) => {
    const d1 = mod11Dv(weightedSum(b, [3, 2, 7, 6, 5, 4, 3, 2]));
    const d2 = mod11Dv(weightedSum(`${b}${d1}`, [4, 3, 2, 7, 6, 5, 4, 3, 2]));
    return `${b}${d1}${d2}`;
  },
  mask: (d) => `${d.slice(0, 3)}.${d.slice(3, 8)}-${d.slice(8, 10)}`,
};

const sc: StateIe = {
  name: 'Santa Catarina', length: 9, baseLength: 8,
  complete: (b) => `${b}${mod11Dv(weightedSum(b, [9, 8, 7, 6, 5, 4, 3, 2]))}`,
  mask: (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}`,
};

const mg: StateIe = {
  name: 'Minas Gerais', length: 13, baseLength: 11,
  complete: (b) => {
    // Insere "0" depois do 3º dígito, multiplica por 1,2,1,2... e soma os algarismos dos produtos.
    const spread = `${b.slice(0, 3)}0${b.slice(3)}`;
    const sum = [...spread].reduce((a, d, i) => {
      const product = Number(d) * (i % 2 === 0 ? 1 : 2);
      return a + Math.floor(product / 10) + (product % 10);
    }, 0);
    const d1 = (Math.ceil(sum / 10) * 10 - sum) % 10;
    const d2 = mod11Dv(weightedSum(`${b}${d1}`, [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
    return `${b}${d1}${d2}`;
  },
  mask: (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}/${d.slice(9, 13)}`,
};

export const IE_STATES: Record<string, StateIe> = { SP: sp, RJ: rj, PR: pr, SC: sc, MG: mg };
const IE_UFS = Object.keys(IE_STATES) as [string, ...string[]];

export function generateIe(rng: Rng, uf: string): string {
  const state = IE_STATES[uf];
  if (!state) throw new ToolError(`Estado sem algoritmo cadastrado: ${uf}. Disponíveis: ${IE_UFS.join(', ')}`);
  return state.complete(rng.digits(state.baseLength));
}

export function validateIe(uf: string, input: string): { valid: boolean; message: string; formatted?: string } {
  const state = IE_STATES[uf];
  if (!state) return { valid: false, message: `Estado sem algoritmo cadastrado: ${uf}. Disponíveis: ${IE_UFS.join(', ')}` };
  const digits = input.replace(/[.\-/\s]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, message: 'A inscrição estadual deve conter apenas números' };
  if (digits.length !== state.length) return { valid: false, message: `A inscrição estadual de ${uf} tem ${state.length} dígitos` };
  const base = uf === 'SP' ? `${digits.slice(0, 8)}${digits.slice(9, 11)}` : digits.slice(0, state.baseLength);
  if (state.complete(base) !== digits) return { valid: false, message: 'Dígito verificador incorreto' };
  return { valid: true, message: `Inscrição estadual de ${state.name} com formato e dígitos verificadores válidos`, formatted: state.mask(digits) };
}

export const stateRegistrationTool = defineTool({
  id: 'inscricao-estadual',
  name: 'Gerador e Validador de Inscrição Estadual',
  description: 'Gera e valida inscrições estaduais sintéticas para SP, RJ, MG, PR e SC pelos dígitos verificadores',
  category: 'geradores',
  keywords: ['inscrição estadual', 'ie', 'icms', 'sefaz', 'contribuinte', 'validar', 'gerar', 'estado'],
  icon: '🏭',
  modes: ['browser', 'node'],
  inputSchema: z
    .object({
      action: z.enum(['generate', 'validate']).default('generate'),
      uf: z.enum(IE_UFS).default('SP'),
      value: z.string().max(30).optional(),
    })
    .refine((v) => v.action === 'generate' || (v.value ?? '').trim() !== '', { path: ['value'], message: 'Informe a inscrição estadual' }),
  outputSchema: z.object({ ie: z.string(), valid: z.boolean(), message: z.string() }),
  execute: ({ action, uf, value }) => {
    if (action === 'generate') {
      const digits = generateIe(createRng(), uf);
      return { ie: (IE_STATES[uf] as StateIe).mask(digits), valid: true, message: `Inscrição estadual sintética de ${(IE_STATES[uf] as StateIe).name}. Não pertence a nenhum contribuinte.` };
    }
    const r = validateIe(uf, (value ?? '').trim());
    return { ie: r.formatted ?? (value ?? '').trim(), valid: r.valid, message: r.message };
  },
  fields: {
    action: { label: 'Ação', optionLabels: { generate: 'Gerar', validate: 'Validar' } },
    uf: { label: 'Estado', optionLabels: Object.fromEntries(IE_UFS.map((u) => [u, `${u} — ${(IE_STATES[u] as StateIe).name}`])) },
    value: { label: 'Inscrição estadual', placeholder: '110.042.490.114', help: 'Usado em Validar.' },
  },
  outputLabels: { ie: 'Inscrição estadual', valid: 'Válida', message: 'Mensagem' },
  examples: [
    { description: 'IE de São Paulo válida', input: { action: 'validate', uf: 'SP', value: '110.042.490.114' }, output: { valid: true, ie: '110.042.490.114' } },
    { description: 'IE do Rio de Janeiro válida', input: { action: 'validate', uf: 'RJ', value: '99.999.99-3' }, output: { valid: true } },
    { description: 'IE de Minas Gerais válida', input: { action: 'validate', uf: 'MG', value: '062.307.904/0081' }, output: { valid: true } },
    { description: 'IE do Paraná válida', input: { action: 'validate', uf: 'PR', value: '123.45678-50' }, output: { valid: true } },
    { description: 'IE de Santa Catarina válida', input: { action: 'validate', uf: 'SC', value: '251.040.852' }, output: { valid: true } },
    { description: 'Dígito errado', input: { action: 'validate', uf: 'SP', value: '110.042.490.115' }, output: { valid: false } },
  ],
  documentation:
    'Cada estado tem seu próprio formato e algoritmo de dígitos verificadores (não existe regra nacional). Estão implementados os de SP, RJ, MG, PR e SC, conferidos com exemplos publicados; os demais estados serão acrescentados quando houver especificação conferida. O validador confere só a sintaxe e não consulta a Sefaz: não informa se a inscrição existe ou está ativa. Para inscrições com formatos especiais (produtor rural, substituto tributário), consulte a Sefaz do estado.',
});

// ---------- placa de veículo ----------

const PLATE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generatePlate(rng: Rng, kind: 'mercosul' | 'old'): string {
  const letters = Array.from({ length: 3 }, () => PLATE_LETTERS[rng.int(26)]).join('');
  if (kind === 'old') return `${letters}-${rng.digits(4)}`;
  return `${letters}${rng.int(10)}${PLATE_LETTERS[rng.int(26)]}${rng.digits(2)}`;
}

export const plateGeneratorTool = defineTool({
  id: 'gerador-placa',
  name: 'Gerador de Placa de Veículo para Testes',
  description: 'Gera placas no padrão Mercosul (ABC1D23) e no padrão antigo (ABC-1234) apenas para testes',
  category: 'geradores',
  keywords: ['placa', 'veículo', 'mercosul', 'carro', 'teste', 'gerar', 'abc1d23'],
  icon: '🚗',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 5), kind: z.enum(['mercosul', 'old']).default('mercosul'), seed: seedField }),
  outputSchema: z.object({ plates: z.array(z.string()), note: z.string() }),
  execute: ({ count, kind, seed }) => {
    const rng = createRng(seed);
    return {
      plates: Array.from({ length: count }, () => generatePlate(rng, kind)),
      note: 'Placas aleatórias com formato válido, sem relação com veículos reais; podem coincidir com placas emitidas por acaso.',
    };
  },
  fields: { count: { label: 'Quantidade' }, kind: { label: 'Padrão', optionLabels: { mercosul: 'Mercosul (ABC1D23)', old: 'Antigo (ABC-1234)' } }, seed: seedHint },
  outputLabels: { plates: 'Placas', note: 'Importante' },
  examples: [{ description: 'Cinco placas Mercosul', input: { count: 5, kind: 'mercosul', seed: 'placas' } }],
  documentation:
    'As placas só respeitam o formato. A atribuição real de letras por estado e faixa de emplacamento não é considerada. Não use para se passar por um veículo.',
});

// ---------- CNS ----------

export function generateCns(rng: Rng, kind: 'definitive' | 'provisional'): string {
  if (kind === 'definitive') return computeCnsDefinitivo(`${rng.between(1, 2)}${rng.digits(10)}`);
  for (;;) {
    const head = `${rng.between(7, 9)}${rng.digits(13)}`;
    const sum = [...head].reduce((a, d, i) => a + Number(d) * (15 - i), 0);
    const last = (11 - (sum % 11)) % 11;
    if (last <= 9) return `${head}${last}`;
  }
}

export const cnsGeneratorTool = defineTool({
  id: 'gerador-cns',
  name: 'Gerador de CNS (Cartão Nacional de Saúde)',
  description: 'Gera números de CNS sintéticos, definitivos ou provisórios, com dígitos verificadores corretos',
  category: 'geradores',
  keywords: ['cns', 'cartão sus', 'cartão nacional de saúde', 'gerar', 'teste', 'saúde', 'sus'],
  icon: '🏥',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 5), kind: z.enum(['definitive', 'provisional']).default('definitive'), seed: seedField }),
  outputSchema: z.object({ numbers: z.array(z.string()), note: z.string() }),
  execute: ({ count, kind, seed }) => {
    const rng = createRng(seed);
    return {
      numbers: Array.from({ length: count }, () => {
        const n = generateCns(rng, kind);
        return `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7, 11)} ${n.slice(11)}`;
      }),
      note: 'Números sintéticos com dígito verificador correto; não pertencem a ninguém e não existem na base do SUS.',
    };
  },
  fields: {
    count: { label: 'Quantidade' },
    kind: { label: 'Tipo', optionLabels: { definitive: 'Definitivo (começa com 1 ou 2)', provisional: 'Provisório (começa com 7, 8 ou 9)' } },
    seed: seedHint,
  },
  outputLabels: { numbers: 'Números', note: 'Importante' },
  examples: [{ description: 'Cinco CNS definitivos', input: { count: 5, kind: 'definitive', seed: 'cns' } }],
  documentation:
    'O CNS definitivo deriva do PIS do titular com o sufixo e o dígito verificador calculados pelo algoritmo oficial; o provisório tem soma ponderada divisível por 11. Valide-os com o validador de CNS.',
});

// ---------- números aleatórios e sorteio ----------

export const randomNumberTool = defineTool({
  id: 'numero-aleatorio',
  name: 'Gerador de Números Aleatórios',
  description: 'Sorteia números inteiros ou decimais em um intervalo, com ou sem repetição',
  category: 'geradores',
  keywords: ['número aleatório', 'sorteio', 'random', 'intervalo', 'dado', 'loteria', 'sorteador de números'],
  icon: '🎲',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    min: z.number().finite().min(-1e12).max(1e12).default(1),
    max: z.number().finite().min(-1e12).max(1e12).default(60),
    count: z.number().int().min(1).max(10_000).default(6),
    unique: z.boolean().default(true),
    sorted: z.boolean().default(true),
    decimals: z.number().int().min(0).max(6).default(0),
    seed: seedField,
  }),
  outputSchema: z.object({ numbers: z.array(z.string()), sum: z.number() }),
  execute: ({ min, max, count, unique, sorted, decimals, seed }) => {
    if (max < min) throw new ToolError('O máximo deve ser maior ou igual ao mínimo');
    const rng = createRng(seed);
    const scale = 10 ** decimals;
    const lo = Math.ceil(min * scale);
    const hi = Math.floor(max * scale);
    if (hi < lo) throw new ToolError('Não há valores possíveis nesse intervalo com essa precisão');
    const span = hi - lo + 1;
    if (span > 2 ** 32) throw new ToolError('Intervalo grande demais para a precisão pedida');
    if (unique && count > span) throw new ToolError(`Só existem ${span} valores possíveis; não é possível sortear ${count} sem repetir`);
    const picks: number[] = [];
    if (unique) {
      const seen = new Set<number>();
      while (picks.length < count) {
        const n = lo + rng.int(span);
        if (!seen.has(n)) {
          seen.add(n);
          picks.push(n);
        }
      }
    } else for (let i = 0; i < count; i++) picks.push(lo + rng.int(span));
    if (sorted) picks.sort((a, b) => a - b);
    const values = picks.map((n) => n / scale);
    return { numbers: values.map((v) => v.toFixed(decimals)), sum: Math.round(values.reduce((a, b) => a + b, 0) * scale) / scale };
  },
  fields: {
    min: { label: 'Mínimo' }, max: { label: 'Máximo' }, count: { label: 'Quantos números' },
    unique: { label: 'Sem repetição' }, sorted: { label: 'Ordenar do menor para o maior' },
    decimals: { label: 'Casas decimais', help: '0 para números inteiros.' }, seed: seedHint,
  },
  outputLabels: { numbers: 'Números sorteados', sum: 'Soma' },
  examples: [{ description: 'Seis números de 1 a 60 (como na Mega-Sena)', input: { min: 1, max: 60, count: 6, unique: true, sorted: true, decimals: 0, seed: 'loto' } }],
  documentation:
    'Sem semente, usa o gerador criptograficamente seguro do sistema e cada intervalo é sorteado sem viés. Com semente, o resultado é reproduzível (útil para testes). O sorteio é local e não tem relação com loterias oficiais.',
});

export const raffleTool = defineTool({
  id: 'sorteador',
  name: 'Sorteador Online',
  description: 'Sorteia vencedores de uma lista de nomes ou embaralha a ordem, com aleatoriedade segura',
  category: 'geradores',
  keywords: ['sorteio', 'sorteador', 'sortear', 'nomes', 'lista', 'vencedor', 'amigo secreto', 'embaralhar', 'ordem'],
  icon: '🎰',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    items: z.string().max(100_000).default(''),
    mode: z.enum(['winners', 'order']).default('winners'),
    winners: z.number().int().min(1).max(1000).default(1),
    removeDuplicates: z.boolean().default(true),
  }),
  outputSchema: z.object({ result: z.array(z.string()), total: z.number(), drawnAt: z.string() }),
  execute: ({ items, mode, winners, removeDuplicates }) => {
    let list = items.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
    if (removeDuplicates) list = [...new Set(list)];
    if (list.length === 0) throw new ToolError('Informe ao menos um item, um por linha');
    const rng = createRng();
    const shuffled = rng.shuffle(list);
    if (mode === 'order') return { result: shuffled.map((x, i) => `${i + 1}. ${x}`), total: list.length, drawnAt: new Date().toISOString() };
    if (winners > list.length) throw new ToolError(`Há só ${list.length} item(ns); não é possível sortear ${winners}`);
    return { result: shuffled.slice(0, winners).map((x, i) => `${i + 1}º: ${x}`), total: list.length, drawnAt: new Date().toISOString() };
  },
  fields: {
    items: { label: 'Lista (um item por linha)', multiline: true, placeholder: 'Ana\nBruno\nCarla' },
    mode: { label: 'O que fazer', optionLabels: { winners: 'Sortear vencedores', order: 'Embaralhar a ordem' } },
    winners: { label: 'Quantidade de vencedores' },
    removeDuplicates: { label: 'Ignorar linhas repetidas' },
  },
  outputLabels: { result: 'Resultado', total: 'Total de itens na lista', drawnAt: 'Sorteado em (UTC)' },
  examples: [{ description: 'Um vencedor entre três', input: { items: 'Ana\nBruno\nCarla', mode: 'winners', winners: 1, removeDuplicates: true } }],
  documentation:
    'Cada item tem a mesma chance e ninguém é sorteado duas vezes. Usa o gerador criptograficamente seguro do sistema, no seu próprio dispositivo, e nada é enviado a servidores. Para sorteios com valor legal ou promocional, verifique a legislação aplicável (autorização prévia quando exigida) e registre o resultado.',
});

// ---------- RG demonstrativo ----------

export const fakeRgTool = defineTool({
  id: 'rg',
  name: 'Gerador de RG Demonstrativo',
  description: 'Gera números de RG sintéticos no modelo de São Paulo, apenas para testar formulários',
  category: 'geradores',
  keywords: ['rg', 'registro geral', 'identidade', 'documento', 'fictício', 'teste', 'gerar'],
  icon: '🪪',
  modes: ['browser', 'node'],
  inputSchema: z.object({ count: countField(100, 5), seed: seedField }),
  outputSchema: z.object({ numbers: z.array(z.string()), note: z.string() }),
  execute: ({ count, seed }) => {
    const rng = createRng(seed);
    return {
      numbers: Array.from({ length: count }, () => generateRg(rng)),
      note: 'O RG não tem formato nem algoritmo nacionais: cada estado emite o seu. Estes números seguem o modelo de São Paulo (8 dígitos e um dígito verificador, que pode ser "X"), são sintéticos, não foram emitidos e não identificam ninguém.',
    };
  },
  fields: { count: { label: 'Quantidade' }, seed: seedHint },
  outputLabels: { numbers: 'RGs demonstrativos', note: 'Importante' },
  downloads: [{ field: 'numbers', fileName: 'rgs.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Cinco números reproduzíveis', input: { count: 5, seed: 'rg' } }],
  documentation:
    'Serve para preencher campos de teste. Como não há padrão nacional, não existe validação universal de RG: validadores reais precisam conhecer o formato de cada estado. O dígito verificador usa o módulo 11 com pesos de 2 a 9, como no modelo paulista. Não use para se passar por outra pessoa.',
});
