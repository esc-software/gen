import type { CategoryId } from '@esc/gen-core';

export interface RoadmapItem {
  id: string;
  name: string;
  category: CategoryId;
  /** Por que ainda não está pronta, quando se aplica. */
  pending?: string;
}

const item = (category: CategoryId, id: string, name: string, pending?: string): RoadmapItem =>
  pending ? { id, name, category, pending } : { id, name, category };

/**
 * Catálogo de progresso da Fase 5: tudo o que o escopo do produto prevê.
 * O status vem do registro: uma ferramenta só conta como concluída se estiver registrada
 * (e `roadmap.test.ts` garante que toda ferramenta registrada consta aqui).
 */
export const ROADMAP: readonly RoadmapItem[] = [
  // ---------- geradores ----------
  item('geradores', 'cpf', 'CPF'),
  item('geradores', 'cnpj', 'CNPJ'),
  item('geradores', 'pessoa-ficticia', 'Pessoa fictícia'),
  item('geradores', 'inscricao-estadual', 'Inscrição estadual'),
  item('geradores', 'rg', 'RG demonstrativo'),
  item('validadores', 'cnh', 'CNH'),
  item('geradores', 'endereco-ficticio', 'CEP e endereço sintético'),
  item('geradores', 'token', 'Token'),
  item('geradores', 'nome-aleatorio', 'Nome aleatório'),
  item('geradores', 'nome-fantasia', 'Nome fantasia'),
  item('geradores', 'email-ficticio', 'E-mail fictício'),
  item('geradores', 'username', 'Username'),
  item('geradores', 'frase-aleatoria', 'Frase aleatória'),
  item('geradores', 'numero-aleatorio', 'Número aleatório'),
  item('geradores', 'uuid', 'UUID'),
  item('geradores', 'hash', 'Hash'),
  item('geradores', 'qr-code', 'QR Code'),
  item('geradores', 'senha', 'Senha'),
  item('geradores', 'senha-wifi', 'Senha e QR de Wi-Fi'),
  item('geradores', 'lorem-ipsum', 'Lorem Ipsum'),
  item('geradores', 'codigo-barras', 'Código de barras'),
  item('geradores', 'nick-jogos', 'Nick para jogos'),
  item('geradores', 'gerador-link', 'Gerador de links'),
  item('geradores', 'cartao-demonstrativo', 'Cartão de crédito demonstrativo'),
  item('geradores', 'cartao-teste-pagamento', 'Cartões de teste de gateways'),
  item('geradores', 'conta-bancaria-ficticia', 'Conta bancária fictícia'),
  item('geradores', 'pix-demonstrativo', 'Pix demonstrativo'),
  item('geradores', 'boleto-demonstrativo', 'Boleto demonstrativo'),
  item('geradores', 'comprovante-demonstrativo', 'Comprovante bancário demonstrativo'),
  item('geradores', 'gerador-placa', 'Placa de veículo para testes'),
  item('geradores', 'gerador-cns', 'CNS'),
  item('geradores', 'assinatura-email', 'Assinatura de e-mail'),
  item('geradores', 'sorteador', 'Sorteador'),
  item('geradores', 'contrato', 'Contrato a partir de modelo'),
  item('geradores', 'curriculo', 'Currículo'),
  item('geradores', 'recibo', 'Recibo'),
  item('geradores', 'holerite-demonstrativo', 'Holerite demonstrativo'),
  item('geradores', 'declaracao', 'Declaração'),
  item('geradores', 'personagem-colorir', 'Personagem para colorir'),
  item('geradores', 'gradiente-css', 'Gradiente CSS'),
  item('geradores', 'link-whatsapp', 'Link de WhatsApp'),
  item('geradores', 'meta-tags-seo', 'Meta tags SEO'),
  item('geradores', 'politica-privacidade', 'Política de privacidade'),
  item('geradores', 'gerador-pix', 'Pix (BR Code)'),

  // ---------- validadores ----------
  item('validadores', 'email', 'E-mail'),
  item('validadores', 'url', 'URL'),
  item('validadores', 'cep', 'CEP'),
  item('validadores', 'telefone', 'Telefone'),
  item('validadores', 'cartao-credito', 'Cartão de crédito'),
  item('validadores', 'ip', 'Endereço IP'),
  item('formatadores', 'json', 'JSON'),
  item('validadores', 'xml', 'XML'),
  item('validadores', 'regex', 'Expressão regular'),
  item('validadores', 'senha-forte', 'Senha forte'),
  item('validadores', 'data', 'Data'),
  item('validadores', 'numero-primo', 'Número primo'),
  item('validadores', 'placa-veiculo', 'Placa de veículo'),
  item('validadores', 'renavam', 'RENAVAM'),
  item('validadores', 'conta-bancaria', 'Conta bancária', 'depende de regras por instituição com especificação confiável; hoje só há o IBAN'),
  item('validadores', 'chave-pix', 'Chave Pix'),
  item('validadores', 'pis-pasep', 'PIS/PASEP'),
  item('validadores', 'titulo-eleitor', 'Título de eleitor'),
  item('validadores', 'iban', 'IBAN'),
  item('validadores', 'cns', 'CNS'),

  // ---------- contadores ----------
  item('contadores', 'contador-palavras', 'Palavras'),
  item('contadores', 'dias-entre-datas', 'Dias entre datas'),
  item('contadores', 'contador-caracteres', 'Caracteres'),
  item('contadores', 'contador-linhas', 'Linhas'),
  item('contadores', 'contador-silabas', 'Sílabas'),

  // ---------- conversores ----------
  item('conversores', 'timestamp', 'Data e timestamp'),
  item('conversores', 'cores', 'Cores'),
  item('conversores', 'moeda', 'Moedas', 'exige fonte externa de cotações com data de referência (Fase 6, via API)'),
  item('conversores', 'temperatura', 'Temperatura'),
  item('conversores', 'base64', 'Base64'),
  item('conversores', 'conversor-texto', 'Texto (maiúsculas, minúsculas...)'),
  item('conversores', 'url-encode', 'URL encode/decode'),
  item('conversores', 'unidades', 'Unidades'),
  item('conversores', 'velocidade', 'Velocidade'),
  item('conversores', 'fuso-horario', 'Fuso horário'),
  item('conversores', 'tamanho-arquivo', 'Tamanho de arquivo'),
  item('conversores', 'slug', 'Slug'),
  item('conversores', 'remover-acentos', 'Removedor de acentos'),
  item('conversores', 'numero-extenso', 'Número por extenso'),
  item('conversores', 'valor-extenso', 'Valor monetário por extenso'),
  item('conversores', 'bases-numericas', 'Binário, decimal e hexadecimal'),
  item('conversores', 'json-yaml', 'JSON para YAML'),
  item('conversores', 'csv-json', 'CSV para JSON'),

  // ---------- calculadoras ----------
  ...(
    [
      ['imc', 'IMC'], ['idade', 'Idade'], ['idade-cachorro', 'Idade do cachorro'], ['ciclo-sono', 'Ciclo do sono'], ['nota-enem', 'Nota do ENEM'],
      ['juros-simples', 'Juros simples'], ['juros-compostos', 'Juros compostos'], ['regra-de-tres', 'Regra de três'],
      ['horas-trabalhadas', 'Horas trabalhadas'], ['financiamento', 'Financiamento'], ['calculadora-simples', 'Calculadora simples'],
      ['calculadora-cientifica', 'Calculadora científica'], ['desconto', 'Desconto'], ['porcentagem', 'Porcentagem'],
      ['media', 'Média'], ['calculadora-datas', 'Datas'], ['area', 'Área'], ['ascendente', 'Ascendente'],
      ['numerologia', 'Numerologia do nome'], ['volume', 'Volume'], ['salario-liquido', 'Salário líquido'],
      ['salario-pj', 'Salário líquido PJ / pró-labore'], ['consumo-combustivel', 'Consumo de combustível'],
      ['churrasco', 'Churrasco'], ['gorjeta', 'Gorjeta'], ['decimo-terceiro', 'Décimo terceiro'], ['rescisao', 'Rescisão trabalhista'],
      ['fgts', 'FGTS'], ['ferias', 'Férias'], ['calorias', 'Calorias'], ['gasolina-etanol', 'Gasolina ou etanol'],
      ['horas-extras', 'Horas extras'], ['adicional-noturno', 'Adicional noturno'], ['consignado', 'Empréstimo consignado'],
      ['inss', 'INSS'], ['aposentadoria', 'Aposentadoria'], ['inflacao', 'Inflação'], ['imposto-renda', 'Imposto de renda'],
      ['margem-lucro', 'Margem de lucro'], ['roi', 'ROI'], ['consumo-agua', 'Consumo de água'], ['tmb', 'TMB'],
      ['ovulacao', 'Ovulação'], ['gravidez', 'Gravidez'], ['peso-ideal', 'Peso ideal'], ['macronutrientes', 'Macronutrientes'],
      ['viagem', 'Viagem'], ['pizza', 'Pizza'], ['tinta', 'Tinta'], ['piso', 'Piso'], ['concreto', 'Concreto'],
      ['energia-eletrica', 'Energia elétrica'], ['internet', 'Internet (tempo de download)'], ['parcelamento', 'Parcelamento'],
      ['juros-cartao', 'Juros do cartão de crédito'], ['comissao-vendas', 'Comissão de vendas'], ['cheque-especial', 'Cheque especial'],
      ['dias-uteis', 'Dias úteis'], ['ciclo-menstrual', 'Ciclo menstrual'], ['rescisao-domestica', 'Rescisão de empregada doméstica'],
      ['vale-transporte', 'Vale-transporte'], ['expectativa-vida', 'Expectativa de vida'],
    ] as const
  ).map(([id, name]) => item('calculadoras', id, name)),

  item('calculadoras', 'pegada-carbono', 'Pegada de carbono', 'exige fatores de emissão oficiais (IPCC/MCTI) conferidos e datados antes de publicar'),

  // ---------- formatadores ----------
  item('formatadores', 'sql', 'SQL'),
  item('formatadores', 'css-minify', 'Minificador de CSS'),
  item('formatadores', 'html', 'HTML'),
  item('formatadores', 'markdown', 'Markdown'),

  // ---------- PDF ----------
  item('pdf', 'pdf-unir', 'Unir PDFs'),
  item('pdf', 'pdf-para-word', 'PDF para Word', 'exige conversão de layout fora do alcance de bibliotecas leves; avaliar serviço dedicado (Fase 6)'),
  item('pdf', 'jpg-para-pdf', 'JPG para PDF'),
  item('pdf', 'pdf-para-jpg', 'PDF para JPG'),
  item('pdf', 'pdf-comprimir', 'Comprimir PDF'),
  item('pdf', 'pdf-dividir', 'Dividir PDF'),
  item('pdf', 'word-para-pdf', 'Word para PDF', 'exige LibreOffice ou equivalente no servidor (Fase 6)'),
  item('pdf', 'pdf-proteger', 'Proteger PDF com senha'),
  item('pdf', 'pdf-remover-senha', 'Remover senha de PDF'),
  item('pdf', 'pdf-numerar-paginas', 'Numerar páginas'),

  // ---------- utilidades ----------
  item('utilidades', 'ip-publico', 'IP público', 'precisa consultar um serviço externo (Fase 6, via API)'),
  item('utilidades', 'cronometro', 'Cronômetro'),
  item('utilidades', 'temporizador', 'Temporizador'),
  item('utilidades', 'imagem-comprimir', 'Comprimir imagem'),
  item('utilidades', 'imagem-redimensionar', 'Redimensionar imagem'),
  item('utilidades', 'imagem-converter', 'Converter imagem'),
  item('utilidades', 'foto-3x4', 'Foto 3x4'),
  item('utilidades', 'roleta', 'Roleta de decisão'),
  item('utilidades', 'cara-ou-coroa', 'Cara ou coroa'),
  item('utilidades', 'dados', 'Lançamento de dados'),
  item('utilidades', 'paciencia', 'Jogo de paciência'),
  item('utilidades', 'cliques-por-segundo', 'Teste de cliques por segundo'),

  // ---------- planilhas ----------
  item('planilhas', 'planilha-gastos', 'Planilha de gastos pessoais'),
  item('planilhas', 'controle-financeiro', 'Controle financeiro'),
  item('planilhas', 'orcamento-mensal', 'Orçamento mensal'),
  item('planilhas', 'controle-aluguel', 'Controle de aluguel'),
  item('planilhas', 'controle-dividas', 'Controle de dívidas'),
  item('planilhas', 'metas-financeiras', 'Metas financeiras'),
  item('planilhas', 'controle-investimentos', 'Controle de investimentos'),
  item('planilhas', 'planilha-financeira-pessoal', 'Planilha financeira pessoal'),
];

export const roadmapIds = (): string[] => ROADMAP.map((r) => r.id);
