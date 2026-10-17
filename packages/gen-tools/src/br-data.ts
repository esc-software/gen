/** Listas usadas pelos geradores de dados fictícios. Nada aqui identifica pessoas ou endereços reais. */

export const FEMALE_NAMES = [
  'Maria', 'Ana', 'Juliana', 'Fernanda', 'Patrícia', 'Aline', 'Camila', 'Bruna', 'Larissa', 'Letícia', 'Beatriz', 'Mariana', 'Gabriela', 'Amanda', 'Luciana',
  'Renata', 'Carolina', 'Vanessa', 'Débora', 'Isabela', 'Priscila', 'Tatiane', 'Daniela', 'Raquel', 'Simone', 'Natália', 'Eduarda', 'Michele', 'Cláudia',
  'Sandra', 'Rafaela', 'Viviane', 'Thaís', 'Bianca', 'Helena', 'Luana', 'Sabrina', 'Elaine', 'Jéssica', 'Paula',
] as const;

export const MALE_NAMES = [
  'João', 'José', 'Carlos', 'Paulo', 'Pedro', 'Lucas', 'Marcos', 'Rafael', 'Gabriel', 'Felipe', 'Bruno', 'Rodrigo', 'Fernando', 'Ricardo', 'Eduardo', 'André',
  'Thiago', 'Daniel', 'Gustavo', 'Leandro', 'Diego', 'Mateus', 'Vinícius', 'Leonardo', 'Fábio', 'Renato', 'Alexandre', 'Sérgio', 'Márcio', 'Henrique',
  'Guilherme', 'Caio', 'Murilo', 'Otávio', 'Samuel', 'Davi', 'Arthur', 'Rogério', 'Wagner', 'Hugo',
] as const;

export const SURNAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida',
  'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
  'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Araújo', 'Pinto', 'Correia', 'Campos', 'Moraes', 'Cavalcanti', 'Monteiro', 'Azevedo', 'Duarte',
  'Melo', 'Borges', 'Batista', 'Reis', 'Miranda', 'Medeiros',
] as const;

export interface CityInfo {
  city: string;
  uf: string;
  ddd: string;
  state: string;
}

/** Cidades de demonstração (algumas por estado) com o DDD correspondente. */
export const CITIES: readonly CityInfo[] = [
  { city: 'São Paulo', uf: 'SP', ddd: '11', state: 'São Paulo' }, { city: 'Campinas', uf: 'SP', ddd: '19', state: 'São Paulo' }, { city: 'Santos', uf: 'SP', ddd: '13', state: 'São Paulo' },
  { city: 'Rio de Janeiro', uf: 'RJ', ddd: '21', state: 'Rio de Janeiro' }, { city: 'Niterói', uf: 'RJ', ddd: '21', state: 'Rio de Janeiro' },
  { city: 'Belo Horizonte', uf: 'MG', ddd: '31', state: 'Minas Gerais' }, { city: 'Uberlândia', uf: 'MG', ddd: '34', state: 'Minas Gerais' },
  { city: 'Vitória', uf: 'ES', ddd: '27', state: 'Espírito Santo' },
  { city: 'Porto Alegre', uf: 'RS', ddd: '51', state: 'Rio Grande do Sul' },
  { city: 'Curitiba', uf: 'PR', ddd: '41', state: 'Paraná' }, { city: 'Londrina', uf: 'PR', ddd: '43', state: 'Paraná' },
  { city: 'Florianópolis', uf: 'SC', ddd: '48', state: 'Santa Catarina' }, { city: 'Joinville', uf: 'SC', ddd: '47', state: 'Santa Catarina' },
  { city: 'Salvador', uf: 'BA', ddd: '71', state: 'Bahia' }, { city: 'Aracaju', uf: 'SE', ddd: '79', state: 'Sergipe' },
  { city: 'Recife', uf: 'PE', ddd: '81', state: 'Pernambuco' }, { city: 'Maceió', uf: 'AL', ddd: '82', state: 'Alagoas' },
  { city: 'João Pessoa', uf: 'PB', ddd: '83', state: 'Paraíba' }, { city: 'Natal', uf: 'RN', ddd: '84', state: 'Rio Grande do Norte' },
  { city: 'Fortaleza', uf: 'CE', ddd: '85', state: 'Ceará' }, { city: 'Teresina', uf: 'PI', ddd: '86', state: 'Piauí' },
  { city: 'São Luís', uf: 'MA', ddd: '98', state: 'Maranhão' }, { city: 'Belém', uf: 'PA', ddd: '91', state: 'Pará' },
  { city: 'Macapá', uf: 'AP', ddd: '96', state: 'Amapá' }, { city: 'Manaus', uf: 'AM', ddd: '92', state: 'Amazonas' },
  { city: 'Boa Vista', uf: 'RR', ddd: '95', state: 'Roraima' }, { city: 'Rio Branco', uf: 'AC', ddd: '68', state: 'Acre' },
  { city: 'Porto Velho', uf: 'RO', ddd: '69', state: 'Rondônia' }, { city: 'Palmas', uf: 'TO', ddd: '63', state: 'Tocantins' },
  { city: 'Brasília', uf: 'DF', ddd: '61', state: 'Distrito Federal' }, { city: 'Goiânia', uf: 'GO', ddd: '62', state: 'Goiás' },
  { city: 'Cuiabá', uf: 'MT', ddd: '65', state: 'Mato Grosso' }, { city: 'Campo Grande', uf: 'MS', ddd: '67', state: 'Mato Grosso do Sul' },
];

