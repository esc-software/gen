import { z } from 'zod';
import { defineTool } from '@esc/gen-core';
import { createRng, type Rng } from '@esc/gen-utils';
import { svgToDataUrl } from './codes.js';

/**
 * Personagens para colorir desenhados por código (formas geométricas simples), portanto
 * originais: não derivam de imagens, personagens ou obras de terceiros.
 */

const STROKE = 'stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="#fff"';
const LINE = 'stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"';

const f = (n: number) => String(Math.round(n * 10) / 10);

function eyes(rng: Rng, cx: number, cy: number, spread: number, count: number): string {
  const out: string[] = [];
  const r = 16 + rng.int(10);
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? cx : cx - spread + (i * 2 * spread) / (count - 1);
    out.push(`<circle cx="${f(x)}" cy="${f(cy)}" r="${r}" ${STROKE}/>`, `<circle cx="${f(x + rng.between(-4, 4))}" cy="${f(cy + rng.between(-3, 3))}" r="${f(r / 3)}" fill="#111"/>`);
  }
  return out.join('');
}

function monster(rng: Rng): string {
  const parts: string[] = [];
  const bumps = rng.between(7, 11);
  const cx = 200;
  const cy = 215;
  const pts: string[] = [];
  for (let i = 0; i <= bumps * 2; i++) {
    const angle = (i / (bumps * 2)) * Math.PI * 2;
    const rx = 105 + (i % 2 === 0 ? rng.between(12, 20) : 0);
    const ry = 120 + (i % 2 === 0 ? rng.between(12, 20) : 0);
    pts.push(`${f(cx + Math.cos(angle) * rx)},${f(cy + Math.sin(angle) * ry)}`);
  }
  parts.push(`<polygon points="${pts.join(' ')}" ${STROKE}/>`);
  if (rng.chance(0.7)) {
    for (const side of [-1, 1]) parts.push(`<polygon points="${f(cx + side * 55)},110 ${f(cx + side * 85)},45 ${f(cx + side * 25)},105" ${STROKE}/>`);
  }
  parts.push(eyes(rng, cx, 190, 45, rng.between(1, 3)));
  const teeth = rng.between(4, 7);
  const zig = Array.from({ length: teeth * 2 + 1 }, (_, i) => `${f(cx - 60 + (i * 120) / (teeth * 2))},${i % 2 === 0 ? 265 : 290}`).join(' ');
  parts.push(`<polygon points="${zig} ${f(cx + 60)},265" ${STROKE}/>`);
  for (let i = 0; i < rng.between(2, 5); i++) parts.push(`<circle cx="${rng.between(120, 280)}" cy="${rng.between(310, 340)}" r="${rng.between(6, 12)}" ${LINE}/>`);
  for (const side of [-1, 1]) {
    parts.push(`<path d="M${cx + side * 100},230 q${side * 55},${rng.between(-30, 20)} ${side * 70},${rng.between(30, 60)}" ${LINE}/>`);
    parts.push(`<ellipse cx="${cx + side * 55}" cy="352" rx="32" ry="14" ${STROKE}/>`);
  }
  return parts.join('');
}

function robot(rng: Rng): string {
  const parts: string[] = [];
  parts.push(`<line x1="200" y1="55" x2="200" y2="95" ${LINE}/>`, `<circle cx="200" cy="45" r="${rng.between(10, 16)}" ${STROKE}/>`);
  parts.push(`<rect x="110" y="95" width="180" height="125" rx="${rng.between(10, 32)}" ${STROKE}/>`);
  const square = rng.chance(0.5);
  for (const x of [155, 245]) {
    parts.push(square ? `<rect x="${x - 20}" y="125" width="40" height="40" rx="6" ${STROKE}/>` : `<circle cx="${x}" cy="145" r="22" ${STROKE}/>`, `<circle cx="${x + rng.between(-5, 5)}" cy="${145 + rng.between(-4, 4)}" r="7" fill="#111"/>`);
  }
  for (let i = 0; i < 5; i++) parts.push(`<line x1="${150 + i * 25}" y1="190" x2="${150 + i * 25}" y2="208" ${LINE}/>`);
  parts.push(`<rect x="140" y="220" width="120" height="25" ${STROKE}/>`);
  parts.push(`<rect x="120" y="245" width="160" height="${rng.between(95, 115)}" rx="14" ${STROKE}/>`);
  for (let i = 0; i < rng.between(2, 4); i++) parts.push(`<circle cx="${160 + i * 40}" cy="285" r="10" ${STROKE}/>`);
  parts.push(`<rect x="150" y="320" width="100" height="18" rx="5" ${STROKE}/>`);
  for (const side of [-1, 1]) {
    parts.push(`<rect x="${side < 0 ? 62 : 280}" y="255" width="58" height="22" rx="11" ${STROKE}/>`, `<rect x="${side < 0 ? 42 : 300}" y="${rng.between(210, 290)}" width="22" height="58" rx="11" ${STROKE}/>`);
    parts.push(`<rect x="${side < 0 ? 140 : 215}" y="355" width="45" height="30" rx="8" ${STROKE}/>`);
  }
  return parts.join('');
}

