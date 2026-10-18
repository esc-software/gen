# Catálogo de ferramentas

> Gerado do registro por `catalog-doc.ts`; não edite à mão. Para atualizar: `UPDATE_DOCS=1 bunx vitest run packages/gen-tools/src/catalog-doc.test.ts`.

**185 ferramentas.** "CLI/API" indica que a ferramenta também roda no Node (CLI, API e extensão do VS Code); as marcadas "só navegador" dependem de recursos do navegador.

## Geradores (45)

Dados de teste, identificadores, tokens e textos.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Gerador de UUID | `uuid` | Gera identificadores únicos universais (UUID v4) | navegador, CLI/API |
| Gerador de Token | `token` | Gera tokens aleatórios seguros com o tamanho e o conjunto de caracteres escolhidos | navegador, CLI/API |
| Gerador de Senhas | `senha` | Gera senhas fortes e aleatórias, com os tipos de caractere que você escolher | navegador, CLI/API |
| Gerador de Hash | `hash` | Calcula MD5, SHA-1, SHA-256, SHA-384 e SHA-512 de um texto | navegador, CLI/API |
| Gerador de Lorem Ipsum | `lorem-ipsum` | Gera texto de preenchimento com parágrafos e frases configuráveis | navegador, CLI/API |
| Gerador de Gradiente CSS | `gradiente-css` | Cria gradientes lineares, radiais e cônicos com pré-visualização e o código CSS pronto | navegador, CLI/API |
| Gerador e Validador de CPF | `cpf` | Gera CPFs sintéticos para testes e valida CPFs pelos dígitos verificadores | navegador, CLI/API |
| Gerador e Validador de CNPJ | `cnpj` | Gera CNPJs sintéticos para testes e valida CNPJs, inclusive o novo formato alfanumérico | navegador, CLI/API |
| Gerador de Pessoa Fictícia | `pessoa-ficticia` | Gera pessoas fictícias completas (nome, CPF, RG, nascimento, e-mail, telefone e endereço) para testar sistemas | navegador, CLI/API |
| Gerador e Validador de Inscrição Estadual | `inscricao-estadual` | Gera e valida inscrições estaduais sintéticas para SP, RJ, MG, PR e SC pelos dígitos verificadores | navegador, CLI/API |
| Gerador de CEP e Endereço Fictício | `endereco-ficticio` | Gera endereços brasileiros sintéticos com CEP na faixa do estado, para testes de formulários | navegador, CLI/API |
| Gerador de Nomes Aleatórios | `nome-aleatorio` | Gera nomes completos brasileiros fictícios, masculinos ou femininos | navegador, CLI/API |
| Gerador de Nome Fantasia | `nome-fantasia` | Gera nomes de empresas fictícios para projetos, protótipos e dados de teste | navegador, CLI/API |
| Gerador de E-mails Fictícios | `email-ficticio` | Gera endereços de e-mail fictícios em domínios reservados para testes, que nunca recebem mensagens reais | navegador, CLI/API |
| Gerador de Username | `username` | Sugere nomes de usuário criativos combinando adjetivos e substantivos | navegador, CLI/API |
| Gerador de Frases Aleatórias | `frase-aleatoria` | Gera frases curtas em português, com sentido e gramática corretos, para testes e preenchimento | navegador, CLI/API |
| Gerador de Números Aleatórios | `numero-aleatorio` | Sorteia números inteiros ou decimais em um intervalo, com ou sem repetição | navegador, CLI/API |
| Gerador de Nick para Jogos | `nick-jogos` | Cria nicknames para jogos online em estilos limpo, leet, com “xX” ou com sublinhado | navegador, CLI/API |
| Gerador de Placa de Veículo para Testes | `gerador-placa` | Gera placas no padrão Mercosul (ABC1D23) e no padrão antigo (ABC-1234) apenas para testes | navegador, CLI/API |
| Gerador de CNS (Cartão Nacional de Saúde) | `gerador-cns` | Gera números de CNS sintéticos, definitivos ou provisórios, com dígitos verificadores corretos | navegador, CLI/API |
| Sorteador Online | `sorteador` | Sorteia vencedores de uma lista de nomes ou embaralha a ordem, com aleatoriedade segura | navegador, CLI/API |
| Gerador de QR Code | `qr-code` | Cria QR Codes de texto, links, contatos e Wi-Fi, com cores e nível de correção de erro, em SVG | navegador, CLI/API |
| Gerador de Senha e QR Code de Wi-Fi | `senha-wifi` | Gera uma senha segura de Wi-Fi e o QR Code para visitantes conectarem sem digitar | navegador, CLI/API |
| Gerador de Código de Barras | `codigo-barras` | Gera códigos de barras Code 128, EAN-13, EAN-8, UPC-A, Code 39, ITF e ITF-14 em SVG | navegador, CLI/API |
| Gerador de Link de WhatsApp | `link-whatsapp` | Cria um link wa.me que abre uma conversa no WhatsApp com mensagem pronta, e o QR Code correspondente | navegador, CLI/API |
| Gerador de Links (UTM, e-mail, telefone e SMS) | `gerador-link` | Monta links de campanha com UTM e links de e-mail (mailto), telefone (tel) e SMS prontos para usar | navegador, CLI/API |
| Gerador de Pix Copia e Cola e QR Code | `gerador-pix` | Gera o código Pix estático (BR Code) e o QR Code a partir da sua chave, com valor e identificador opcionais | navegador, CLI/API |
| Gerador de Pix Demonstrativo | `pix-demonstrativo` | Gera um código Pix de demonstração, com chave aleatória inexistente, para testar telas e leitores de QR Code | navegador, CLI/API |
| Gerador de Cartão de Crédito Demonstrativo | `cartao-demonstrativo` | Gera números de cartão fictícios com Luhn válido, validade, CVV e titular, apenas para demonstração de formulários | navegador, CLI/API |
| Cartões de Teste de Gateways de Pagamento | `cartao-teste-pagamento` | Lista os cartões de teste publicados pelo Stripe e pelo Mercado Pago, com o cenário que cada um simula | navegador, CLI/API |
| Gerador de Conta Bancária Fictícia | `conta-bancaria-ficticia` | Gera banco, agência e conta fictícios para testar formulários e cadastros de dados bancários | navegador, CLI/API |
| Gerador de Boleto Demonstrativo | `boleto-demonstrativo` | Gera um boleto fictício (linha digitável e código de barras) com dígitos verificadores corretos, apenas para testes | navegador, CLI/API |
| Gerador de Comprovante Bancário Demonstrativo | `comprovante-demonstrativo` | Gera um comprovante de transferência fictício e claramente identificado como demonstrativo, para telas e protótipos | navegador, CLI/API |
| Gerador de Holerite Demonstrativo | `holerite-demonstrativo` | Gera um contracheque fictício com INSS e imposto de renda calculados, para protótipos e treinamento | navegador, CLI/API |
| Gerador de Assinatura de E-mail | `assinatura-email` | Cria uma assinatura de e-mail em HTML compatível com Gmail e Outlook, pronta para copiar | navegador, CLI/API |
| Gerador de Meta Tags SEO | `meta-tags-seo` | Gera title, description, canonical, Open Graph, Twitter Card e dados estruturados, com avaliação dos tamanhos | navegador, CLI/API |
| Gerador de Recibo | `recibo` | Gera um recibo de pagamento com o valor por extenso, pronto para imprimir e assinar | navegador, CLI/API |
| Gerador de Declarações | `declaracao` | Gera modelos de declaração de residência, de hipossuficiência (isenção de custas) e de renda autônoma | navegador, CLI/API |
| Gerador de Contrato a partir de Modelos | `contrato` | Gera contratos de prestação de serviços, locação residencial e compra e venda a partir das informações das partes | navegador, CLI/API |
| Gerador de Currículo | `curriculo` | Monta um currículo limpo e objetivo a partir dos seus dados, em Markdown, HTML e texto | navegador, CLI/API |
| Gerador de Política de Privacidade (LGPD) | `politica-privacidade` | Gera um modelo de política de privacidade conforme a LGPD com base nos dados que o seu site realmente coleta | navegador, CLI/API |
| Gerador de Personagens para Colorir | `personagem-colorir` | Cria desenhos de monstrinhos, robôs e gatos em linhas pretas para imprimir e colorir | navegador, CLI/API |
| Gerador de RG Demonstrativo | `rg` | Gera números de RG sintéticos no modelo de São Paulo, apenas para testar formulários | navegador, CLI/API |
| Gerador e Decodificador de JWT | `jwt` | Gera JWT assinado (HS256, HS384, HS512), decodifica o conteúdo de um token e verifica a assinatura | navegador, CLI/API |
| Gerador de Números da Loteria | `gerador-loteria` | Sorteia dezenas para Mega-Sena, Quina, Lotofácil, Dia de Sorte, Dupla Sena e Lotomania, quantas apostas você quiser | navegador, CLI/API |

