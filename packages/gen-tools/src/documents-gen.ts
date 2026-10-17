import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { moneyToWords } from './extenso.js';
import { validateCNPJ } from './cnpj.js';
import { validateCPF } from './cpf.js';
import { validateEmail, validateUrl } from './validators-intl.js';
import { parseIsoDate } from './dates.js';
import { today } from './calc-daily.js';

const LEGAL_NOTE =
  'Modelo informativo para adaptação ao seu caso. Não substitui a orientação de um advogado, e a validade depende do cumprimento das exigências legais aplicáveis.';

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const longDate = (d: { year: number; month: number; day: number }) => `${d.day} de ${MONTHS[d.month - 1]} de ${d.year}`;
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (max = 200) => z.string().max(max);
const dateField = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

function resolveDate(iso: string | undefined) {
  return iso ? (parseIsoDate(iso) as { year: number; month: number; day: number }) : today();
}

/** Valida CPF ou CNPJ (com ou sem máscara) e devolve o aviso em caso de erro. */
function documentWarning(label: string, value: string | undefined): string | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  const digits = v.replace(/\D/g, '');
  const result = digits.length > 11 ? validateCNPJ(v) : validateCPF(v);
  return result.valid ? null : `${label}: ${result.message}`;
}

// ---------- assinatura de e-mail ----------

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

function safeHref(url: string): string {
  const v = url.trim();
  if (!SAFE_PROTOCOL.test(v)) throw new ToolError(`Link não permitido: ${v}`);
  return escapeHtml(v);
}

export interface SignatureInput {
  name: string;
  role?: string | undefined;
  company?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  website?: string | undefined;
  address?: string | undefined;
  accent: string;
}

export function buildSignatureHtml(i: SignatureInput): string {
  const lines: string[] = [];
  lines.push(`<div style="font-size:16px;font-weight:bold;color:#222222;">${escapeHtml(i.name)}</div>`);
  const sub = [i.role, i.company].filter((x): x is string => !!x && x.trim() !== '').map(escapeHtml);
  if (sub.length) lines.push(`<div style="font-size:13px;color:#555555;">${sub.join(' · ')}</div>`);
  const contacts: string[] = [];
  if (i.phone) contacts.push(`<a href="${safeHref(`tel:${i.phone.replace(/[^\d+]/g, '')}`)}" style="color:${i.accent};text-decoration:none;">${escapeHtml(i.phone)}</a>`);
  if (i.email) contacts.push(`<a href="${safeHref(`mailto:${i.email.trim()}`)}" style="color:${i.accent};text-decoration:none;">${escapeHtml(i.email.trim())}</a>`);
  if (i.website) contacts.push(`<a href="${safeHref(i.website)}" style="color:${i.accent};text-decoration:none;">${escapeHtml(i.website.replace(/^https?:\/\//, ''))}</a>`);
  if (contacts.length) lines.push(`<div style="font-size:13px;margin-top:6px;">${contacts.join(' &nbsp;|&nbsp; ')}</div>`);
  if (i.address) lines.push(`<div style="font-size:12px;color:#777777;margin-top:4px;">${escapeHtml(i.address)}</div>`);
  return `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;"><tr><td style="border-left:4px solid ${i.accent};padding-left:12px;">${lines.join('')}</td></tr></table>`;
}

export const emailSignatureTool = defineTool({
  id: 'assinatura-email',
  name: 'Gerador de Assinatura de E-mail',
  description: 'Cria uma assinatura de e-mail em HTML compatível com Gmail e Outlook, pronta para copiar',
  category: 'geradores',
  keywords: ['assinatura de email', 'assinatura', 'e-mail', 'gmail', 'outlook', 'html', 'profissional', 'rodapé'],
  icon: '✍️',
  modes: ['browser', 'node'],
  live: true,
  ui: 'html-preview',
  inputSchema: z.object({
    name: text(80).default(''),
    role: text(80).optional(),
    company: text(80).optional(),
    phone: text(30).optional(),
    email: text(100).optional(),
    website: text(200).optional(),
    address: text(200).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #rrggbb').default('#0f766e'),
  }),
  outputSchema: z.object({ html: z.string(), plainText: z.string() }),
  execute: ({ name, role, company, phone, email, website, address, accent }) => {
    if (name.trim() === '') throw new ToolError('Informe o nome');
    if (email && email.trim() !== '') {
      const v = validateEmail(email);
      if (!v.valid) throw new ToolError(`E-mail inválido: ${v.message}`);
    }
    if (website && website.trim() !== '') {
      const v = validateUrl(website);
      if (!v.valid) throw new ToolError(`Site inválido: ${v.message}`);
    }
    const clean = (s: string | undefined) => (s && s.trim() !== '' ? s.trim() : undefined);
    const html = buildSignatureHtml({ name: name.trim(), role: clean(role), company: clean(company), phone: clean(phone), email: clean(email), website: clean(website), address: clean(address), accent });
    const plain = [name.trim(), [clean(role), clean(company)].filter(Boolean).join(' · '), [clean(phone), clean(email), clean(website)].filter(Boolean).join(' | '), clean(address)].filter((x) => x && x !== '').join('\n');
    return { html, plainText: plain };
  },
  fields: {
    name: { label: 'Nome' }, role: { label: 'Cargo' }, company: { label: 'Empresa' }, phone: { label: 'Telefone', placeholder: '+55 11 91234-5678' },
    email: { label: 'E-mail' }, website: { label: 'Site', placeholder: 'https://exemplo.com.br' }, address: { label: 'Endereço (opcional)' },
    accent: { label: 'Cor de destaque (#rrggbb)' },
  },
  outputLabels: { html: 'HTML da assinatura', plainText: 'Versão em texto' },
  downloads: [{ field: 'html', fileName: 'assinatura.html', mimeType: 'text/html', label: 'Baixar HTML' }],
  examples: [{ description: 'Assinatura simples', input: { name: 'Maria Silva', role: 'Analista', company: 'Empresa Exemplo', phone: '+55 11 91234-5678', email: 'maria@exemplo.com.br', website: 'https://exemplo.com.br', accent: '#0f766e' } }],
  documentation:
    'Gera uma tabela HTML com estilos embutidos, o formato que os clientes de e-mail aceitam. Copie o resultado da pré-visualização e cole nas configurações de assinatura do seu e-mail. Todo o conteúdo digitado é escapado (não é possível injetar HTML) e só links http, https, mailto e tel são permitidos. Clientes de e-mail removem scripts e podem alterar fontes.',
});

