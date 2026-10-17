import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

export interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

function parseNumberOrPercent(token: string, scale: number): number | null {
  const t = token.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)%?$/.test(t)) return null;
  return t.endsWith('%') ? (parseFloat(t) / 100) * scale : parseFloat(t);
}

/** Lê #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() e hsl()/hsla(). */
export function parseColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
  }

  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(text);
  if (!fn) return null;
  const kind = (fn[1] as string).slice(0, 3);
  const args = (fn[2] as string).split(/\s*[,/\s]\s*/).filter(Boolean);
  if (args.length < 3 || args.length > 4) return null;
  const alphaToken = args[3];
  let a = 1;
  if (alphaToken !== undefined) {
    const parsed = parseNumberOrPercent(alphaToken, 1);
    if (parsed === null) return null;
    a = clamp(parsed, 0, 1);
  }

  if (kind === 'rgb') {
    const [r, g, b] = args.slice(0, 3).map((t) => parseNumberOrPercent(t, 255));
    if (r == null || g == null || b == null) return null;
    return { r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)), a };
  }
  const h = parseNumberOrPercent((args[0] as string).replace(/deg$/, ''), 360);
  const s = parseNumberOrPercent(args[1] as string, 1);
  const l = parseNumberOrPercent(args[2] as string, 1);
  if (h === null || s === null || l === null) return null;
  const sat = (args[1] as string).endsWith('%') ? s : s / 100;
  const lig = (args[2] as string).endsWith('%') ? l : l / 100;
  return { ...hslToRgb(((h % 360) + 360) % 360, clamp(sat, 0, 1), clamp(lig, 0, 1)), a };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function rgbToCmyk({ r, g, b }: Rgba): { c: number; m: number; y: number; k: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(R, G, B);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: ((1 - R - k) / (1 - k)) * 100, m: ((1 - G - k) / (1 - k)) * 100, y: ((1 - B - k) / (1 - k)) * 100, k: k * 100 };
}

/** Luminância relativa (WCAG 2.x). */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function convertColor(input: string) {
  const rgba = parseColor(input);
  if (!rgba) throw new ToolError('Cor não reconhecida. Use #rrggbb, rgb(r, g, b) ou hsl(h, s%, l%)');
  const hsl = rgbToHsl(rgba);
  const cmyk = rgbToCmyk(rgba);
  const hasAlpha = rgba.a < 1;
  const alphaHex = hasAlpha ? hex2(Math.round(rgba.a * 255)) : '';
  const white = contrastRatio(rgba, { r: 255, g: 255, b: 255, a: 1 });
  const black = contrastRatio(rgba, { r: 0, g: 0, b: 0, a: 1 });
  return {
    hex: `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}${alphaHex}`,
    rgb: hasAlpha ? `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})` : `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`,
    hsl: hasAlpha
      ? `hsla(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%, ${rgba.a})`
      : `hsl(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%)`,
    cmyk: `cmyk(${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%)`,
    contrastWithWhite: round(white, 2),
    contrastWithBlack: round(black, 2),
    bestTextColor: white >= black ? 'branco' : 'preto',
  };
}

export const colorTool = defineTool({
  id: 'cores',
  name: 'Conversor de Cores',
  description: 'Converte cores entre HEX, RGB, HSL e CMYK e calcula o contraste com texto branco e preto',
  category: 'conversores',
  keywords: ['cor', 'cores', 'hex', 'rgb', 'hsl', 'cmyk', 'contraste', 'wcag', 'design'],
  icon: '🌈',
  modes: ['browser', 'node'],
  live: true,
  ui: 'color-swatch',
  inputSchema: z.object({ color: z.string().max(64).default('#6366f1') }),
  outputSchema: z.object({
    hex: z.string(),
    rgb: z.string(),
    hsl: z.string(),
    cmyk: z.string(),
    contrastWithWhite: z.number(),
    contrastWithBlack: z.number(),
    bestTextColor: z.string(),
  }),
  execute: ({ color }) => convertColor(color),
  fields: { color: { label: 'Cor', placeholder: '#6366f1, rgb(99, 102, 241) ou hsl(239, 84%, 67%)' } },
  outputLabels: {
    hex: 'HEX',
    rgb: 'RGB',
    hsl: 'HSL',
    cmyk: 'CMYK',
    contrastWithWhite: 'Contraste com branco',
    contrastWithBlack: 'Contraste com preto',
    bestTextColor: 'Melhor cor de texto',
  },
  examples: [
    { description: 'Vermelho puro', input: { color: '#ff0000' }, output: { rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)', cmyk: 'cmyk(0%, 100%, 100%, 0%)' } },
    { description: 'De HSL para HEX', input: { color: 'hsl(120, 100%, 25%)' }, output: { hex: '#008000' } },
  ],
  documentation:
    'Aceita HEX (3, 4, 6 ou 8 dígitos), rgb()/rgba() e hsl()/hsla(). A conversão para CMYK é matemática (sem perfil de cor), então pode diferir do resultado de impressão. O contraste usa a fórmula WCAG 2: valores a partir de 4,5 atendem o nível AA para texto normal e 7 o nível AAA.',
});