/** Faixas de CEP por UF (prefixos de 5 dígitos, inclusive), conforme a divisão dos Correios. */
export const CEP_RANGES: Record<string, [number, number][]> = {
  SP: [[1000, 19999]], RJ: [[20000, 28999]], ES: [[29000, 29999]], MG: [[30000, 39999]], BA: [[40000, 48999]], SE: [[49000, 49999]],
  PE: [[50000, 56999]], AL: [[57000, 57999]], PB: [[58000, 58999]], RN: [[59000, 59999]], CE: [[60000, 63999]], PI: [[64000, 64999]],
  MA: [[65000, 65999]], PA: [[66000, 68899]], AP: [[68900, 68999]], AM: [[69000, 69299], [69400, 69899]], RR: [[69300, 69399]],
  AC: [[69900, 69999]], DF: [[70000, 73699]], GO: [[73700, 76799]], RO: [[76800, 76999]], TO: [[77000, 77995]], MT: [[78000, 78899]],
  MS: [[79000, 79999]], PR: [[80000, 87999]], SC: [[88000, 89999]], RS: [[90000, 99999]],
};

export const STREET_TYPES = ['Rua', 'Avenida', 'Travessa', 'Alameda'] as const;
export const STREET_NAMES = [
  'das Flores', 'Sete de Setembro', 'Tiradentes', 'Getúlio Vargas', 'XV de Novembro', 'São João', 'Santos Dumont', 'Marechal Deodoro', 'Presidente Kennedy', 'Brasil',
  'das Acácias', 'dos Ipês', 'Rio Branco', 'da Independência', 'Castro Alves', 'Machado de Assis', 'Duque de Caxias', 'José Bonifácio', 'das Palmeiras', 'Santa Catarina',
  'Dom Pedro II', 'Floriano Peixoto', 'da Liberdade', 'Bela Vista', 'dos Pinheiros', 'Voluntários da Pátria', 'Ipiranga', 'Cruzeiro do Sul',
] as const;
export const NEIGHBORHOODS = ['Centro', 'Jardim das Palmeiras', 'Vila Nova', 'Bela Vista', 'Parque Industrial', 'Santa Cruz', 'São Pedro', 'Nova Esperança', 'Jardim Primavera', 'Boa Vista', 'Vila Rica', 'Alto da Colina'] as const;
export const COMPLEMENTS = ['Apto 12', 'Apto 305', 'Casa 2', 'Bloco B, Apto 41', 'Sala 8', 'Fundos', 'Cobertura'] as const;