// ---------- meta tags SEO ----------

export interface SeoInput {
  title: string;
  description: string;
  url: string;
  siteName?: string | undefined;
  image?: string | undefined;
  type: 'website' | 'article';
  locale: string;
  twitter?: string | undefined;
  robots: string;
  themeColor?: string | undefined;
  organization?: string | undefined;
}

export function buildMetaTags(i: SeoInput): string {
  const q = escapeHtml;
  const tags: string[] = [
    `<title>${q(i.title)}</title>`,
    `<meta name="description" content="${q(i.description)}">`,
    `<link rel="canonical" href="${q(i.url)}">`,
    `<meta name="robots" content="${q(i.robots)}">`,
    `<meta property="og:type" content="${i.type}">`,
    `<meta property="og:title" content="${q(i.title)}">`,
    `<meta property="og:description" content="${q(i.description)}">`,
    `<meta property="og:url" content="${q(i.url)}">`,
    `<meta property="og:locale" content="${q(i.locale)}">`,
  ];
  if (i.siteName) tags.push(`<meta property="og:site_name" content="${q(i.siteName)}">`);
  if (i.image) tags.push(`<meta property="og:image" content="${q(i.image)}">`);
  tags.push(`<meta name="twitter:card" content="${i.image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${q(i.title)}">`, `<meta name="twitter:description" content="${q(i.description)}">`);
  if (i.image) tags.push(`<meta name="twitter:image" content="${q(i.image)}">`);
  if (i.twitter) tags.push(`<meta name="twitter:site" content="${q(i.twitter)}">`);
  if (i.themeColor) tags.push(`<meta name="theme-color" content="${q(i.themeColor)}">`);
  if (i.organization) {
    // O JSON é inserido em <script>: "<" é escapado para impedir o fechamento antecipado da tag.
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: i.organization, url: i.url, ...(i.image ? { logo: i.image } : {}) }).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json">${json}</script>`);
  }
  return tags.join('\n');
}

export function seoChecks(i: SeoInput): string[] {
  const out: string[] = [];
  const t = i.title.length;
  out.push(t < 30 ? `Título curto (${t} caracteres): ideal entre 30 e 60.` : t > 60 ? `Título longo (${t} caracteres): pode ser cortado nos resultados; ideal até 60.` : `Título com bom tamanho (${t} caracteres).`);
  const d = i.description.length;
  out.push(d < 70 ? `Descrição curta (${d} caracteres): ideal entre 70 e 160.` : d > 160 ? `Descrição longa (${d} caracteres): pode ser cortada; ideal até 160.` : `Descrição com bom tamanho (${d} caracteres).`);
  if (!i.url.startsWith('https://')) out.push('A URL canônica não usa HTTPS.');
  if (!i.image) out.push('Sem imagem de compartilhamento (og:image): links compartilhados ficam sem prévia visual. Use 1200 × 630 px.');
  else if (!/^https?:\/\//.test(i.image)) out.push('A imagem deve ter URL absoluta (começando com http:// ou https://).');
  return out;
}

export const seoTagsTool = defineTool({
  id: 'meta-tags-seo',
  name: 'Gerador de Meta Tags SEO',
  description: 'Gera title, description, canonical, Open Graph, Twitter Card e dados estruturados, com avaliação dos tamanhos',
  category: 'geradores',
  keywords: ['seo', 'meta tags', 'open graph', 'twitter card', 'canonical', 'title', 'description', 'og:image', 'json-ld', 'compartilhamento'],
  icon: '🔎',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    title: text(120).default(''),
    description: text(400).default(''),
    url: text(500).default(''),
    siteName: text(80).optional(),
    image: text(500).optional(),
    type: z.enum(['website', 'article']).default('website'),
    locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/, 'Use o formato pt_BR').default('pt_BR'),
    twitter: z.string().regex(/^@?\w{1,15}$/, 'Use o usuário, como @empresa').optional(),
    robots: z.enum(['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']).default('index, follow'),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #rrggbb').optional(),
    organization: text(80).optional(),
  }),
  outputSchema: z.object({ html: z.string(), checks: z.array(z.string()) }),
  execute: (v) => {
    if (v.title.trim() === '') throw new ToolError('Informe o título da página');
    if (v.description.trim() === '') throw new ToolError('Informe a descrição da página');
    const u = validateUrl(v.url);
    if (!u.valid) throw new ToolError(`URL canônica inválida: ${u.message}`);
    if (v.image && v.image.trim() !== '') {
      const img = validateUrl(v.image);
      if (!img.valid) throw new ToolError(`URL da imagem inválida: ${img.message}`);
    }
    const input: SeoInput = {
      title: v.title.trim(), description: v.description.trim(), url: v.url.trim(), siteName: v.siteName?.trim() || undefined, image: v.image?.trim() || undefined,
      type: v.type, locale: v.locale, twitter: v.twitter ? (v.twitter.startsWith('@') ? v.twitter : `@${v.twitter}`) : undefined, robots: v.robots,
      themeColor: v.themeColor, organization: v.organization?.trim() || undefined,
    };
    return { html: buildMetaTags(input), checks: seoChecks(input) };
  },
  fields: {
    title: { label: 'Título da página', placeholder: 'Calculadora de Salário Líquido | Gen' }, description: { label: 'Descrição', multiline: true },
    url: { label: 'URL canônica', placeholder: 'https://exemplo.com.br/pagina' }, siteName: { label: 'Nome do site (opcional)' },
    image: { label: 'Imagem de compartilhamento (URL, opcional)', placeholder: 'https://exemplo.com.br/capa.jpg' },
    type: { label: 'Tipo de página', optionLabels: { website: 'Site ou página', article: 'Artigo' } }, locale: { label: 'Idioma e região' },
    twitter: { label: 'Usuário no X/Twitter (opcional)' },
    robots: { label: 'Indexação', optionLabels: { 'index, follow': 'Indexar e seguir links', 'noindex, follow': 'Não indexar, seguir links', 'index, nofollow': 'Indexar, não seguir links', 'noindex, nofollow': 'Não indexar nem seguir' } },
    themeColor: { label: 'Cor do tema (opcional)' }, organization: { label: 'Organização (gera JSON-LD, opcional)' },
  },
  outputLabels: { html: 'Tags para o <head>', checks: 'Avaliação' },
  downloads: [{ field: 'html', fileName: 'meta-tags.html', mimeType: 'text/html', label: 'Baixar HTML' }],
  examples: [{ description: 'Página de produto', input: { title: 'Calculadora de Salário Líquido | Gen', description: 'Calcule seu salário líquido com INSS e imposto de renda atualizados, de forma gratuita e sem cadastro.', url: 'https://gen.esc-software.com/salario-liquido', type: 'website', locale: 'pt_BR', robots: 'index, follow' } }],
  documentation:
    'Cole as tags dentro do <head> da página. Todos os valores são escapados, e o JSON-LD é protegido contra fechamento antecipado da tag <script>. As avaliações seguem recomendações usuais de tamanho (título até cerca de 60 caracteres e descrição até cerca de 160); os buscadores podem exibir trechos diferentes. As tags não garantem posicionamento.',
});

