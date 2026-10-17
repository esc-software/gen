import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export interface ColorStop {
  color: string;
  position?: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Lê "#ff0000, #00f 40%, #0000ff". Só aceita cores hexadecimais: assim o CSS gerado é seguro
 * para ser aplicado em uma página (sem `url()`, `var()` ou outras funções).
 */
export function parseColorStops(text: string): ColorStop[] {
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) throw new ToolError('Informe ao menos duas cores separadas por vírgula');
  if (parts.length > 8) throw new ToolError('Use no máximo 8 cores');

  return parts.map((part) => {
    const match = /^(\S+?)(?:\s+(\d{1,3})%)?$/.exec(part);
    if (!match || !HEX.test(match[1] as string)) {
      throw new ToolError(`Cor inválida: "${part}". Use hexadecimal, como #ff0000 ou #0af`);
    }
    const stop: ColorStop = { color: (match[1] as string).toLowerCase() };
    if (match[2] !== undefined) {
      const position = Number(match[2]);
      if (position > 100) throw new ToolError(`Posição inválida em "${part}": use de 0% a 100%`);
      stop.position = position;
    }
    return stop;
  });
}

export interface GradientOptions {
  type: 'linear' | 'radial' | 'conic';
  angle: number;
  colors: string;
}

export function buildGradient({ type, angle, colors }: GradientOptions): string {
  const stops = parseColorStops(colors)
    .map((s) => (s.position === undefined ? s.color : `${s.color} ${s.position}%`))
    .join(', ');
  switch (type) {
    case 'linear':
      return `linear-gradient(${angle}deg, ${stops})`;
    case 'radial':
      return `radial-gradient(circle, ${stops})`;
    case 'conic':
      return `conic-gradient(from ${angle}deg, ${stops})`;
  }
}

export const gradientTool = defineTool({
  id: 'gradiente-css',
  name: 'Gerador de Gradiente CSS',
  description: 'Cria gradientes lineares, radiais e cônicos com pré-visualização e o código CSS pronto',
  category: 'geradores',
  keywords: ['gradiente', 'gradient', 'css', 'cores', 'background', 'degradê', 'design'],
  icon: '🎨',
  modes: ['browser', 'node'],
  live: true,
  ui: 'css-gradient',
  inputSchema: z.object({
    type: z.enum(['linear', 'radial', 'conic']).default('linear'),
    angle: z.number().int().min(0).max(360).default(90),
    colors: z.string().max(300).default('#6366f1, #ec4899'),
  }),
  outputSchema: z.object({ css: z.string(), declaration: z.string() }),
  execute: (options) => {
    const css = buildGradient(options);
    return { css, declaration: `background: ${css};` };
  },
  fields: {
    type: { label: 'Tipo', optionLabels: { linear: 'Linear', radial: 'Radial', conic: 'Cônico' } },
    angle: { label: 'Ângulo (graus)', help: 'Usado nos gradientes linear e cônico.' },
    colors: {
      label: 'Cores',
      placeholder: '#6366f1, #ec4899 60%, #f59e0b',
      help: 'Hexadecimais separadas por vírgula, cada uma com posição opcional (ex.: #ff0000 40%).',
    },
  },
  outputLabels: { css: 'Valor CSS', declaration: 'Declaração' },
  examples: [
    {
      description: 'Linear de roxo para rosa',
      input: { type: 'linear', angle: 90, colors: '#6366f1, #ec4899' },
      output: { css: 'linear-gradient(90deg, #6366f1, #ec4899)', declaration: 'background: linear-gradient(90deg, #6366f1, #ec4899);' },
    },
    {
      description: 'Cônico com posições',
      input: { type: 'conic', angle: 0, colors: '#f00, #0f0 50%, #00f' },
      output: { css: 'conic-gradient(from 0deg, #f00, #0f0 50%, #00f)', declaration: 'background: conic-gradient(from 0deg, #f00, #0f0 50%, #00f);' },
    },
  ],
  documentation:
    'Informe de 2 a 8 cores em hexadecimal (#rgb, #rrggbb ou com transparência) separadas por vírgula; posições em porcentagem são opcionais. O resultado funciona em qualquer navegador moderno. Apenas cores hexadecimais são aceitas, o que mantém o CSS gerado seguro para colar no seu projeto.',
});
