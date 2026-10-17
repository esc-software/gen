# esc-gen

Ferramentas do [Gen](https://gen.esc-software.com), da ESC Software, no terminal: geradores e validadores de documentos para teste (CPF, CNPJ e outros), calculadoras, conversores, formatadores, PDF e imagens. Execução 100% local, sem rede e sem telemetria. Código aberto (MIT).

Requer o Node.js 20 ou superior.

```sh
npm install -g esc-gen
gen --version
gen list -q senha                              # buscar
gen info cpf                                   # campos e documentação
gen run cpf -s action=generate --raw cpf       # um CPF de teste
gen run uuid -s count=3
echo '{"text":"oi"}' | gen run base64 -i -
gen run pdf-unir -f files=a.pdf -f files=b.pdf -o saida
```

- `-s campo=valor`, `-i <json>` (ou `-` para a entrada padrão), `-F <arquivo>` e `-f campo=caminho` definem a entrada.
- A saída é JSON; `--raw <campo>` imprime só um campo; `-o <pasta>` grava os arquivos gerados.
- Código de saída: 0 sucesso, 1 erro de uso ou de entrada, 2 falha inesperada.

Os CPFs, CNPJs e demais dados gerados são **fictícios**, para testes. Documentação: https://gen.esc-software.com/cli. Código e problemas: https://github.com/esc-software/gen. Segurança: security@esc-software.com.