// ---------- recibo ----------

export const receiptTool = defineTool({
  id: 'recibo',
  name: 'Gerador de Recibo',
  description: 'Gera um recibo de pagamento com o valor por extenso, pronto para imprimir e assinar',
  category: 'geradores',
  keywords: ['recibo', 'comprovante de pagamento', 'valor por extenso', 'recebi de', 'aluguel', 'serviço', 'imprimir'],
  icon: '🧾',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    payer: text(100).default(''),
    payerDocument: text(20).optional(),
    receiver: text(100).default(''),
    receiverDocument: text(20).optional(),
    amount: z.number().finite().positive().max(1e12).default(100),
    reference: text(300).default(''),
    city: text(60).default(''),
    date: dateField('Data').optional(),
  }),
  outputSchema: z.object({ receipt: z.string(), amountInWords: z.string(), warnings: z.array(z.string()) }),
  execute: ({ payer, payerDocument, receiver, receiverDocument, amount, reference, city, date }) => {
    if (payer.trim() === '' || receiver.trim() === '') throw new ToolError('Informe o pagador e quem recebe');
    if (reference.trim() === '') throw new ToolError('Informe a que se refere o pagamento');
    if (city.trim() === '') throw new ToolError('Informe a cidade');
    const words = moneyToWords(BigInt(Math.round(amount * 100)));
    const d = resolveDate(date);
    const doc = (label: string, v: string | undefined) => (v && v.trim() !== '' ? ` (${label} ${v.trim()})` : '');
    const receipt = [
      `RECIBO — ${reais(amount)}`,
      '',
      `Recebi de ${payer.trim()}${doc('CPF/CNPJ', payerDocument)} a quantia de ${reais(amount)} (${words}), referente a ${reference.trim()}.`,
      '',
      'Pelo que firmo o presente recibo, dando plena e geral quitação do valor recebido.',
      '',
      `${city.trim()}, ${longDate(d)}.`,
      '',
      '',
      '______________________________________',
      `${receiver.trim()}${doc('CPF/CNPJ', receiverDocument)}`,
    ].join('\n');
    const warnings = [documentWarning('Documento do pagador', payerDocument), documentWarning('Documento de quem recebe', receiverDocument)].filter((x): x is string => x !== null);
    return { receipt, amountInWords: words, warnings };
  },
  fields: {
    payer: { label: 'Pagador (quem pagou)' }, payerDocument: { label: 'CPF ou CNPJ do pagador (opcional)' },
    receiver: { label: 'Recebedor (quem recebeu)' }, receiverDocument: { label: 'CPF ou CNPJ de quem recebeu (opcional)' },
    amount: { label: 'Valor (R$)' }, reference: { label: 'Referente a', multiline: true, placeholder: 'aluguel do mês de março de 2026' },
    city: { label: 'Cidade' }, date: { label: 'Data (opcional)', inputType: 'date', help: 'Se vazio, usa hoje.' },
  },
  outputLabels: { receipt: 'Recibo', amountInWords: 'Valor por extenso', warnings: 'Avisos' },
  downloads: [{ field: 'receipt', fileName: 'recibo.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Recibo de aluguel', input: { payer: 'João da Silva', receiver: 'Maria Souza', amount: 1250.5, reference: 'aluguel de março de 2026', city: 'São Paulo', date: '2026-03-05' }, output: { amountInWords: 'mil duzentos e cinquenta reais e cinquenta centavos' } }],
  documentation:
    `O valor por extenso é calculado automaticamente. O recibo vale como prova de pagamento quando assinado por quem recebeu; guarde uma via. CPF e CNPJ informados são conferidos pelos dígitos verificadores e geram aviso se estiverem incorretos. ${LEGAL_NOTE}`,
});

// ---------- declaração ----------

export type DeclarationKind = 'residence' | 'low-income' | 'income';

