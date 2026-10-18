# Gen

**Gen** é um conjunto de ferramentas gratuitas da [ESC Software](https://esc-software.com): geradores e validadores de documentos para teste (CPF, CNPJ e outros), calculadoras trabalhistas e financeiras, conversores, formatadores e utilidades de PDF e imagem.

Este repositório reúne o que é **código aberto (MIT)**: o **CLI** (`esc-gen` no npm), a **extensão do VS Code** e as **bibliotecas** que executam as ferramentas. O site [gen.esc-software.com](https://gen.esc-software.com) usa as mesmas bibliotecas.

> English: Gen is a free toolbox from ESC Software (Brazilian document generators/validators, payroll and finance calculators, converters, PDF and image tools). This repo holds the MIT-licensed CLI (`npm install -g esc-gen`), the VS Code extension and the libraries behind them. Everything runs locally; nothing is sent to a server. Docs are in Portuguese.

## Instalar o CLI

Requer o [Node.js](https://nodejs.org) 20 ou superior.

```sh
npm install -g esc-gen
gen --version
```

Ou sem instalar:

```sh
npx esc-gen run cpf
```

Exemplos:

```sh
gen list -q senha                              # buscar ferramentas
gen info cpf                                   # campos e documentação
gen run cpf -s action=generate --raw cpf       # um CPF de teste
gen run uuid -s count=3                        # três UUIDs
echo '{"text":"oi"}' | gen run base64 -i -     # entrada pela entrada padrão
gen run pdf-unir -f files=a.pdf -f files=b.pdf -o saida
```

Guia completo: [docs/cli.md](docs/cli.md) e [gen.esc-software.com/cli](https://gen.esc-software.com/cli).

## Instalar a extensão do VS Code

1. Baixe o arquivo `gen-vscode-*.vsix` na [última versão](https://github.com/esc-software/gen/releases/latest).
2. No VS Code: **Extensões** → menu `…` → **Instalar do VSIX…** e escolha o arquivo.
   Ou pelo terminal: `code --install-extension gen-vscode-0.3.0.vsix`.
3. Abra a paleta (`Ctrl+Shift+P`) e digite **Gen**.

Guia completo: [docs/vscode.md](docs/vscode.md) e [gen.esc-software.com/vscode](https://gen.esc-software.com/vscode).

## O que tem aqui

| Pasta | O que é |
|---|---|
| `apps/cli` | O CLI (`esc-gen`, comando `gen`) |
| `apps/vscode` | A extensão do VS Code |
| `packages/gen-core` | Contrato das ferramentas (`defineTool`, registro, catálogo) |
| `packages/gen-tools` | As ferramentas |
| `packages/gen-utils`, `gen-validation` | Aleatoriedade segura e validação |
| `docs/` | Documentação e a [lista de ferramentas](docs/tools.md) |

## Privacidade e segurança
- **Tudo roda localmente.** O CLI, a extensão e as bibliotecas não fazem requisições de rede (há um teste que garante isso) e não coletam telemetria.
- Os dados gerados (CPF, CNPJ, cartões, boletos, contas, comprovantes) são **fictícios**, só para testes. Usá-los para fraude é proibido.
- Os validadores conferem a sintaxe e os dígitos verificadores; não consultam a Receita Federal nem outros órgãos.
- Vulnerabilidades: veja [SECURITY.md](SECURITY.md) (`security@esc-software.com`).

## Desenvolvimento

Requer [Bun](https://bun.sh) e Node.js 20 ou superior.

```sh
bun install
bun run build:libs      # compila as bibliotecas
bun run test            # testes
bun run lint
bun apps/cli/src/bin.ts list    # roda o CLI direto do código
bun run build:cli       # gera apps/cli/dist (o pacote do npm)
bun run package:vscode  # gera o .vsix da extensão
```

Contribuições são bem-vindas: veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença
[MIT](LICENSE). O nome "Gen" e a marca da ESC Software não fazem parte da licença do código. Avisos de bibliotecas de terceiros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
