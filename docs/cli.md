# Gen CLI (`esc-gen`)

Ferramentas do Gen no terminal. Requer o Node.js 20 ou superior.

## Instalar
```sh
npm install -g esc-gen     # global; o comando se chama "gen"
gen --version

npx esc-gen run cpf        # ou sem instalar
```

## Comandos
| Comando | Para quê |
|---|---|
| `gen list [-q termo]` | Lista as ferramentas (com busca) |
| `gen info <ferramenta>` | Descrição, campos, tipos e padrões |
| `gen run <ferramenta> [opções]` | Executa a ferramenta |

## Entrada
- `-s, --set campo=valor` define um campo (repetível; converte pelo tipo do campo).
- `-i, --input <json>` recebe um JSON; use `-` para ler da entrada padrão.
- `-F, --input-file <arquivo>` lê o JSON de um arquivo.
- `-f, --file campo=caminho` envia arquivos (PDF, imagens) para campos de arquivo; repita para vários arquivos.

## Saída
- JSON na saída padrão; conteúdo binário é omitido do JSON.
- `--raw <campo>` imprime só aquele campo; campos binários vão crus (`gen run ... --raw pdf > saida.pdf`).
- `-o, --output <pasta>` grava os arquivos gerados; não sobrescreve sem `--force`.
- Código de saída: `0` sucesso, `1` erro de uso ou de entrada, `2` falha inesperada.

## Exemplos
```sh
gen list -q senha
gen info cpf
gen run cpf -s action=generate --raw cpf
gen run cpf -s action=validate -s cpf=529.982.247-25
gen run uuid -s count=3
echo '{"text":"oi"}' | gen run base64 -i -
gen run pdf-unir -f files=a.pdf -f files=b.pdf -o saida
gen run salario-liquido -s gross=5000
```
Use `gen info <ferramenta>` para ver os campos de cada uma.

## Limites e segurança
- Tudo roda localmente: o pacote não faz requisições de rede e não coleta telemetria.
- Ferramentas que dependem do navegador (cronômetro, paciência, PDF para JPG e outras) não existem no CLI.
- Há limites de tamanho para arquivos e para a entrada padrão (70 MB), e os nomes de arquivos gravados nunca saem da pasta escolhida.
- CPF, CNPJ e demais dados gerados são fictícios, para testes.
- Falhas de segurança: [SECURITY.md](../SECURITY.md).