export const declarationTool = defineTool({
  id: 'declaracao',
  name: 'Gerador de Declarações',
  description: 'Gera modelos de declaração de residência, de hipossuficiência (isenção de custas) e de renda autônoma',
  category: 'geradores',
  keywords: ['declaração', 'declaração de residência', 'hipossuficiência', 'pobreza', 'renda', 'autônomo', 'comprovante', 'modelo'],
  icon: '📄',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    kind: z.enum(['residence', 'low-income', 'income']).default('residence'),
    name: text(100).default(''),
    document: text(20).default(''),
    address: text(200).default(''),
    city: text(60).default(''),
    date: dateField('Data').optional(),
    since: text(60).optional(),
    monthlyIncome: z.number().finite().min(0).max(1e9).optional(),
    activity: text(120).optional(),
  }),
  outputSchema: z.object({ declaration: z.string(), warnings: z.array(z.string()) }),
  execute: ({ kind, name, document, address, city, date, since, monthlyIncome, activity }) => {
    if (name.trim() === '') throw new ToolError('Informe o nome do declarante');
    if (document.trim() === '') throw new ToolError('Informe o CPF do declarante');
    if (kind !== 'low-income' && address.trim() === '') throw new ToolError('Informe o endereço');
    if (city.trim() === '') throw new ToolError('Informe a cidade');
    const d = resolveDate(date);
    const who = `Eu, ${name.trim()}, portador(a) do CPF nº ${document.trim()}`;
    let body: string;
    let title: string;
    if (kind === 'residence') {
      title = 'DECLARAÇÃO DE RESIDÊNCIA';
      body = `${who}, DECLARO, sob as penas da lei, para os devidos fins de comprovação de residência, que resido no endereço ${address.trim()}${since ? `, desde ${since.trim()}` : ''}.\n\nDeclaro ainda estar ciente de que a prestação de declaração falsa me sujeita às sanções civis, administrativas e penais previstas na legislação, inclusive a do art. 299 do Código Penal (Lei nº 7.115/1983, art. 2º).`;
    } else if (kind === 'low-income') {
      title = 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA';
      body = `${who}, DECLARO, para os fins do art. 98 e seguintes do Código de Processo Civil (Lei nº 13.105/2015), que não possuo condições de arcar com as custas processuais e os honorários advocatícios sem prejuízo do meu sustento e o de minha família.\n\nDeclaro estar ciente de que a declaração falsa me sujeita às penas da lei.`;
    } else {
      if (monthlyIncome === undefined) throw new ToolError('Informe a renda mensal média');
      title = 'DECLARAÇÃO DE RENDA';
      body = `${who}, residente em ${address.trim()}, DECLARO, sob as penas da lei, que exerço a atividade de ${activity?.trim() || 'trabalhador(a) autônomo(a)'} e que minha renda mensal média é de ${reais(monthlyIncome)} (${moneyToWords(BigInt(Math.round(monthlyIncome * 100)))}).\n\nDeclaro estar ciente de que prestar informação falsa constitui crime de falsidade ideológica (Código Penal, art. 299).`;
    }
    const declaration = [title, '', body, '', `${city.trim()}, ${longDate(d)}.`, '', '', '______________________________________', name.trim(), `CPF ${document.trim()}`].join('\n');
    return { declaration, warnings: [documentWarning('CPF', document)].filter((x): x is string => x !== null) };
  },
  fields: {
    kind: { label: 'Tipo de declaração', optionLabels: { residence: 'Residência', 'low-income': 'Hipossuficiência econômica', income: 'Renda de autônomo' } },
    name: { label: 'Nome completo' }, document: { label: 'CPF', placeholder: '529.982.247-25' },
    address: { label: 'Endereço completo', help: 'Obrigatório nas declarações de residência e de renda.' },
    city: { label: 'Cidade' }, date: { label: 'Data (opcional)', inputType: 'date' },
    since: { label: 'Reside desde (opcional)', placeholder: 'janeiro de 2020', help: 'Só na declaração de residência.' },
    monthlyIncome: { label: 'Renda mensal média (R$)', help: 'Só na declaração de renda.' },
    activity: { label: 'Atividade exercida', help: 'Só na declaração de renda.' },
  },
  outputLabels: { declaration: 'Declaração', warnings: 'Avisos' },
  downloads: [{ field: 'declaration', fileName: 'declaracao.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Declaração de residência', input: { kind: 'residence', name: 'Maria da Silva', document: '529.982.247-25', address: 'Rua das Flores, 100, Centro, São Paulo/SP', city: 'São Paulo', date: '2026-03-05' } }],
  documentation:
    `Declarações assinadas pela própria pessoa e feitas sob as penas da lei têm presunção de veracidade (Lei 7.115/1983), mas informar dado falso é crime (Código Penal, art. 299). Preencha somente com informações verdadeiras; alguns órgãos exigem modelo próprio ou firma reconhecida. ${LEGAL_NOTE}`,
});

// ---------- contrato ----------

type ContractKind = 'services' | 'lease' | 'sale';

interface Party {
  name: string;
  document: string;
  address: string;
}

function partyLine(role: string, p: Party): string {
  return `${role}: ${p.name}, inscrito(a) no CPF/CNPJ sob o nº ${p.document}, com endereço em ${p.address}`;
}

function numberClauses(clauses: { title: string; body: string }[]): string {
  return clauses.map((c, i) => `CLÁUSULA ${i + 1}ª — ${c.title}\n${c.body}`).join('\n\n');
}

export interface ContractInput {
  kind: ContractKind;
  partyA: Party;
  partyB: Party;
  object: string;
  amount: number;
  payment: string;
  months: number;
  city: string;
  date: { year: number; month: number; day: number };
  guarantee?: string | undefined;
  index?: string | undefined;
  dueDay?: number | undefined;
}

