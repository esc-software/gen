# Política de segurança

## Reportar uma vulnerabilidade
Escreva para **security@esc-software.com** (ou use o relato privado de vulnerabilidades do GitHub, em *Security → Report a vulnerability*). Não abra uma issue pública com detalhes de uma falha.

Inclua, se puder: a versão (`gen --version` ou a versão da extensão), o sistema operacional, os passos para reproduzir e o impacto que você enxerga. Respondemos o mais rápido possível e agradecemos a divulgação responsável: pedimos um prazo razoável para corrigir antes de qualquer divulgação pública.

## Versões com correções de segurança
Apenas a versão mais recente do CLI (`esc-gen` no npm) e da extensão recebe correções.

## O que o projeto garante (e o que não)
- O CLI e a extensão executam **localmente** e não fazem requisições de rede. Isso é conferido por teste: nenhum código do CLI, da extensão ou das ferramentas usa `fetch`, `http`, `https`, `net` ou WebSocket.
- Entradas são validadas com Zod; há limites de tamanho para arquivos e leitura da entrada padrão; nomes de arquivos gravados pelo CLI nunca saem da pasta escolhida.
- Os dados gerados (CPF, CNPJ, cartões, boletos etc.) são **fictícios**, para testes. Usá-los para fraude é proibido.
- O pacote npm não executa scripts na instalação (sem `postinstall`).
- Os validadores conferem a sintaxe e os dígitos verificadores; não consultam órgãos oficiais.

## Escopo
Vulnerabilidades no CLI, na extensão e nas bibliotecas deste repositório. O site gen.esc-software.com e a infraestrutura da ESC Software ficam fora deste repositório; relate-os ao mesmo endereço.