## Validadores (19)

Documentos, formatos e estruturas.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Gerador e Validador de CNH | `cnh` | Gera números de CNH sintéticos para testes e valida os dígitos verificadores | navegador, CLI/API |
| Gerador e Validador de PIS/PASEP | `pis-pasep` | Gera números de PIS/PASEP sintéticos para testes e valida o dígito verificador | navegador, CLI/API |
| Validador de Título de Eleitor | `titulo-eleitor` | Valida o número do título de eleitor e identifica a unidade da federação de emissão | navegador, CLI/API |
| Validador de CNS (Cartão Nacional de Saúde) | `cns` | Valida o número do Cartão Nacional de Saúde, definitivo ou provisório | navegador, CLI/API |
| Validador de RENAVAM | `renavam` | Valida o código RENAVAM de veículos pelo dígito verificador | navegador, CLI/API |
| Validador de Placa de Veículo | `placa-veiculo` | Valida placas no padrão antigo (ABC-1234) e Mercosul (ABC1D23) e mostra a equivalência | navegador, CLI/API |
| Validador de CEP | `cep` | Valida o formato do CEP e formata com hífen | navegador, CLI/API |
| Validador de Telefone | `telefone` | Valida telefones brasileiros fixos e celulares, com DDD e prefixo +55 opcionais | navegador, CLI/API |
| Validador de Chave Pix | `chave-pix` | Identifica o tipo da chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória) e valida o formato | navegador, CLI/API |
| Validador de E-mail | `email` | Valida a sintaxe de endereços de e-mail e aponta o motivo da rejeição | navegador, CLI/API |
| Validador de URL | `url` | Valida URLs e separa protocolo, domínio, porta, caminho, parâmetros e âncora | navegador, CLI/API |
| Validador de Endereço IP | `ip` | Valida endereços IPv4 e IPv6 e identifica o tipo (público, privado, loopback...) | navegador, CLI/API |
| Validador de Cartão de Crédito | `cartao-credito` | Valida o número de um cartão pelo algoritmo de Luhn e identifica a bandeira pelo prefixo | navegador, CLI/API |
| Validador de IBAN | `iban` | Valida o International Bank Account Number pelo tamanho do país e pelo dígito de controle (mod 97) | navegador, CLI/API |
| Validador de XML | `xml` | Verifica se um XML é bem formado e indica a linha e a coluna do erro | navegador, CLI/API |
| Validador de Data | `data` | Valida datas (DD/MM/AAAA ou AAAA-MM-DD) e mostra o dia da semana e se o ano é bissexto | navegador, CLI/API |
| Verificador de Número Primo | `numero-primo` | Verifica se um número é primo e, se não for, mostra a decomposição em fatores primos | navegador, CLI/API |
| Verificador de Senha Forte | `senha-forte` | Avalia a força de uma senha e aponta o que melhorar, sem enviá-la a nenhum servidor | navegador, CLI/API |
| Testador de Expressões Regulares | `regex` | Valida uma expressão regular (JavaScript) e mostra as correspondências e os grupos capturados | navegador, CLI/API |

