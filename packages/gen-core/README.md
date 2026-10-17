# @esc/gen-core

Contrato das ferramentas do ESC Gen: `defineTool` (schemas Zod de entrada e saída, metadados validados na definição), `createRegistry` (busca sem acentos) e utilitários de Base64.

```ts
import { z } from 'zod';
import { defineTool, createRegistry } from '@esc/gen-core';

const dobro = defineTool({
  id: 'dobro', name: 'Dobro', description: 'Dobra um número', category: 'calculadoras',
  keywords: ['dobro'], icon: '✖️', modes: ['node'],
  inputSchema: z.object({ n: z.number() }), outputSchema: z.object({ result: z.number() }),
  execute: ({ n }) => ({ result: n * 2 }),
  documentation: 'Multiplica o número informado por dois e devolve o resultado.',
});
const registry = createRegistry();
registry.register(dobro);
await registry.run('dobro', { n: 4 }); // { ok: true, data: { result: 8 } }
```

`run` nunca lança: devolve `{ ok: true, data }` ou `{ ok: false, error: { code, message, issues } }`.
