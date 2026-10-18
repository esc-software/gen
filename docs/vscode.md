# Gen para VS Code

Geradores, validadores e conversores do Gen dentro do editor. Requer o Visual Studio Code 1.90 ou superior.

## Instalar
1. Baixe o arquivo `gen-vscode-*.vsix` na [última versão](https://github.com/esc-software/gen/releases/latest).
2. No VS Code, abra **Extensões** (`Ctrl+Shift+X`), clique nos três pontos do canto superior e escolha **Instalar do VSIX…**; selecione o arquivo.
   Pelo terminal: `code --install-extension gen-vscode-0.2.0.vsix`.
3. Reinicie o VS Code se ele pedir.

## Comandos (`Ctrl+Shift+P`, digite "Gen")
- **Executar ferramenta…**: escolha entre mais de 100 ferramentas, preencha os campos (a seleção atual entra no primeiro campo de texto) e copie, insira ou abra o resultado. Arquivos (PDF, imagens) são escolhidos pelo seletor, e arquivos gerados são salvos pelo diálogo "Salvar como".
- **Gerar UUID, CPF de teste, CNPJ de teste, senha forte**: inserem no cursor (em todas as seleções, se houver várias).
- **Codificar e decodificar Base64, formatar e minificar JSON, transformar em slug**: transformam a seleção; também aparecem no menu de contexto do editor.

Se uma ferramenta recusar a entrada, o documento não é alterado e uma mensagem explica o motivo.

## Privacidade e limites
- Nada sai da sua máquina: a extensão não faz requisições de rede e não coleta telemetria.
- Funciona em pastas não confiáveis e em espaços de trabalho virtuais.
- Ferramentas que dependem do navegador (cronômetro, paciência, PDF para JPG) não estão disponíveis.
- A extensão ocupa cerca de 4 MB porque inclui o catálogo inteiro, para funcionar offline.
- CPF e CNPJ gerados são fictícios, para testes.

## Gerar o .vsix a partir do código
```sh
bun install
bun run build:libs
bun run package:vscode     # cria apps/vscode/gen-vscode-<versão>.vsix
```