## Contadores (5)

Palavras, caracteres, linhas e datas.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Contador de Palavras | `contador-palavras` | Conta palavras, palavras únicas e estima o tempo de leitura enquanto você digita | navegador, CLI/API |
| Contador de Caracteres | `contador-caracteres` | Conta caracteres, com e sem espaços, e mostra pontos de código, unidades UTF-16 e bytes | navegador, CLI/API |
| Contador de Linhas | `contador-linhas` | Conta as linhas de um texto, separando as vazias das preenchidas | navegador, CLI/API |
| Contador de Sílabas | `contador-silabas` | Estima o número de sílabas de palavras e textos em português | navegador, CLI/API |
| Contador de Dias entre Datas | `dias-entre-datas` | Calcula quantos dias, semanas, meses e anos existem entre duas datas | navegador, CLI/API |

## Conversores (19)

Codificações, unidades, datas e formatos.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Conversor de Data e Timestamp | `timestamp` | Converte timestamp Unix em data e hora, e data e hora em timestamp, com fuso horário e horário de verão | navegador, CLI/API |
| Conversor de Fuso Horário | `fuso-horario` | Converte uma data e hora de um fuso horário para outro, considerando o horário de verão | navegador, CLI/API |
| Conversor de Cores | `cores` | Converte cores entre HEX, RGB, HSL e CMYK e calcula o contraste com texto branco e preto | navegador, CLI/API |
| Conversor de Unidades | `unidades` | Converte comprimento, massa, volume, área, tempo, pressão, energia e potência | navegador, CLI/API |
| Conversor de Velocidade | `velocidade` | Converte entre m/s, km/h, mph, nós e pés por segundo | navegador, CLI/API |
| Conversor de Texto | `conversor-texto` | Maiúsculas, minúsculas, capitalização, camelCase, snake_case, limpeza de espaços e linhas | navegador, CLI/API |
| Removedor de Acentos | `remover-acentos` | Remove acentos, cedilhas e outros sinais diacríticos de um texto | navegador, CLI/API |
| Número por Extenso | `numero-extenso` | Escreve um número inteiro por extenso em português, no masculino ou no feminino | navegador, CLI/API |
| Valor Monetário por Extenso | `valor-extenso` | Escreve um valor em reais por extenso, com centavos, como em cheques e recibos | navegador, CLI/API |
| JSON para YAML | `json-yaml` | Converte JSON em YAML legível, preservando a estrutura e os tipos | navegador, CLI/API |
| CSV para JSON | `csv-json` | Converte CSV em JSON, com detecção de delimitador e conversão opcional de números e booleanos | navegador, CLI/API |
| Conversor Base64 | `base64` | Codifica texto em Base64 e decodifica Base64 em texto (UTF-8) | navegador, CLI/API |
| Gerador de Slug | `slug` | Transforma um texto em um slug para URLs: sem acentos, sem espaços e sem símbolos | navegador, CLI/API |
| Conversor de Temperatura | `temperatura` | Converte entre Celsius, Fahrenheit e Kelvin | navegador, CLI/API |
| Conversor de Tamanho de Arquivo | `tamanho-arquivo` | Converte entre bytes, KB, MB, GB, TB e PB, no padrão decimal (1000) ou binário (1024) | navegador, CLI/API |
| Conversor Binário, Decimal e Hexadecimal | `bases-numericas` | Converte números entre as bases 2, 8, 10 e 16, sem limite de tamanho | navegador, CLI/API |
| Codificador e Decodificador de URL | `url-encode` | Codifica e decodifica texto em formato de URL (percent-encoding) | navegador, CLI/API |
| Conversor de Números Romanos | `numeros-romanos` | Converte números arábicos em romanos e romanos em arábicos, de 1 a 3999 | navegador, CLI/API |
| Conversor de JSON para XML e XML para JSON | `json-xml` | Converte JSON em XML e XML em JSON, com indentação opcional e validação com linha e coluna do erro | navegador, CLI/API |

