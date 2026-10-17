# Como contribuir

Obrigado pelo interesse! Issues e pull requests são bem-vindos.

## Antes de começar
- Abra uma issue para mudanças grandes, para combinarmos o caminho.
- Falhas de segurança **não** vão em issue pública: veja [SECURITY.md](SECURITY.md).

## Ambiente
```sh
bun install
bun run build:libs
bun run test
bun run lint
bun run typecheck
```
Requer [Bun](https://bun.sh) e Node.js 20 ou superior. Rode tudo isso antes de abrir o pull request.

## Regras do projeto
- **Cada ferramenta** usa `defineTool` (Zod) em `packages/gen-tools/src`, com nome, descrição, documentação, exemplos e testes. `tool.run` nunca lança erro: devolve `{ ok: false, error }`.
- **Dados oficiais** (tabelas de imposto, fatores, especificações de dígito verificador) entram com **fonte e data de referência**. Não invente regras: sem especificação confiável, a ferramenta não entra.
- **Sem rede.** Nenhum código do CLI, da extensão ou das ferramentas pode fazer requisições de rede (há um teste).
- **Entrada hostil:** valide tudo, limite tamanhos e cubra com testes entradas inválidas.
- Textos em português do Brasil, em frases com só a primeira letra maiúscula, sem emojis na interface.
- Dados gerados são fictícios e devem dizer isso.

## Pull request
Descreva o que mudou e por quê, inclua testes e confirme que `test`, `lint` e `typecheck` passam. Ao contribuir, você concorda que sua contribuição será licenciada sob a licença MIT do projeto.
