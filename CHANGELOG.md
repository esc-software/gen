# Changelog

## 0.3.0
- 16 novas ferramentas: **CLT ou PJ**, **custo de um funcionário**, **DAS MEI**, **markup e preço de venda**, **CDB, LCI/LCA e poupança**, **validador de boleto** (47, 48 e 44 dígitos), **HMAC**, **ULID**, **explicador de cron**, **chmod**, **px para rem**, **comparador de textos (diff)**, **entidades HTML**, **YAML para JSON**, **JSON para CSV** e **código Morse**. O CLI passa a ter 196 ferramentas.
- Todas rodam 100% local, sem rede, e têm testes com vetores públicos (RFC 4231 no HMAC, especificação do ULID).
- JSON para CSV protege contra injeção de fórmula; YAML para JSON limita a expansão de aliases.

## 0.2.0
- Novas ferramentas: **JWT** (gerar, decodificar e verificar com HS256, HS384 e HS512), **números da loteria**, **equação do 2º grau (Bhaskara)**, **MMC e MDC**, **números romanos**, **remover linhas duplicadas e ordenar texto** e **JSON para XML e XML para JSON**. O CLI passa a ter 180 ferramentas.
- CLI: um campo desconhecido em `-s campo=valor` agora é erro de uso (antes era ignorado e a ferramenta usava o valor padrão em silêncio). Campos desconhecidos em `-i` geram um aviso.
- Extensão: a lista de ferramentas não mostra mais emojis.
- Segurança: a verificação de JWT recusa `alg: none` e qualquer algoritmo que não seja HMAC, e não confia no protótipo do objeto do cabeçalho; XML com DOCTYPE ou ENTITY é recusado.

## 0.1.0
- Primeira versão pública: CLI (`esc-gen`), extensão do VS Code e bibliotecas.
- Mais de 170 ferramentas no terminal: geradores e validadores (CPF, CNPJ, PIS, CNH, Inscrição Estadual e outros), calculadoras trabalhistas e financeiras, conversores, formatadores, PDF, imagens e planilhas.
- Execução 100% local, sem rede e sem telemetria.
