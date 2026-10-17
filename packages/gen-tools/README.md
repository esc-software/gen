# @esc/gen-tools

Mais de 170 ferramentas do ESC Gen em TypeScript puro, executáveis no navegador ou no Node.js: geradores (CPF/CNPJ de teste, senhas, QR Code), validadores brasileiros e internacionais, conversores, calculadoras (incluindo folha de pagamento com tabelas 2025/2026 e fonte documentada), formatadores, planilhas, PDF e imagens.

```ts
import { registry } from '@esc/gen-tools';

const r = await registry.run('cpf', { action: 'validate', cpf: '529.982.247-25' });
if (r.ok) console.log(r.data);
```

- Cada ferramenta valida entrada e saída com Zod e nunca lança.
- Os dados gerados (CPF, CNPJ, cartões, contas) são **fictícios para teste**.
- Ferramentas de arquivo recebem `{ name, type, data }` com o conteúdo em Base64.
- Bibliotecas pesadas (exceljs, pdf-lib, bwip-js, prettier...) são carregadas só quando a ferramenta é usada.
- `sideEffects: false`: importe só o que usa.