export function buildContract(i: ContractInput): string {
  const money = `${reais(i.amount)} (${moneyToWords(BigInt(Math.round(i.amount * 100)))})`;
  const common = [
    { title: 'DA RESCISÃO', body: 'O descumprimento de qualquer cláusula por uma das partes autoriza a outra a rescindir o contrato, mediante notificação por escrito, sem prejuízo das perdas e danos comprovados.' },
    { title: 'DAS COMUNICAÇÕES', body: 'As comunicações entre as partes serão feitas por escrito, nos endereços indicados neste contrato, ou por e-mail previamente informado.' },
    { title: 'DO FORO', body: `As partes elegem o foro da comarca de ${i.city} para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.` },
  ];
  let title: string;
  let intro: string;
  let clauses: { title: string; body: string }[];

  if (i.kind === 'services') {
    title = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS';
    intro = `${partyLine('CONTRATANTE', i.partyA)}.\n${partyLine('CONTRATADO(A)', i.partyB)}.\n\nAs partes acima identificadas têm entre si justo e acertado o presente contrato, que se regerá pelas cláusulas seguintes.`;
    clauses = [
      { title: 'DO OBJETO', body: `O CONTRATADO(A) prestará ao CONTRATANTE os seguintes serviços: ${i.object}.` },
      { title: 'DO PREÇO E DA FORMA DE PAGAMENTO', body: `Pelos serviços, o CONTRATANTE pagará ao CONTRATADO(A) o valor de ${money}. Forma de pagamento: ${i.payment}.` },
      { title: 'DO PRAZO', body: `Este contrato vigorará por ${i.months} mês(es), a contar da data de sua assinatura, podendo ser renovado por acordo escrito entre as partes.` },
      { title: 'DAS OBRIGAÇÕES DO CONTRATADO(A)', body: 'Executar os serviços com diligência e qualidade, nos prazos combinados, e manter sigilo sobre as informações do CONTRATANTE a que tiver acesso.' },
      { title: 'DAS OBRIGAÇÕES DO CONTRATANTE', body: 'Fornecer as informações e condições necessárias à execução dos serviços e efetuar o pagamento na forma e nos prazos acordados.' },
      { title: 'DA AUSÊNCIA DE VÍNCULO TRABALHISTA', body: 'A prestação dos serviços é autônoma, sem subordinação, habitualidade imposta ou exclusividade, não gerando vínculo empregatício entre as partes.' },
      ...common,
    ];
  } else if (i.kind === 'lease') {
    title = 'CONTRATO DE LOCAÇÃO RESIDENCIAL';
    intro = `${partyLine('LOCADOR(A)', i.partyA)}.\n${partyLine('LOCATÁRIO(A)', i.partyB)}.\n\nAs partes acima identificadas celebram o presente contrato de locação residencial, regido pela Lei nº 8.245/1991 e pelas cláusulas seguintes.`;
    clauses = [
      { title: 'DO OBJETO', body: `O LOCADOR(A) cede ao LOCATÁRIO(A), exclusivamente para fins residenciais, o imóvel situado em ${i.object}.` },
      { title: 'DO PRAZO', body: `A locação terá prazo de ${i.months} meses, iniciando na data de assinatura. Findo o prazo sem notificação, a locação prorroga-se por prazo indeterminado, nos termos da lei.` },
      { title: 'DO ALUGUEL', body: `O aluguel mensal é de ${money}, a ser pago até o dia ${i.dueDay ?? 5} de cada mês. Forma de pagamento: ${i.payment}. O valor será reajustado a cada 12 meses pela variação do índice ${i.index ?? 'IPCA'}.` },
      { title: 'DOS ENCARGOS', body: 'Ficam a cargo do LOCATÁRIO(A) as despesas de consumo (água, energia elétrica, gás, internet), bem como taxas e tributos incidentes sobre o imóvel que a lei ou o acordo lhe atribuírem.' },
      { title: 'DA GARANTIA', body: `Como garantia da locação, fica estabelecido: ${i.guarantee ?? 'sem garantia (a escolha deve respeitar o art. 37 da Lei nº 8.245/1991, que veda mais de uma modalidade)'}.` },
      { title: 'DA CONSERVAÇÃO E DEVOLUÇÃO', body: 'O LOCATÁRIO(A) deverá conservar o imóvel e devolvê-lo nas condições em que o recebeu, salvo o desgaste natural pelo uso regular, conforme vistoria inicial anexa.' },
      { title: 'DA MULTA POR RESCISÃO ANTECIPADA', body: 'Em caso de devolução do imóvel antes do prazo contratado, o LOCATÁRIO(A) pagará multa proporcional ao período restante, nos termos do art. 4º da Lei nº 8.245/1991.' },
      ...common,
    ];
  } else {
    title = 'CONTRATO DE COMPRA E VENDA DE BEM MÓVEL';
    intro = `${partyLine('VENDEDOR(A)', i.partyA)}.\n${partyLine('COMPRADOR(A)', i.partyB)}.\n\nAs partes acima identificadas celebram o presente contrato de compra e venda, que se regerá pelas cláusulas seguintes.`;
    clauses = [
      { title: 'DO OBJETO', body: `O VENDEDOR(A) vende ao COMPRADOR(A) o seguinte bem: ${i.object}, declarando ser o legítimo proprietário e que o bem está livre de ônus, penhoras e débitos.` },
      { title: 'DO PREÇO E DO PAGAMENTO', body: `O preço total é de ${money}. Forma de pagamento: ${i.payment}.` },
      { title: 'DA ENTREGA', body: 'O bem será entregue na data da assinatura ou em outra combinada por escrito, no estado em que se encontra, que o COMPRADOR(A) declara conhecer e aceitar.' },
      { title: 'DA TRANSFERÊNCIA', body: 'As despesas de transferência de propriedade, quando houver, correrão por conta do COMPRADOR(A), e o VENDEDOR(A) se obriga a fornecer os documentos necessários.' },
      { title: 'DA RESPONSABILIDADE', body: 'O VENDEDOR(A) responde pela evicção e pelos vícios ocultos do bem, nos termos da lei civil.' },
      ...common,
    ];
  }

  return [title, '', intro, '', numberClauses(clauses), '', `E, por estarem justas e contratadas, as partes assinam este instrumento em duas vias de igual teor, na presença de duas testemunhas.`, '', `${i.city}, ${longDate(i.date)}.`, '', '', '______________________________    ______________________________', `${i.partyA.name}${' '.repeat(Math.max(4, 34 - i.partyA.name.length))}${i.partyB.name}`, '', 'Testemunhas:', '1) ______________________________  CPF: ______________', '2) ______________________________  CPF: ______________'].join('\n');
}