export const COMPANY_PREFIX = ['Nova', 'Alfa', 'Ágil', 'Bom', 'Grande', 'Super', 'Mega', 'Prime', 'Central', 'Real', 'Vale', 'Sol', 'Lume', 'Ponto', 'Via', 'Aurora', 'Horizonte', 'Pioneira', 'Estrela', 'Delta', 'Vértice', 'Norte', 'Brisa'] as const;
export const COMPANY_NOUN = ['Soluções', 'Tecnologia', 'Comércio', 'Serviços', 'Consultoria', 'Distribuidora', 'Engenharia', 'Logística', 'Alimentos', 'Digital', 'Sistemas', 'Construtora', 'Embalagens', 'Móveis', 'Saúde', 'Educação', 'Energia', 'Transportes'] as const;
export const COMPANY_SUFFIX = ['Ltda', 'S.A.', 'ME', 'EPP'] as const;

export const USER_ADJECTIVES = ['rapido', 'feliz', 'azul', 'esperto', 'bravo', 'calmo', 'ninja', 'cosmico', 'noturno', 'solar', 'gentil', 'epico', 'agil', 'curioso', 'sereno', 'forte'] as const;
export const USER_NOUNS = ['gato', 'lobo', 'tigre', 'falcao', 'pixel', 'codigo', 'nuvem', 'raio', 'cometa', 'dragao', 'urso', 'coruja', 'robo', 'rio', 'vento', 'trovao'] as const;

export const NICK_PREFIX = ['Dark', 'Shadow', 'Neo', 'Cyber', 'Pixel', 'Turbo', 'Ghost', 'Toxic', 'Silent', 'Rapid', 'Iron', 'Frozen', 'Crimson', 'Atomic', 'Lunar', 'Blaze'] as const;
export const NICK_SUFFIX = ['Hunter', 'Slayer', 'Ninja', 'Wolf', 'Sniper', 'Titan', 'Blade', 'Storm', 'Phantom', 'Viper', 'Falcon', 'Reaper', 'Knight', 'Dragon', 'Rider', 'Striker'] as const;

export const SUBJECTS = ['O gato preto', 'A professora atenta', 'O vento frio', 'A cidade antiga', 'O menino curioso', 'A luz da manhã', 'O velho barqueiro', 'A engenheira cuidadosa', 'O rio calmo', 'A pequena loja', 'O vizinho gentil', 'A estudante dedicada'] as const;
export const VERBS = ['observa', 'encontrou', 'carrega', 'descobre', 'guarda', 'segue', 'prepara', 'lembra', 'escolheu', 'atravessa'] as const;
export const OBJECTS = ['a chave perdida', 'um segredo antigo', 'o caminho de casa', 'uma história nova', 'o mapa da região', 'um livro esquecido', 'a ponte de madeira', 'uma carta sem remetente', 'o relógio da praça', 'um plano simples'] as const;
export const ADVERBIALS = ['ao amanhecer', 'com calma', 'sem pressa', 'durante a tarde', 'em silêncio', 'antes do almoço', 'sob a chuva fina', 'na manhã de domingo', 'com muito cuidado', 'perto da estação'] as const;

export const BANKS: readonly { code: string; name: string }[] = [
  { code: '001', name: 'Banco do Brasil' }, { code: '033', name: 'Santander' }, { code: '104', name: 'Caixa Econômica Federal' }, { code: '237', name: 'Bradesco' },
  { code: '341', name: 'Itaú Unibanco' }, { code: '260', name: 'Nu Pagamentos (Nubank)' }, { code: '077', name: 'Banco Inter' }, { code: '336', name: 'Banco C6' },
  { code: '756', name: 'Sicoob' }, { code: '748', name: 'Sicredi' },
];