## Calculadoras (64)

Finanças, saúde, trabalho e dia a dia.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Calculadora Simples | `calculadora-simples` | Resolve expressões com soma, subtração, multiplicação, divisão, potência e parênteses | navegador, CLI/API |
| Calculadora Científica | `calculadora-cientifica` | Funções trigonométricas, logaritmos, raízes, fatorial e constantes, com radianos ou graus | navegador, CLI/API |
| Calculadora de Porcentagem | `porcentagem` | Calcula porcentagem de um valor, quanto um valor representa de outro, variação, acréscimo e desconto | navegador, CLI/API |
| Regra de Três | `regra-de-tres` | Resolve regra de três simples, direta ou inversamente proporcional | navegador, CLI/API |
| Calculadora de Média | `media` | Média aritmética, ponderada, geométrica e harmônica, com mediana, moda e desvio padrão | navegador, CLI/API |
| Calculadora de Desconto | `desconto` | Calcula o preço final, a economia e o percentual de um desconto | navegador, CLI/API |
| Calculadora de Gorjeta | `gorjeta` | Calcula a gorjeta, o total da conta e a divisão por pessoa | navegador, CLI/API |
| Calculadora de Área | `area` | Calcula a área e o perímetro de retângulos, triângulos, círculos, trapézios e outras figuras planas | navegador, CLI/API |
| Calculadora de Volume | `volume` | Calcula o volume de cubos, caixas, cilindros, cones, esferas e pirâmides, com a capacidade em litros | navegador, CLI/API |
| Calculadora de Juros Simples | `juros-simples` | Calcula juros e montante pelo regime de juros simples | navegador, CLI/API |
| Calculadora de Juros Compostos | `juros-compostos` | Calcula o montante com juros compostos e aportes mensais, e converte taxas equivalentes | navegador, CLI/API |
| Calculadora de Financiamento | `financiamento` | Simula financiamentos nos sistemas Price (parcelas fixas) e SAC (amortização constante) | navegador, CLI/API |
| Calculadora de Parcelamento | `parcelamento` | Calcula parcelas com ou sem juros e descobre a taxa de juros embutida em um parcelamento | navegador, CLI/API |
| Calculadora de Juros do Cartão de Crédito | `juros-cartao` | Mostra quanto a dívida do cartão cresce com os juros do rotativo e em quanto tempo ela é quitada com uma parcela fixa | navegador, CLI/API |
| Calculadora de Cheque Especial | `cheque-especial` | Calcula os juros do cheque especial pelo número de dias em que o limite foi usado | navegador, CLI/API |
| Calculadora de Empréstimo Consignado | `consignado` | Calcula a parcela do consignado e a margem consignável da sua renda | navegador, CLI/API |
| Calculadora de Inflação | `inflacao` | Acumula taxas mensais de inflação e corrige valores, a partir dos índices que você informar | navegador, CLI/API |
| Calculadora de Margem de Lucro e Markup | `margem-lucro` | Calcula margem, markup e lucro, ou o preço de venda a partir do custo e da margem desejada | navegador, CLI/API |
| Calculadora de ROI | `roi` | Calcula o retorno sobre investimento e as taxas mensal e anual equivalentes | navegador, CLI/API |
| Calculadora de Comissão de Vendas | `comissao-vendas` | Calcula a comissão sobre vendas, o salário fixo somado e o descanso semanal remunerado (DSR) da comissão | navegador, CLI/API |
| Calculadora de Consumo de Combustível | `consumo-combustivel` | Calcula quantos quilômetros o veículo faz por litro e o custo por quilômetro | navegador, CLI/API |
| Gasolina ou Etanol: o que compensa? | `gasolina-etanol` | Compara os preços e indica o combustível mais econômico pela relação de rendimento | navegador, CLI/API |
| Calculadora de Custo de Viagem | `viagem` | Estima combustível, pedágios, custo total, divisão por pessoa e tempo de viagem | navegador, CLI/API |
| Calculadora de Consumo de Água | `consumo-agua` | Estima o consumo diário e mensal de água da casa pelos hábitos de banho, descarga, lavagens e outros usos | navegador, CLI/API |
| Calculadora de Consumo de Energia Elétrica | `energia-eletrica` | Estima o consumo em kWh e o custo mensal de cada aparelho e da casa | navegador, CLI/API |
| Calculadora de Tempo de Download | `internet` | Calcula quanto tempo leva para baixar um arquivo na velocidade da sua internet | navegador, CLI/API |
| Calculadora de Tinta | `tinta` | Calcula quantos litros de tinta e quais latas comprar para pintar um cômodo | navegador, CLI/API |
| Calculadora de Piso e Revestimento | `piso` | Calcula a quantidade de peças e caixas de piso ou revestimento, com a margem de perda | navegador, CLI/API |
| Calculadora de Concreto | `concreto` | Estima o volume de concreto de uma laje, sapata ou piso e as quantidades de cimento, areia, brita e água | navegador, CLI/API |
| Calculadora de Pizza | `pizza` | Calcula quantas pizzas pedir para o grupo e compara qual tamanho compensa mais pelo preço | navegador, CLI/API |
| Calculadora de Churrasco | `churrasco` | Estima carne, acompanhamentos, carvão e bebidas para o número de convidados | navegador, CLI/API |
| Calculadora de Horas Trabalhadas | `horas-trabalhadas` | Soma as horas trabalhadas a partir dos horários de entrada, saída e intervalos de cada dia | navegador, CLI/API |
| Calculadora de Datas | `calculadora-datas` | Soma ou subtrai anos, meses, semanas e dias a uma data e mostra o dia da semana do resultado | navegador, CLI/API |
| Calculadora de Dias Úteis | `dias-uteis` | Conta os dias úteis entre duas datas, descontando fins de semana e feriados nacionais | navegador, CLI/API |
| Calculadora de Idade | `idade` | Calcula a idade exata em anos, meses e dias e quanto falta para o próximo aniversário | navegador, CLI/API |
| Calculadora de Ciclos de Sono | `ciclo-sono` | Sugere horários para dormir ou acordar em múltiplos de ciclos de sono de 90 minutos | navegador, CLI/API |
| Calculadora de IMC | `imc` | Calcula o Índice de Massa Corporal e a faixa de peso saudável para a sua altura | navegador, CLI/API |
| Calculadora de TMB (Taxa Metabólica Basal) | `tmb` | Calcula a energia que o corpo gasta em repouso e o gasto diário total conforme o nível de atividade | navegador, CLI/API |
| Calculadora de Calorias | `calorias` | Estima a meta diária de calorias para o seu objetivo e as calorias gastas em uma atividade física | navegador, CLI/API |
| Calculadora de Peso Ideal | `peso-ideal` | Estima o peso ideal por quatro fórmulas clássicas e pela faixa de IMC saudável | navegador, CLI/API |
| Calculadora de Macronutrientes | `macronutrientes` | Distribui as calorias do dia em gramas de carboidratos, proteínas e gorduras | navegador, CLI/API |
| Calculadora de Gravidez | `gravidez` | Estima a data provável do parto e a idade gestacional a partir da data da última menstruação | navegador, CLI/API |
| Calculadora de Ovulação e Período Fértil | `ovulacao` | Estima o dia da ovulação e a janela fértil dos próximos ciclos | navegador, CLI/API |
| Calculadora de Ciclo Menstrual | `ciclo-menstrual` | Prevê as próximas menstruações e mostra as fases do ciclo atual | navegador, CLI/API |
| Calculadora de Idade do Cachorro | `idade-cachorro` | Converte a idade do cachorro em idade humana pela regra por porte e pela fórmula do relógio epigenético | navegador, CLI/API |
| Numerologia do Nome | `numerologia` | Calcula os números de expressão, alma e personalidade do nome (tabela pitagórica) e o caminho de vida | navegador, CLI/API |
| Calculadora de Ascendente | `ascendente` | Calcula o signo ascendente e o signo solar a partir da data, hora e local de nascimento | navegador, CLI/API |
| Calculadora de Nota do ENEM | `nota-enem` | Calcula a média simples e a média ponderada das cinco notas do ENEM com os pesos do curso | navegador, CLI/API |
| Calculadora de Expectativa de Vida | `expectativa-vida` | Mostra quantos dias você já viveu e a expectativa de vida restante, pela média da população brasileira (IBGE) | navegador, CLI/API |
| Calculadora de Equação do 2º Grau (Bhaskara) | `equacao-segundo-grau` | Resolve equações do 2º grau pela fórmula de Bhaskara, mostrando o delta, as raízes e o passo a passo | navegador, CLI/API |
| Calculadora de MMC e MDC | `mmc-mdc` | Calcula o mínimo múltiplo comum (MMC) e o máximo divisor comum (MDC) de dois ou mais números, com a fatoração | navegador, CLI/API |
| Calculadora de INSS | `inss` | Calcula a contribuição ao INSS do empregado, do autônomo, do plano simplificado e do MEI | navegador, CLI/API |
| Calculadora de Imposto de Renda (mensal, na fonte) | `imposto-renda` | Calcula o imposto de renda retido na fonte sobre salário, com dependentes, pensão e a redução da Lei 15.270/2025 | navegador, CLI/API |
| Calculadora de Salário Líquido (CLT) | `salario-liquido` | Calcula o salário líquido a partir do bruto, descontando INSS, imposto de renda, vale-transporte e outros descontos | navegador, CLI/API |
| Calculadora de Décimo Terceiro Salário | `decimo-terceiro` | Calcula o 13º proporcional, a primeira parcela, a segunda parcela e os descontos de INSS e imposto de renda | navegador, CLI/API |
| Calculadora de Férias | `ferias` | Calcula o valor das férias com o terço constitucional, o abono pecuniário e os descontos | navegador, CLI/API |
| Calculadora de FGTS | `fgts` | Projeta o saldo do FGTS com os depósitos mensais de 8% e calcula a multa de 40% ou 20% na demissão | navegador, CLI/API |
| Calculadora de Vale-Transporte | `vale-transporte` | Calcula o custo do vale-transporte e o desconto de até 6% do salário do empregado | navegador, CLI/API |
| Calculadora de Horas Extras | `horas-extras` | Calcula o valor das horas extras a 50% e a 100% e o reflexo no descanso semanal remunerado | navegador, CLI/API |
| Calculadora de Adicional Noturno | `adicional-noturno` | Calcula o adicional noturno de 20% e a hora noturna reduzida (52min30s) para trabalho entre 22h e 5h | navegador, CLI/API |
| Calculadora de Rescisão Trabalhista (CLT) | `rescisao` | Calcula as verbas rescisórias: saldo de salário, aviso prévio, 13º e férias proporcionais, multa do FGTS e descontos | navegador, CLI/API |
| Calculadora de Rescisão de Empregada Doméstica | `rescisao-domestica` | Calcula as verbas rescisórias da empregada doméstica, com o fundo de 3,2% no lugar da multa do FGTS | navegador, CLI/API |
| Calculadora de Aposentadoria (INSS) | `aposentadoria` | Verifica a elegibilidade pelas regras permanente e de transição por pontos e idade mínima da Reforma da Previdência e estima a data e o valor | navegador, CLI/API |
| Calculadora de Salário Líquido PJ e Pró-labore | `salario-pj` | Estima impostos e o ganho líquido de quem fatura como MEI ou como empresa no Simples Nacional, com pró-labore e distribuição de lucros | navegador, CLI/API |