export const contractTool = defineTool({
  id: 'contrato',
  name: 'Gerador de Contrato a partir de Modelos',
  description: 'Gera contratos de prestação de serviços, locação residencial e compra e venda a partir das informações das partes',
  category: 'geradores',
  keywords: ['contrato', 'prestação de serviços', 'locação', 'aluguel', 'compra e venda', 'modelo de contrato', 'cláusulas', 'jurídico'],
  icon: '📜',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    kind: z.enum(['services', 'lease', 'sale']).default('services'),
    partyAName: text(100).default(''), partyADocument: text(20).default(''), partyAAddress: text(200).default(''),
    partyBName: text(100).default(''), partyBDocument: text(20).default(''), partyBAddress: text(200).default(''),
    object: text(500).default(''),
    amount: z.number().finite().positive().max(1e12).default(1000),
    payment: text(200).default('à vista, por transferência bancária ou Pix'),
    months: z.number().int().min(1).max(600).default(12),
    dueDay: z.number().int().min(1).max(28).optional(),
    index: z.enum(['IPCA', 'IGP-M']).default('IPCA'),
    guarantee: text(200).optional(),
    city: text(60).default(''),
    date: dateField('Data').optional(),
  }),
  outputSchema: z.object({ contract: z.string(), warnings: z.array(z.string()), note: z.string() }),
  execute: (v) => {
    const need = (value: string, label: string) => {
      if (value.trim() === '') throw new ToolError(`Informe ${label}`);
    };
    need(v.partyAName, 'o nome da primeira parte'); need(v.partyADocument, 'o CPF/CNPJ da primeira parte'); need(v.partyAAddress, 'o endereço da primeira parte');
    need(v.partyBName, 'o nome da segunda parte'); need(v.partyBDocument, 'o CPF/CNPJ da segunda parte'); need(v.partyBAddress, 'o endereço da segunda parte');
    need(v.object, 'o objeto do contrato'); need(v.city, 'a cidade do foro');
    const contract = buildContract({
      kind: v.kind, amount: v.amount, payment: v.payment.trim(), months: v.months, city: v.city.trim(), date: resolveDate(v.date), guarantee: v.guarantee?.trim() || undefined, index: v.index, dueDay: v.dueDay, object: v.object.trim(),
      partyA: { name: v.partyAName.trim(), document: v.partyADocument.trim(), address: v.partyAAddress.trim() },
      partyB: { name: v.partyBName.trim(), document: v.partyBDocument.trim(), address: v.partyBAddress.trim() },
    });
    return {
      contract,
      warnings: [documentWarning('Documento da primeira parte', v.partyADocument), documentWarning('Documento da segunda parte', v.partyBDocument)].filter((x): x is string => x !== null),
      note: LEGAL_NOTE,
    };
  },
  fields: {
    kind: { label: 'Modelo', optionLabels: { services: 'Prestação de serviços', lease: 'Locação residencial', sale: 'Compra e venda de bem móvel' } },
    partyAName: { label: '1ª parte (contratante / locador / vendedor): nome' }, partyADocument: { label: '1ª parte: CPF ou CNPJ' }, partyAAddress: { label: '1ª parte: endereço' },
    partyBName: { label: '2ª parte (contratado / locatário / comprador): nome' }, partyBDocument: { label: '2ª parte: CPF ou CNPJ' }, partyBAddress: { label: '2ª parte: endereço' },
    object: { label: 'Objeto', multiline: true, help: 'Serviços a prestar, endereço do imóvel ou descrição do bem vendido.' },
    amount: { label: 'Valor (R$)', help: 'Preço, aluguel mensal ou valor do bem.' }, payment: { label: 'Forma de pagamento' },
    months: { label: 'Prazo (meses)', help: 'Vigência do contrato de serviços ou da locação.' }, dueDay: { label: 'Dia de vencimento do aluguel', help: 'Só na locação.' },
    index: { label: 'Índice de reajuste (locação)' }, guarantee: { label: 'Garantia da locação', help: 'Caução, fiador, seguro-fiança ou título de capitalização (apenas uma).' },
    city: { label: 'Cidade (assinatura e foro)' }, date: { label: 'Data (opcional)', inputType: 'date' },
  },
  outputLabels: { contract: 'Contrato', warnings: 'Avisos', note: 'Importante' },
  downloads: [{ field: 'contract', fileName: 'contrato.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Prestação de serviços de design', input: { kind: 'services', partyAName: 'Empresa Exemplo Ltda', partyADocument: '11.222.333/0001-81', partyAAddress: 'Rua A, 1, São Paulo/SP', partyBName: 'Maria Silva', partyBDocument: '529.982.247-25', partyBAddress: 'Rua B, 2, São Paulo/SP', object: 'criação de identidade visual', amount: 3000, payment: '50% na assinatura e 50% na entrega', months: 2, index: 'IPCA', city: 'São Paulo', date: '2026-03-05' } }],
  documentation:
    `Escolha o modelo, preencha os dados das partes e do objeto e revise cada cláusula. Os modelos trazem cláusulas básicas (objeto, preço, prazo, obrigações, rescisão, foro) e, na locação, referências à Lei do Inquilinato. ${LEGAL_NOTE} Contratos de maior valor, com bens imóveis ou riscos relevantes devem ser revisados por advogado.`,
});

// ---------- currículo ----------

export interface ResumeInput {
  name: string;
  title?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  city?: string | undefined;
  link?: string | undefined;
  summary?: string | undefined;
  experience: string[];
  education: string[];
  skills: string[];
  languages: string[];
}