function cat(rng: Rng): string {
  const parts: string[] = [];
  parts.push(`<path d="M250,300 C340,300 360,230 ${rng.between(320, 350)},${rng.between(170, 210)}" ${LINE}/>`);
  parts.push(`<ellipse cx="190" cy="305" rx="95" ry="80" ${STROKE}/>`);
  for (const side of [-1, 1]) parts.push(`<polygon points="${200 + side * 95},95 ${200 + side * 80},165 ${200 + side * 25},118" ${STROKE}/>`);
  parts.push(`<circle cx="200" cy="170" r="88" ${STROKE}/>`);
  parts.push(`<ellipse cx="165" cy="160" rx="14" ry="${rng.between(15, 22)}" ${STROKE}/>`, `<ellipse cx="235" cy="160" rx="14" ry="${rng.between(15, 22)}" ${STROKE}/>`);
  parts.push(`<polygon points="190,190 210,190 200,203" fill="#111"/>`, `<path d="M200,203 q-12,18 -26,8 M200,203 q12,18 26,8" ${LINE}/>`);
  for (const side of [-1, 1]) for (const dy of [-8, 6]) parts.push(`<line x1="${200 + side * 35}" y1="${200 + dy}" x2="${200 + side * 105}" y2="${200 + dy * 3}" ${LINE}/>`);
  if (rng.chance(0.6)) parts.push(`<path d="M140,250 q60,40 120,0" ${LINE}/>`, `<circle cx="200" cy="270" r="10" ${STROKE}/>`);
  parts.push(`<ellipse cx="150" cy="378" rx="30" ry="14" ${STROKE}/>`, `<ellipse cx="230" cy="378" rx="30" ry="14" ${STROKE}/>`);
  return parts.join('');
}

export type Character = 'monster' | 'robot' | 'cat';

export function drawCharacter(kind: Character, rng: Rng): string {
  const body = { monster, robot, cat }[kind](rng);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="Personagem para colorir"><rect width="400" height="400" fill="#fff"/>${body}</svg>`;
}

export const coloringCharacterTool = defineTool({
  id: 'personagem-colorir',
  name: 'Gerador de Personagens para Colorir',
  description: 'Cria desenhos de monstrinhos, robôs e gatos em linhas pretas para imprimir e colorir',
  category: 'geradores',
  keywords: ['colorir', 'desenho', 'personagem', 'infantil', 'imprimir', 'monstrinho', 'robô', 'gato', 'atividade', 'crianças'],
  icon: '🖍️',
  modes: ['browser', 'node'],
  ui: 'svg-preview',
  inputSchema: z.object({
    kind: z.enum(['monster', 'robot', 'cat']).default('monster'),
    seed: z.string().max(100).optional(),
  }),
  outputSchema: z.object({ svg: z.string(), dataUrl: z.string() }),
  execute: ({ kind, seed }) => {
    const svg = drawCharacter(kind, createRng(seed));
    return { svg, dataUrl: svgToDataUrl(svg) };
  },
  fields: {
    kind: { label: 'Personagem', optionLabels: { monster: 'Monstrinho', robot: 'Robô', cat: 'Gatinho' } },
    seed: { label: 'Número da arte (opcional)', help: 'Cada texto gera um desenho diferente, e o mesmo texto gera sempre o mesmo desenho. Deixe vazio para surpresa.' },
  },
  outputLabels: { svg: 'SVG', dataUrl: 'Data URL' },
  hiddenOutputs: ['dataUrl'],
  downloads: [{ field: 'svg', fileName: 'personagem-para-colorir.svg', mimeType: 'image/svg+xml', label: 'Baixar SVG' }],
  examples: [{ description: 'Um monstrinho reproduzível', input: { kind: 'monster', seed: 'arte-1' } }],
  documentation:
    'Os desenhos são gerados por programa a partir de formas simples (círculos, polígonos e curvas), por isso são originais e livres para você usar e imprimir. Baixe o SVG (qualquer tamanho sem perder qualidade) ou imprima a página. Os contornos são pretos sobre fundo branco, com os espaços vazios para colorir.',
});