## Formatadores (6)

JSON, SQL, HTML, CSS e Markdown.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Remover Linhas Duplicadas e Ordenar Texto | `linhas-texto` | Remove linhas duplicadas ou vazias, ordena em ordem alfabética ou numérica, inverte e embaralha as linhas de uma lista | navegador, CLI/API |
| Formatador e Validador de JSON | `json` | Formata, minifica e valida JSON, indicando a linha e a coluna de cada erro | navegador, CLI/API |
| Formatador de SQL | `sql` | Formata consultas SQL com indentação, quebras de linha e caixa das palavras-chave, para vários dialetos | navegador, CLI/API |
| Minificador de CSS | `css-minify` | Reduz o tamanho do CSS removendo espaços, comentários e redundâncias, sem alterar o resultado visual | navegador, CLI/API |
| Formatador de HTML | `html` | Indenta e organiza código HTML, mantendo blocos <pre>, <code> e <textarea> intactos | navegador, CLI/API |
| Formatador de Markdown | `markdown` | Padroniza listas, títulos, tabelas, espaçamento e quebras de linha em documentos Markdown | navegador, CLI/API |

## Ferramentas PDF (8)

Unir, dividir, converter e proteger PDFs.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Unir PDFs | `pdf-unir` | Junta vários arquivos PDF em um só, na ordem em que você os enviar | navegador, CLI/API |
| Dividir PDF | `pdf-dividir` | Extrai páginas ou divide um PDF por intervalos, a cada N páginas ou página por página | navegador, CLI/API |
| Numerar Páginas de PDF | `pdf-numerar-paginas` | Adiciona a numeração de páginas em um PDF, com posição, formato e número inicial à sua escolha | navegador, CLI/API |
| JPG para PDF | `jpg-para-pdf` | Converte fotos JPG e PNG em um PDF, uma por página, com tamanho de página e margens à sua escolha | navegador, CLI/API |
| Comprimir PDF | `pdf-comprimir` | Reduz o tamanho de PDFs com fotos e digitalizações recomprimindo as imagens JPEG internas | navegador, CLI/API |
| Proteger PDF com Senha | `pdf-proteger` | Criptografa um PDF com senha (AES-256) e define se o documento pode ser impresso, copiado ou editado | navegador, CLI/API |
| Remover Senha de PDF | `pdf-remover-senha` | Gera uma cópia sem senha de um PDF protegido, desde que você informe a senha correta | navegador, CLI/API |
| PDF para JPG | `pdf-para-jpg` | Converte as páginas de um PDF em imagens JPG, em um ZIP, com a resolução que você escolher | só navegador |

