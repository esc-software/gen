# Gen para VS Code

Ferramentas do [Gen](https://gen.esc-software.com) dentro do editor: gere CPF e CNPJ de teste, UUIDs e senhas, formate JSON e converta Base64 sem sair do VS Code. Tudo roda localmente, sem rede e sem telemetria. Código aberto (MIT).

## Instalar
Baixe o `.vsix` na [última versão](https://github.com/esc-software/gen/releases/latest) e use **Extensões → … → Instalar do VSIX…** (ou `code --install-extension gen-vscode-0.2.0.vsix`).

## Comandos (`Ctrl+Shift+P` → "Gen")
- **Executar ferramenta…**: mais de 100 ferramentas; a seleção atual entra no primeiro campo de texto; copie, insira ou abra o resultado.
- **Gerar UUID / CPF de teste / CNPJ de teste / senha forte**: inserem no cursor.
- **Codificar/Decodificar Base64, Formatar/Minificar JSON, Transformar em slug**: transformam a seleção (também no menu de contexto).

CPF e CNPJ gerados são **fictícios**, para testes. Se uma ferramenta recusar a entrada, o documento não é alterado e uma mensagem explica o motivo. Ferramentas que dependem do navegador (cronômetro, paciência, PDF para JPG) não estão disponíveis.

Documentação: https://gen.esc-software.com/vscode · Código e problemas: https://github.com/esc-software/gen · Segurança: security@esc-software.com