const lines = (s: string | undefined) => (s ?? '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);

export function buildResume(r: ResumeInput): { markdown: string; html: string; plain: string } {
  const contact = [r.city, r.phone, r.email, r.link].filter((x): x is string => !!x && x.trim() !== '');
  const md: string[] = [`# ${r.name}`];
  if (r.title) md.push(`**${r.title}**`);
  if (contact.length) md.push('', contact.join(' · '));
  const section = (title: string, items: string[], bullets = true) => {
    if (items.length === 0) return;
    md.push('', `## ${title}`, '', ...items.map((x) => (bullets ? `- ${x}` : x)));
  };
  if (r.summary) md.push('', '## Resumo', '', r.summary);
  section('Experiência profissional', r.experience);
  section('Formação', r.education);
  section('Competências', r.skills.length ? [r.skills.join(', ')] : [], false);
  section('Idiomas', r.languages);

  const h = escapeHtml;
  const ul = (items: string[]) => `<ul>${items.map((x) => `<li>${h(x)}</li>`).join('')}</ul>`;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;color:#222;line-height:1.45;">',
    `<h1 style="margin:0;font-size:26px;">${h(r.name)}</h1>`,
    r.title ? `<div style="font-size:16px;color:#0f766e;font-weight:bold;">${h(r.title)}</div>` : '',
    contact.length ? `<div style="font-size:13px;color:#555;margin:6px 0 14px;">${contact.map(h).join(' · ')}</div>` : '',
    r.summary ? `<h2 style="font-size:15px;border-bottom:1px solid #ccc;">Resumo</h2><p>${h(r.summary)}</p>` : '',
    r.experience.length ? `<h2 style="font-size:15px;border-bottom:1px solid #ccc;">Experiência profissional</h2>${ul(r.experience)}` : '',
    r.education.length ? `<h2 style="font-size:15px;border-bottom:1px solid #ccc;">Formação</h2>${ul(r.education)}` : '',
    r.skills.length ? `<h2 style="font-size:15px;border-bottom:1px solid #ccc;">Competências</h2><p>${r.skills.map(h).join(', ')}</p>` : '',
    r.languages.length ? `<h2 style="font-size:15px;border-bottom:1px solid #ccc;">Idiomas</h2>${ul(r.languages)}` : '',
    '</div>',
  ].filter(Boolean).join('');
  return { markdown: md.join('\n'), html, plain: md.join('\n').replace(/^#+ /gm, '').replace(/\*\*/g, '').replace(/^- /gm, '• ') };
}

export const resumeTool = defineTool({
  id: 'curriculo',
  name: 'Gerador de Currículo',
  description: 'Monta um currículo limpo e objetivo a partir dos seus dados, em Markdown, HTML e texto',
  category: 'geradores',
  keywords: ['currículo', 'curriculum', 'cv', 'emprego', 'experiência profissional', 'formação', 'modelo de currículo', 'candidatura'],
  icon: '📋',
  modes: ['browser', 'node'],
  live: true,
  ui: 'html-preview',
  inputSchema: z.object({
    name: text(100).default(''), title: text(100).optional(), email: text(100).optional(), phone: text(30).optional(), city: text(80).optional(), link: text(200).optional(),
    summary: text(1000).optional(), experience: text(5000).optional(), education: text(3000).optional(), skills: text(1000).optional(), languages: text(500).optional(),
  }),
  outputSchema: z.object({ html: z.string(), markdown: z.string(), plainText: z.string() }),
  execute: (v) => {
    if (v.name.trim() === '') throw new ToolError('Informe o nome');
    if (v.email && v.email.trim() !== '') {
      const e = validateEmail(v.email);
      if (!e.valid) throw new ToolError(`E-mail inválido: ${e.message}`);
    }
    const r = buildResume({
      name: v.name.trim(), title: v.title?.trim() || undefined, email: v.email?.trim() || undefined, phone: v.phone?.trim() || undefined, city: v.city?.trim() || undefined, link: v.link?.trim() || undefined,
      summary: v.summary?.trim() || undefined, experience: lines(v.experience), education: lines(v.education),
      skills: (v.skills ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean), languages: lines(v.languages),
    });
    return { html: r.html, markdown: r.markdown, plainText: r.plain };
  },
  fields: {
    name: { label: 'Nome completo' }, title: { label: 'Objetivo ou cargo desejado' }, email: { label: 'E-mail' }, phone: { label: 'Telefone' }, city: { label: 'Cidade e estado' },
    link: { label: 'LinkedIn ou portfólio (opcional)' }, summary: { label: 'Resumo profissional', multiline: true },
    experience: { label: 'Experiência (uma por linha)', multiline: true, placeholder: 'Empresa X — Analista (2021–2024): automatizei relatórios e reduzi o tempo de fechamento em 30%', help: 'Comece pelas mais recentes e inclua resultados concretos.' },
    education: { label: 'Formação (uma por linha)', multiline: true }, skills: { label: 'Competências (separadas por vírgula)' }, languages: { label: 'Idiomas (um por linha)', multiline: true },
  },
  outputLabels: { html: 'HTML', markdown: 'Markdown', plainText: 'Texto simples' },
  downloads: [{ field: 'markdown', fileName: 'curriculo.md', mimeType: 'text/markdown', label: 'Baixar Markdown' }, { field: 'html', fileName: 'curriculo.html', mimeType: 'text/html', label: 'Baixar HTML' }],
  examples: [{ description: 'Currículo curto', input: { name: 'Maria Silva', title: 'Analista de dados', email: 'maria@exemplo.com.br', city: 'São Paulo, SP', summary: 'Analista com 5 anos de experiência.', experience: 'Empresa X — Analista (2021–2024)', skills: 'SQL, Python, Excel' } }],
  documentation:
    'Organiza as informações em seções (resumo, experiência, formação, competências e idiomas) e gera três formatos. O HTML é escapado. Para enviar em PDF, abra o HTML no navegador e use "Imprimir > Salvar como PDF". Mantenha o currículo objetivo (uma a duas páginas) e adapte-o à vaga.',
});

// ---------- política de privacidade ----------

export const privacyPolicyTool = defineTool({
  id: 'politica-privacidade',
  name: 'Gerador de Política de Privacidade (LGPD)',
  description: 'Gera um modelo de política de privacidade conforme a LGPD com base nos dados que o seu site realmente coleta',
  category: 'geradores',
  keywords: ['política de privacidade', 'lgpd', 'privacidade', 'cookies', 'dados pessoais', 'termos', 'site', 'proteção de dados'],
  icon: '🔒',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    company: text(120).default(''), cnpj: text(20).optional(), siteUrl: text(200).default(''), contactEmail: text(100).default(''), dpo: text(100).optional(),
    collectsIdentification: z.boolean().default(true), collectsPhone: z.boolean().default(false), collectsPayment: z.boolean().default(false),
    collectsLocation: z.boolean().default(false), usesCookies: z.boolean().default(true), usesAnalytics: z.boolean().default(false), usesAds: z.boolean().default(false),
    sharesWithProcessors: z.boolean().default(false), internationalTransfer: z.boolean().default(false), childrenData: z.boolean().default(false),
    retention: text(200).default('pelo tempo necessário para cumprir as finalidades descritas e as obrigações legais'),
    date: dateField('Data').optional(),
  }),
  outputSchema: z.object({ policy: z.string(), warnings: z.array(z.string()), note: z.string() }),
  execute: (v) => {
    if (v.company.trim() === '') throw new ToolError('Informe o nome da empresa ou do responsável');
    const site = validateUrl(v.siteUrl);
    if (!site.valid) throw new ToolError(`Endereço do site inválido: ${site.message}`);
    const mail = validateEmail(v.contactEmail);
    if (!mail.valid) throw new ToolError(`E-mail de contato inválido: ${mail.message}`);
    const d = resolveDate(v.date);
    const data: string[] = [];
    if (v.collectsIdentification) data.push('dados de identificação e contato (nome e e-mail)');
    if (v.collectsPhone) data.push('número de telefone');
    if (v.collectsPayment) data.push('dados de pagamento, tratados por processadores de pagamento');
    if (v.collectsLocation) data.push('dados de localização aproximada');
    if (v.usesCookies) data.push('identificadores de navegação e cookies');
    if (v.usesAnalytics) data.push('dados de uso e de desempenho do site, de forma agregada');
    if (data.length === 0) data.push('nenhum dado pessoal é coletado de forma intencional além dos registros técnicos de acesso do servidor');
    const sections: string[] = [
      `POLÍTICA DE PRIVACIDADE\n${v.company.trim()}${v.cnpj ? ` — CNPJ ${v.cnpj.trim()}` : ''}\nSite: ${v.siteUrl.trim()}\nÚltima atualização: ${longDate(d)}`,
      `1. QUEM SOMOS (CONTROLADOR)\n${v.company.trim()} é a controladora dos dados pessoais tratados por este site, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD). Contato: ${v.contactEmail.trim()}${v.dpo ? `. Encarregado pelo tratamento de dados (DPO): ${v.dpo.trim()}` : ''}.`,
      `2. DADOS QUE COLETAMOS\nPodemos tratar: ${data.join('; ')}.${v.childrenData ? ' O site pode tratar dados de crianças e adolescentes, sempre com o consentimento específico de ao menos um dos pais ou responsável legal e no melhor interesse do menor (LGPD, art. 14).' : ' Este site não se destina a menores de 18 anos e não coleta intencionalmente dados deles.'}`,
      `3. FINALIDADES E BASES LEGAIS\nUsamos os dados para: prestar os serviços solicitados (execução de contrato ou de procedimentos preliminares, art. 7º, V); responder contatos e solicitações (legítimo interesse ou consentimento); cumprir obrigações legais (art. 7º, II); proteger o site contra fraudes e abusos (legítimo interesse, art. 7º, IX)${v.usesAnalytics ? '; e entender e melhorar o uso do site com estatísticas (legítimo interesse ou consentimento, conforme o caso)' : ''}${v.usesAds ? '; e exibir publicidade (mediante consentimento)' : ''}.`,
    ];
    if (v.usesCookies) sections.push(`4. COOKIES\nUsamos cookies e tecnologias semelhantes para o funcionamento do site${v.usesAnalytics ? ', para estatísticas' : ''}${v.usesAds ? ' e para publicidade' : ''}. Cookies não essenciais dependem do seu consentimento, que pode ser retirado a qualquer momento nas configurações do navegador ou do banner de cookies.`);
    sections.push(
      `${v.usesCookies ? '5' : '4'}. COMPARTILHAMENTO\n${v.sharesWithProcessors ? 'Compartilhamos dados com operadores e parceiros estritamente necessários à prestação do serviço (por exemplo, hospedagem, e-mail, pagamentos e análise), sempre sob contrato e com as mesmas obrigações de proteção.' : 'Não compartilhamos seus dados pessoais com terceiros, exceto quando exigido por lei ou ordem de autoridade competente.'} Não vendemos dados pessoais.${v.internationalTransfer ? ' Alguns provedores podem armazenar dados fora do Brasil; nesses casos adotamos as garantias previstas na LGPD (art. 33).' : ''}`,
      `${v.usesCookies ? '6' : '5'}. RETENÇÃO\nMantemos os dados ${v.retention.trim()}. Após esse período, os dados são eliminados ou anonimizados, salvo guarda obrigatória por lei.`,
      `${v.usesCookies ? '7' : '6'}. SEUS DIREITOS\nVocê pode, a qualquer momento e mediante solicitação, obter: confirmação da existência de tratamento; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; eliminação dos dados tratados com consentimento; informação sobre compartilhamentos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento (LGPD, art. 18). Para exercer seus direitos, escreva para ${v.contactEmail.trim()}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      `${v.usesCookies ? '8' : '7'}. SEGURANÇA\nAdotamos medidas técnicas e administrativas razoáveis para proteger os dados contra acessos não autorizados, perda e alteração. Nenhum sistema é totalmente invulnerável; em caso de incidente relevante, comunicaremos a ANPD e os titulares afetados conforme a lei.`,
      `${v.usesCookies ? '9' : '8'}. ALTERAÇÕES\nPodemos atualizar esta política. A data da última atualização aparece no topo, e mudanças relevantes serão informadas no site.`,
    );
    const warnings = [v.cnpj ? documentWarning('CNPJ', v.cnpj) : null].filter((x): x is string => x !== null);
    return { policy: sections.join('\n\n'), warnings, note: `${LEGAL_NOTE} A política precisa refletir o que o site realmente faz; revise-a sempre que mudar a coleta de dados.` };
  },
  fields: {
    company: { label: 'Empresa ou responsável' }, cnpj: { label: 'CNPJ (opcional)' }, siteUrl: { label: 'Endereço do site', placeholder: 'https://exemplo.com.br' },
    contactEmail: { label: 'E-mail para contato e solicitações' }, dpo: { label: 'Nome do encarregado (DPO), opcional' },
    collectsIdentification: { label: 'Coleta nome e e-mail (formulários, cadastro)' }, collectsPhone: { label: 'Coleta telefone' }, collectsPayment: { label: 'Processa pagamentos' },
    collectsLocation: { label: 'Coleta localização' }, usesCookies: { label: 'Usa cookies' }, usesAnalytics: { label: 'Usa ferramentas de análise (como Google Analytics)' }, usesAds: { label: 'Exibe publicidade' },
    sharesWithProcessors: { label: 'Compartilha dados com prestadores (hospedagem, e-mail, pagamento…)' }, internationalTransfer: { label: 'Dados podem ir para servidores fora do Brasil' },
    childrenData: { label: 'Trata dados de crianças e adolescentes' }, retention: { label: 'Por quanto tempo guarda os dados' }, date: { label: 'Data da atualização (opcional)', inputType: 'date' },
  },
  outputLabels: { policy: 'Política de privacidade', warnings: 'Avisos', note: 'Importante' },
  downloads: [{ field: 'policy', fileName: 'politica-de-privacidade.txt', mimeType: 'text/plain', label: 'Baixar .txt' }],
  examples: [{ description: 'Site com formulário de contato', input: { company: 'Empresa Exemplo Ltda', siteUrl: 'https://exemplo.com.br', contactEmail: 'privacidade@exemplo.com.br', collectsIdentification: true, usesCookies: true, date: '2026-03-05' } }],
  documentation:
    `O texto é montado a partir das opções marcadas, então só descreve coletas que você declarou. Cobre controlador, dados, finalidades e bases legais, cookies, compartilhamento, retenção, direitos do titular (LGPD, art. 18), segurança e alterações. ${LEGAL_NOTE}`,
});