## Utilidades (11)

Imagens, cronômetros, sorteios e mais.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Comprimir Imagem | `imagem-comprimir` | Reduz o tamanho de fotos JPG e PNG ajustando a qualidade e, se quiser, a dimensão máxima | navegador, CLI/API |
| Redimensionar Imagem | `imagem-redimensionar` | Muda a largura e a altura de uma imagem em pixels ou em porcentagem, mantendo a proporção | navegador, CLI/API |
| Converter Imagem | `imagem-converter` | Converte imagens entre JPG e PNG, com fundo configurável para transparências | navegador, CLI/API |
| Foto 3x4 | `foto-3x4` | Recorta uma foto na proporção 3x4 e monta uma folha 10x15 cm pronta para imprimir várias fotos | navegador, CLI/API |
| Roleta de Decisão | `roleta` | Sorteia uma opção entre as que você escrever, com resultado justo e aleatório | navegador, CLI/API |
| Cara ou Coroa | `cara-ou-coroa` | Joga uma ou várias moedas virtuais e mostra quantas deram cara e quantas deram coroa | navegador, CLI/API |
| Lançamento de Dados | `dados` | Lança dados de 4, 6, 8, 10, 12, 20 faces ou personalizados, com modificador, para jogos de tabuleiro e RPG | navegador, CLI/API |
| Temporizador | `temporizador` | Contagem regressiva com alerta sonoro e visual ao terminar | só navegador |
| Cronômetro | `cronometro` | Cronômetro com marcação de voltas, preciso em milissegundos | só navegador |
| Teste de Cliques por Segundo | `cliques-por-segundo` | Mede quantos cliques você consegue dar em alguns segundos (CPS) | só navegador |
| Jogo de Paciência | `paciencia` | Paciência clássica (Klondike) para jogar no navegador, comprando 1 ou 3 cartas | só navegador |

