import { z } from 'zod';
import { defineTool } from '@esc/gen-core';

export function generateUuid(): string {
  return crypto.randomUUID();
}

export const uuidTool = defineTool({
  id: 'uuid',
  name: 'Gerador de UUID',
  description: 'Gera identificadores únicos universais (UUID v4)',
  category: 'geradores',
  keywords: ['uuid', 'guid', 'identificador', 'id único'],
  icon: '🆔',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    count: z.number().int().min(1).max(100).default(1),
  }),
  outputSchema: z.object({ uuids: z.array(z.string().uuid()) }),
  execute: ({ count }) => ({ uuids: Array.from({ length: count }, generateUuid) }),
  fields: { count: { label: 'Quantidade', help: 'De 1 a 100.' } },
  outputLabels: { uuids: 'UUIDs' },
  examples: [{ description: 'Um UUID', input: { count: 1 } }],
  documentation:
    'Gera UUIDs versão 4 (aleatórios) usando o gerador criptográfico do sistema. A chance de colisão é desprezível para uso prático.',
});