## Planilhas (8)

Modelos prontos em XLSX e CSV.

| Ferramenta | Id | O que faz | Onde roda |
|---|---|---|---|
| Planilha de Gastos Pessoais | `planilha-gastos` | Gera uma planilha para registrar gastos por categoria e forma de pagamento, com resumo automático | navegador, CLI/API |
| Planilha de Controle Financeiro | `controle-financeiro` | Gera o fluxo de caixa do ano, mês a mês, com saldo do mês e saldo acumulado | navegador, CLI/API |
| Planilha de Orçamento Mensal | `orcamento-mensal` | Gera um orçamento mensal com planejado versus realizado por categoria e alertas de estouro | navegador, CLI/API |
| Planilha de Controle de Aluguel | `controle-aluguel` | Gera o controle das parcelas de aluguel com reajuste anual, atraso, multa, juros e saldo | navegador, CLI/API |
| Planilha de Controle de Dívidas | `controle-dividas` | Gera uma planilha para listar dívidas, calcular parcelas e saldo devedor e priorizar o pagamento pela maior taxa | navegador, CLI/API |
| Planilha de Metas Financeiras | `metas-financeiras` | Gera uma planilha de metas com prazo, quanto guardar por mês (com e sem rendimento) e progresso | navegador, CLI/API |
| Planilha de Controle de Investimentos | `controle-investimentos` | Gera uma planilha da carteira com valor investido, valor atual, resultado e alocação por tipo de ativo | navegador, CLI/API |
| Planilha Financeira Pessoal Completa | `planilha-financeira-pessoal` | Gera uma planilha completa com receitas, despesas, resumo mensal, taxa de poupança e patrimônio | navegador, CLI/API |

## Ainda não implementadas (6)

| Ferramenta | Motivo |
|---|---|
| Conta bancária (`conta-bancaria`) | depende de regras por instituição com especificação confiável; hoje só há o IBAN |
| Moedas (`moeda`) | exige fonte externa de cotações com data de referência (Fase 6, via API) |
| Pegada de carbono (`pegada-carbono`) | exige fatores de emissão oficiais (IPCC/MCTI) conferidos e datados antes de publicar |
| PDF para Word (`pdf-para-word`) | exige conversão de layout fora do alcance de bibliotecas leves; avaliar serviço dedicado (Fase 6) |
| Word para PDF (`word-para-pdf`) | exige LibreOffice ou equivalente no servidor (Fase 6) |
| IP público (`ip-publico`) | precisa consultar um serviço externo (Fase 6, via API) |
