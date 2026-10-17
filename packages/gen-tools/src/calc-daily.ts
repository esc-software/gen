import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { round2, roundTo } from './calc-math.js';
import { parseIsoDate, type CalendarDate } from './dates.js';

const pos = (max = 1e9) => z.number().finite().positive().max(max);
const nonNeg = (max = 1e9) => z.number().finite().min(0).max(max);

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const isoOf = (d: CalendarDate) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;
const brOf = (d: CalendarDate) => `${pad(d.day)}/${pad(d.month)}/${d.year}`;
const utcOf = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);
const fromUtc = (ms: number): CalendarDate => {
  const x = new Date(ms);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
};
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekdayOf = (d: CalendarDate) => new Date(utcOf(d)).getUTCDay();

/** Data de hoje (calendário local do dispositivo). */
export function today(): CalendarDate {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
}

/** Soma meses a uma data; se o dia não existir no mês de destino, usa o último dia do mês. */
export function addMonthsClamped(d: CalendarDate, months: number): CalendarDate {
  const total = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

const isoDateField = (label: string) => z.string().max(10).refine((v) => parseIsoDate(v) !== null, { message: `${label} inválida; use AAAA-MM-DD` });

// ---------- consumo de combustível ----------

export const fuelEfficiencyTool = defineTool({
  id: 'consumo-combustivel',
  name: 'Calculadora de Consumo de Combustível',
  description: 'Calcula quantos quilômetros o veículo faz por litro e o custo por quilômetro',
  category: 'calculadoras',
  keywords: ['consumo', 'combustível', 'km/l', 'autonomia', 'gasolina', 'etanol', 'diesel', 'custo por km'],
  icon: '⛽',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ distance: pos().default(400), liters: pos().default(40), pricePerLiter: nonNeg(1000).optional() }),
  outputSchema: z.object({ kmPerLiter: z.number(), litersPer100km: z.number(), costPerKm: z.number().optional(), totalCost: z.number().optional() }),
  execute: ({ distance, liters, pricePerLiter }) => {
    const out: { kmPerLiter: number; litersPer100km: number; costPerKm?: number; totalCost?: number } = {
      kmPerLiter: roundTo(distance / liters, 2), litersPer100km: roundTo((liters / distance) * 100, 2),
    };
    if (pricePerLiter !== undefined) {
      out.totalCost = round2(liters * pricePerLiter);
      out.costPerKm = roundTo((liters * pricePerLiter) / distance, 3);
    }
    return out;
  },
  fields: {
    distance: { label: 'Distância percorrida (km)' },
    liters: { label: 'Combustível usado (litros)', help: 'Encha o tanque, zere o hodômetro, rode e encha de novo: os litros colocados são o consumo.' },
    pricePerLiter: { label: 'Preço do litro (R$)', help: 'Opcional.' },
  },
  outputLabels: { kmPerLiter: 'Consumo (km/l)', litersPer100km: 'Litros por 100 km', costPerKm: 'Custo por km (R$)', totalCost: 'Custo do trajeto (R$)' },
  examples: [{ description: '400 km com 40 litros a R$ 6', input: { distance: 400, liters: 40, pricePerLiter: 6 }, output: { kmPerLiter: 10, litersPer100km: 10, costPerKm: 0.6, totalCost: 240 } }],
  documentation:
    'Consumo = distância ÷ litros. Para um valor confiável, meça com o tanque cheio e o mesmo estilo de condução; o consumo urbano costuma ser pior que o de estrada.',
});

// ---------- gasolina ou etanol ----------

export const ethanolOrGasolineTool = defineTool({
  id: 'gasolina-etanol',
  name: 'Gasolina ou Etanol: o que compensa?',
  description: 'Compara os preços e indica o combustível mais econômico pela relação de rendimento',
  category: 'calculadoras',
  keywords: ['gasolina', 'etanol', 'álcool', 'compensa', 'abastecer', '70%', 'combustível'],
  icon: '🔥',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    gasolinePrice: pos(1000).default(6.2),
    ethanolPrice: pos(1000).default(4.2),
    threshold: z.number().finite().min(30).max(100).default(70),
    gasolineKmPerLiter: pos(100).optional(),
    ethanolKmPerLiter: pos(100).optional(),
  }),
  outputSchema: z.object({
    ratioPercent: z.number(), recommendation: z.string(), gasolineCostPerKm: z.number().optional(), ethanolCostPerKm: z.number().optional(),
  }),
  execute: ({ gasolinePrice, ethanolPrice, threshold, gasolineKmPerLiter, ethanolKmPerLiter }) => {
    const ratio = (ethanolPrice / gasolinePrice) * 100;
    const out: { ratioPercent: number; recommendation: string; gasolineCostPerKm?: number; ethanolCostPerKm?: number } = {
      ratioPercent: roundTo(ratio, 2),
      recommendation: ratio <= threshold ? `Etanol compensa (custa ${roundTo(ratio, 1)}% da gasolina, abaixo do limite de ${threshold}%)` : `Gasolina compensa (o etanol custa ${roundTo(ratio, 1)}% da gasolina, acima do limite de ${threshold}%)`,
    };
    if (gasolineKmPerLiter !== undefined && ethanolKmPerLiter !== undefined) {
      const g = gasolinePrice / gasolineKmPerLiter;
      const e = ethanolPrice / ethanolKmPerLiter;
      out.gasolineCostPerKm = roundTo(g, 3);
      out.ethanolCostPerKm = roundTo(e, 3);
      out.recommendation = e < g ? `Etanol compensa: R$ ${roundTo(e, 3)}/km contra R$ ${roundTo(g, 3)}/km` : `Gasolina compensa: R$ ${roundTo(g, 3)}/km contra R$ ${roundTo(e, 3)}/km`;
    }
    return out;
  },
  fields: {
    gasolinePrice: { label: 'Preço da gasolina (R$/litro)' },
    ethanolPrice: { label: 'Preço do etanol (R$/litro)' },
    threshold: { label: 'Limite de equivalência (%)', help: 'O etanol rende cerca de 70% da gasolina na média; ajuste para o seu carro.' },
    gasolineKmPerLiter: { label: 'Seu consumo com gasolina (km/l)', help: 'Opcional: com os dois consumos, a comparação usa o custo por km.' },
    ethanolKmPerLiter: { label: 'Seu consumo com etanol (km/l)', help: 'Opcional.' },
  },
  outputLabels: { ratioPercent: 'Etanol / gasolina (%)', recommendation: 'Recomendação', gasolineCostPerKm: 'Gasolina: custo por km (R$)', ethanolCostPerKm: 'Etanol: custo por km (R$)' },
  examples: [{ description: 'Etanol a 4,00 e gasolina a 6,00', input: { gasolinePrice: 6, ethanolPrice: 4, threshold: 70 }, output: { ratioPercent: 66.67 } }],
  documentation:
    'A regra prática diz que o etanol compensa quando custa até cerca de 70% do preço da gasolina, porque rende aproximadamente 30% menos. O valor exato varia por carro e condução: se você sabe o consumo real com cada combustível, informe-os para comparar o custo por quilômetro, que é o critério correto.',
});

// ---------- viagem ----------

export const tripCostTool = defineTool({
  id: 'viagem',
  name: 'Calculadora de Custo de Viagem',
  description: 'Estima combustível, pedágios, custo total, divisão por pessoa e tempo de viagem',
  category: 'calculadoras',
  keywords: ['viagem', 'custo', 'combustível', 'pedágio', 'estrada', 'carona', 'dividir', 'rota'],
  icon: '🧳',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    distance: pos().default(500),
    kmPerLiter: pos(100).default(10),
    fuelPrice: nonNeg(1000).default(6),
    tolls: nonNeg().default(0),
    otherCosts: nonNeg().default(0),
    people: z.number().int().min(1).max(100).default(1),
    roundTrip: z.boolean().default(false),
    averageSpeed: pos(500).optional(),
  }),
  outputSchema: z.object({
    liters: z.number(), fuelCost: z.number(), totalCost: z.number(), perPerson: z.number(), travelTime: z.string().optional(),
  }),
  execute: ({ distance, kmPerLiter, fuelPrice, tolls, otherCosts, people, roundTrip, averageSpeed }) => {
    const factor = roundTrip ? 2 : 1;
    const km = distance * factor;
    const liters = km / kmPerLiter;
    const fuelCost = liters * fuelPrice;
    const total = fuelCost + (tolls + otherCosts) * 1;
    const out: { liters: number; fuelCost: number; totalCost: number; perPerson: number; travelTime?: string } = {
      liters: roundTo(liters, 2), fuelCost: round2(fuelCost), totalCost: round2(total), perPerson: round2(total / people),
    };
    if (averageSpeed !== undefined) {
      const minutes = Math.round((km / averageSpeed) * 60);
      out.travelTime = `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
    }
    return out;
  },
  fields: {
    distance: { label: 'Distância (km)', help: 'Só a ida; marque "ida e volta" para dobrar.' },
    kmPerLiter: { label: 'Consumo do veículo (km/l)' },
    fuelPrice: { label: 'Preço do combustível (R$/litro)' },
    tolls: { label: 'Pedágios (R$)', help: 'Valor total já somando ida e volta, se for o caso.' },
    otherCosts: { label: 'Outros custos (R$)', help: 'Estacionamento, alimentação etc.' },
    people: { label: 'Pessoas dividindo o custo' },
    roundTrip: { label: 'Ida e volta' },
    averageSpeed: { label: 'Velocidade média (km/h)', help: 'Opcional. Para estimar o tempo de viagem.' },
  },
  outputLabels: { liters: 'Combustível (litros)', fuelCost: 'Custo do combustível (R$)', totalCost: 'Custo total (R$)', perPerson: 'Por pessoa (R$)', travelTime: 'Tempo de viagem' },
  examples: [{ description: '500 km, 10 km/l, R$ 6, R$ 40 de pedágio, 4 pessoas', input: { distance: 500, kmPerLiter: 10, fuelPrice: 6, tolls: 40, otherCosts: 0, people: 4, roundTrip: false, averageSpeed: 80 }, output: { liters: 50, fuelCost: 300, totalCost: 340, perPerson: 85, travelTime: '6 h 15 min' } }],
  documentation:
    'Combustível = distância ÷ consumo × preço do litro; o total soma pedágios e outros custos. O tempo usa a velocidade média informada e não considera paradas. Não inclui desgaste do veículo.',
});

// ---------- consumo de água ----------

export const waterUseTool = defineTool({
  id: 'consumo-agua',
  name: 'Calculadora de Consumo de Água',
  description: 'Estima o consumo diário e mensal de água da casa pelos hábitos de banho, descarga, lavagens e outros usos',
  category: 'calculadoras',
  keywords: ['água', 'consumo', 'banho', 'descarga', 'lavar roupa', 'economia', 'conta de água', 'litros'],
  icon: '💧',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    people: z.number().int().min(1).max(100).default(3),
    showerMinutes: nonNeg(120).default(8),
    showerLitersPerMinute: nonNeg(100).default(9),
    flushes: nonNeg(100).default(5),
    litersPerFlush: nonNeg(50).default(6),
    washLoadsPerWeek: nonNeg(100).default(4),
    litersPerWash: nonNeg(500).default(100),
    otherLitersPerPersonDay: nonNeg(1000).default(40),
    tariffPerCubicMeter: nonNeg(1000).optional(),
  }),
  outputSchema: z.object({ litersPerDay: z.number(), litersPerPersonDay: z.number(), cubicMetersPerMonth: z.number(), monthlyCost: z.number().optional() }),
  execute: (v) => {
    const perPerson = v.showerMinutes * v.showerLitersPerMinute + v.flushes * v.litersPerFlush + v.otherLitersPerPersonDay;
    const perDay = perPerson * v.people + (v.washLoadsPerWeek * v.litersPerWash) / 7;
    const m3 = (perDay * 30) / 1000;
    const out: { litersPerDay: number; litersPerPersonDay: number; cubicMetersPerMonth: number; monthlyCost?: number } = {
      litersPerDay: roundTo(perDay, 1), litersPerPersonDay: roundTo(perDay / v.people, 1), cubicMetersPerMonth: roundTo(m3, 2),
    };
    if (v.tariffPerCubicMeter !== undefined) out.monthlyCost = round2(m3 * v.tariffPerCubicMeter);
    return out;
  },
  fields: {
    people: { label: 'Pessoas na casa' },
    showerMinutes: { label: 'Minutos de banho por pessoa por dia' },
    showerLitersPerMinute: { label: 'Vazão do chuveiro (litros/min)', help: 'Valor de referência; meça o seu enchendo um balde por 1 minuto.' },
    flushes: { label: 'Descargas por pessoa por dia' },
    litersPerFlush: { label: 'Litros por descarga', help: 'Caixas acopladas atuais usam 3 a 6 litros; bacias antigas, 9 a 12.' },
    washLoadsPerWeek: { label: 'Lavagens de roupa por semana' },
    litersPerWash: { label: 'Litros por lavagem' },
    otherLitersPerPersonDay: { label: 'Outros usos por pessoa por dia (litros)', help: 'Pia, escovar dentes, cozinhar, limpeza.' },
    tariffPerCubicMeter: { label: 'Tarifa (R$ por m³)', help: 'Opcional. Veja a tarifa na sua conta, que varia por faixa de consumo e cidade.' },
  },
  outputLabels: { litersPerDay: 'Litros por dia', litersPerPersonDay: 'Litros por pessoa por dia', cubicMetersPerMonth: 'Consumo mensal (m³)', monthlyCost: 'Custo estimado por mês (R$)' },
  examples: [{ description: 'Casa com 2 pessoas', input: { people: 2, showerMinutes: 10, showerLitersPerMinute: 10, flushes: 5, litersPerFlush: 6, washLoadsPerWeek: 7, litersPerWash: 100, otherLitersPerPersonDay: 40 }, output: { litersPerDay: 440, cubicMetersPerMonth: 13.2 } }],
  documentation:
    'É uma estimativa baseada nos valores informados; os padrões de cada campo são apenas referências ajustáveis, não medições. Compare o resultado com o consumo da sua conta (1 m³ = 1000 litros) para identificar desvios. O custo depende da tarifa por faixa da concessionária, que não é calculada aqui.',
});

// ---------- energia elétrica ----------

export interface Appliance {
  name: string;
  watts: number;
  hoursPerDay: number;
  daysPerMonth: number;
}

export function parseAppliances(text: string): Appliance[] {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 3) throw new ToolError(`Linha ${i + 1}: use "nome; potência em W; horas por dia; dias por mês"`);
    const n = (s: string, what: string) => {
      const v = Number(s.replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) throw new ToolError(`Linha ${i + 1}: ${what} inválido ("${s}")`);
      return v;
    };
    const [name, w, h, d] = parts as [string, string, string, string | undefined];
    const days = d === undefined || d === '' ? 30 : n(d, 'dias por mês');
    const hours = n(h, 'horas por dia');
    if (hours > 24) throw new ToolError(`Linha ${i + 1}: horas por dia não pode passar de 24`);
    if (days > 31) throw new ToolError(`Linha ${i + 1}: dias por mês não pode passar de 31`);
    return { name, watts: n(w, 'potência'), hoursPerDay: hours, daysPerMonth: days };
  });
}

export const electricityTool = defineTool({
  id: 'energia-eletrica',
  name: 'Calculadora de Consumo de Energia Elétrica',
  description: 'Estima o consumo em kWh e o custo mensal de cada aparelho e da casa',
  category: 'calculadoras',
  keywords: ['energia', 'elétrica', 'kwh', 'conta de luz', 'consumo', 'aparelhos', 'eletrodomésticos', 'tarifa'],
  icon: '💡',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    appliances: z.string().max(10_000).default('Geladeira; 150; 24; 30\nChuveiro elétrico; 5500; 0,5; 30\nLâmpadas LED; 60; 5; 30'),
    tariff: nonNeg(100).default(1),
  }),
  outputSchema: z.object({ totalKwh: z.number(), monthlyCost: z.number(), breakdown: z.array(z.string()) }),
  execute: ({ appliances, tariff }) => {
    const list = parseAppliances(appliances);
    if (list.length === 0) throw new ToolError('Informe ao menos um aparelho');
    const rows = list.map((a) => ({ a, kwh: (a.watts * a.hoursPerDay * a.daysPerMonth) / 1000 })).sort((x, y) => y.kwh - x.kwh);
    const total = rows.reduce((s, r) => s + r.kwh, 0);
    return {
      totalKwh: roundTo(total, 2), monthlyCost: round2(total * tariff),
      breakdown: rows.map((r) => `${r.a.name}: ${roundTo(r.kwh, 2)} kWh (R$ ${round2(r.kwh * tariff).toFixed(2).replace('.', ',')})`),
    };
  },
  fields: {
    appliances: { label: 'Aparelhos', multiline: true, help: 'Uma linha por aparelho: nome; potência (W); horas por dia; dias por mês. A potência está na etiqueta do aparelho.' },
    tariff: { label: 'Tarifa (R$ por kWh)', help: 'Veja o valor do kWh na sua conta de luz, já com impostos.' },
  },
  outputLabels: { totalKwh: 'Consumo mensal (kWh)', monthlyCost: 'Custo mensal (R$)', breakdown: 'Por aparelho (do maior ao menor)' },
  examples: [{ description: 'Chuveiro de 5.500 W por 30 min/dia', input: { appliances: 'Chuveiro; 5500; 0,5; 30', tariff: 1 }, output: { totalKwh: 82.5, monthlyCost: 82.5 } }],
  documentation:
    'Energia (kWh) = potência (kW) × horas de uso. O resultado vale para aparelhos que usam a potência da etiqueta durante todo o uso; geladeiras e ar-condicionado ciclam o compressor, então o consumo real é menor que potência × 24 h. Bandeiras tarifárias e impostos mudam o custo; use a tarifa final da sua conta.',
});

// ---------- internet: tempo de download ----------

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0 || h > 0) parts.push(`${pad(m)} min`);
  parts.push(`${pad(sec)} s`);
  return parts.join(' ');
}

const SIZE_FACTORS_MB = { MB: 1, GB: 1000, TB: 1_000_000 } as const;

export const downloadTimeTool = defineTool({
  id: 'internet',
  name: 'Calculadora de Tempo de Download',
  description: 'Calcula quanto tempo leva para baixar um arquivo na velocidade da sua internet',
  category: 'calculadoras',
  keywords: ['internet', 'download', 'velocidade', 'mbps', 'banda larga', 'tempo', 'baixar', 'upload'],
  icon: '🌐',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    size: pos(1e9).default(1),
    unit: z.enum(['MB', 'GB', 'TB']).default('GB'),
    speedMbps: pos(1e6).default(100),
    efficiency: z.number().finite().min(1).max(100).default(90),
  }),
  outputSchema: z.object({ time: z.string(), seconds: z.number(), effectiveMBps: z.number() }),
  execute: ({ size, unit, speedMbps, efficiency }) => {
    const megabytes = size * SIZE_FACTORS_MB[unit];
    const effectiveMBps = (speedMbps * (efficiency / 100)) / 8;
    const seconds = megabytes / effectiveMBps;
    return { time: formatDuration(seconds), seconds: Math.round(seconds), effectiveMBps: roundTo(effectiveMBps, 2) };
  },
  fields: {
    size: { label: 'Tamanho do arquivo' },
    unit: { label: 'Unidade', optionLabels: { MB: 'Megabytes (MB)', GB: 'Gigabytes (GB)', TB: 'Terabytes (TB)' } },
    speedMbps: { label: 'Velocidade contratada (Mbps)', help: 'Megabits por segundo, como anunciado pelo provedor.' },
    efficiency: { label: 'Aproveitamento real (%)', help: 'Protocolos e Wi-Fi consomem parte da banda; de 85% a 95% é comum.' },
  },
  outputLabels: { time: 'Tempo estimado', seconds: 'Segundos', effectiveMBps: 'Velocidade real (MB/s)' },
  examples: [{ description: '1 GB em 100 Mbps com 100% de aproveitamento', input: { size: 1, unit: 'GB', speedMbps: 100, efficiency: 100 }, output: { seconds: 80, time: '01 min 20 s', effectiveMBps: 12.5 } }],
  documentation:
    'Provedores anunciam em megabits por segundo (Mbps); arquivos são medidos em megabytes (MB). 1 byte = 8 bits, então 100 Mbps equivalem a 12,5 MB/s no máximo. Usa unidades decimais (1 GB = 1000 MB). O tempo real depende do servidor, do Wi-Fi e da rede.',
});

// ---------- tinta ----------

/** Combinação de embalagens que cobre o litro necessário com menos sobra (e, empatando, menos latas). */
export function paintCans(litersNeeded: number): { counts: Record<string, number>; totalLiters: number } {
  let best: { counts: [number, number, number]; total: number; cans: number } | null = null;
  const maxBig = Math.ceil(litersNeeded / 18);
  for (let a = 0; a <= maxBig; a++) {
    for (let b = 0; b <= 5; b++) {
      for (let c = 0; c <= 3; c++) {
        const total = a * 18 + b * 3.6 + c * 0.9;
        if (total + 1e-9 < litersNeeded) continue;
        const cans = a + b + c;
        if (!best || total < best.total - 1e-9 || (Math.abs(total - best.total) < 1e-9 && cans < best.cans)) best = { counts: [a, b, c], total, cans };
      }
    }
  }
  const [a, b, c] = (best as NonNullable<typeof best>).counts;
  return { counts: { '18 L': a, '3,6 L': b, '0,9 L': c }, totalLiters: roundTo((best as NonNullable<typeof best>).total, 2) };
}

export const paintTool = defineTool({
  id: 'tinta',
  name: 'Calculadora de Tinta',
  description: 'Calcula quantos litros de tinta e quais latas comprar para pintar um cômodo',
  category: 'calculadoras',
  keywords: ['tinta', 'pintura', 'parede', 'litros', 'latas', 'demãos', 'rendimento', 'reforma'],
  icon: '🎨',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    length: pos(1000).default(4),
    width: pos(1000).default(3),
    height: pos(100).default(2.7),
    openingsArea: nonNeg(10000).default(3.6),
    includeCeiling: z.boolean().default(false),
    coats: z.number().int().min(1).max(10).default(2),
    yieldPerLiter: pos(100).default(10),
    marginPercent: nonNeg(100).default(10),
  }),
  outputSchema: z.object({ paintableArea: z.number(), litersNeeded: z.number(), cans: z.string(), totalLiters: z.number() }),
  execute: (v) => {
    const walls = 2 * (v.length + v.width) * v.height;
    const area = Math.max(walls - v.openingsArea, 0) + (v.includeCeiling ? v.length * v.width : 0);
    if (area <= 0) throw new ToolError('A área de pintura é zero; confira as medidas e as aberturas');
    const liters = (area * v.coats) / v.yieldPerLiter;
    const withMargin = liters * (1 + v.marginPercent / 100);
    const cans = paintCans(withMargin);
    const text = Object.entries(cans.counts).filter(([, n]) => n > 0).map(([size, n]) => `${n} × ${size}`).join(' + ');
    return { paintableArea: roundTo(area, 2), litersNeeded: roundTo(withMargin, 2), cans: text, totalLiters: cans.totalLiters };
  },
  fields: {
    length: { label: 'Comprimento do cômodo (m)' },
    width: { label: 'Largura do cômodo (m)' },
    height: { label: 'Altura das paredes (m)' },
    openingsArea: { label: 'Área de portas e janelas (m²)', help: 'Uma porta comum tem cerca de 1,6 m²; uma janela de 1,2 × 1 m, 1,2 m².' },
    includeCeiling: { label: 'Pintar também o teto' },
    coats: { label: 'Número de demãos' },
    yieldPerLiter: { label: 'Rendimento da tinta (m² por litro por demão)', help: 'Veja na embalagem; muitas tintas rendem de 8 a 12 m²/L por demão.' },
    marginPercent: { label: 'Margem de perda (%)' },
  },
  outputLabels: { paintableArea: 'Área a pintar (m²)', litersNeeded: 'Tinta necessária (litros)', cans: 'Embalagens sugeridas', totalLiters: 'Total comprado (litros)' },
  examples: [{ description: 'Sala 4 × 3 m, pé-direito 2,7 m', input: { length: 4, width: 3, height: 2.7, openingsArea: 3.6, includeCeiling: false, coats: 2, yieldPerLiter: 10, marginPercent: 10 }, output: { paintableArea: 34.2 } }],
  documentation:
    'Área das paredes = perímetro × altura − aberturas. Litros = área × demãos ÷ rendimento, mais a margem de perda. As embalagens sugeridas (18 L, 3,6 L e 0,9 L) são combinadas para cobrir a necessidade com a menor sobra. O rendimento real depende da tinta, da superfície e do método de aplicação.',
});

// ---------- piso ----------

export const flooringTool = defineTool({
  id: 'piso',
  name: 'Calculadora de Piso e Revestimento',
  description: 'Calcula a quantidade de peças e caixas de piso ou revestimento, com a margem de perda',
  category: 'calculadoras',
  keywords: ['piso', 'revestimento', 'cerâmica', 'porcelanato', 'azulejo', 'caixas', 'perda', 'reforma'],
  icon: '🧱',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    roomLength: pos(1000).default(5),
    roomWidth: pos(1000).default(4),
    tileLengthCm: pos(1000).default(60),
    tileWidthCm: pos(1000).default(60),
    lossPercent: nonNeg(100).default(10),
    boxCoverage: pos(1000).optional(),
  }),
  outputSchema: z.object({ roomArea: z.number(), pieces: z.number(), areaToBuy: z.number(), boxes: z.number().optional() }),
  execute: ({ roomLength, roomWidth, tileLengthCm, tileWidthCm, lossPercent, boxCoverage }) => {
    const roomArea = roomLength * roomWidth;
    const tileArea = (tileLengthCm / 100) * (tileWidthCm / 100);
    const withLoss = roomArea * (1 + lossPercent / 100);
    const pieces = Math.ceil(withLoss / tileArea - 1e-9);
    const out: { roomArea: number; pieces: number; areaToBuy: number; boxes?: number } = {
      roomArea: roundTo(roomArea, 2), pieces, areaToBuy: roundTo(pieces * tileArea, 2),
    };
    if (boxCoverage !== undefined) out.boxes = Math.ceil(withLoss / boxCoverage - 1e-9);
    return out;
  },
  fields: {
    roomLength: { label: 'Comprimento do ambiente (m)' },
    roomWidth: { label: 'Largura do ambiente (m)' },
    tileLengthCm: { label: 'Comprimento da peça (cm)' },
    tileWidthCm: { label: 'Largura da peça (cm)' },
    lossPercent: { label: 'Margem de perda (%)', help: 'Em geral 10%; use 15% ou mais em assentamento na diagonal ou peças grandes.' },
    boxCoverage: { label: 'Cobertura por caixa (m²)', help: 'Opcional. Está escrita na embalagem.' },
  },
  outputLabels: { roomArea: 'Área do ambiente (m²)', pieces: 'Peças a comprar', areaToBuy: 'Área comprada (m²)', boxes: 'Caixas a comprar' },
  examples: [{ description: 'Sala 5 × 4 m com peças de 60 × 60 cm', input: { roomLength: 5, roomWidth: 4, tileLengthCm: 60, tileWidthCm: 60, lossPercent: 10 }, output: { roomArea: 20, pieces: 62 } }],
  documentation:
    'Peças = área do ambiente com a margem de perda ÷ área da peça, arredondado para cima. Considera ambiente retangular e não desconta pilares ou recortes. Peça sempre uma caixa a mais do mesmo lote para reposições futuras, pois o tom varia entre lotes.',
});

// ---------- concreto ----------

const SPECIFIC_GRAVITY = { cement: 3.15, sand: 2.65, gravel: 2.7 } as const;

export function concreteMix(volumeM3: number, sand: number, gravel: number, waterCement: number) {
  // Traço em massa 1 : areia : brita. Soma dos volumes absolutos por kg de cimento = 1 m³ de concreto.
  const cementPerM3 = 1000 / (1 / SPECIFIC_GRAVITY.cement + sand / SPECIFIC_GRAVITY.sand + gravel / SPECIFIC_GRAVITY.gravel + waterCement);
  return {
    cementKg: cementPerM3 * volumeM3,
    sandKg: cementPerM3 * sand * volumeM3,
    gravelKg: cementPerM3 * gravel * volumeM3,
    waterLiters: cementPerM3 * waterCement * volumeM3,
  };
}

export const concreteTool = defineTool({
  id: 'concreto',
  name: 'Calculadora de Concreto',
  description: 'Estima o volume de concreto de uma laje, sapata ou piso e as quantidades de cimento, areia, brita e água',
  category: 'calculadoras',
  keywords: ['concreto', 'cimento', 'areia', 'brita', 'traço', 'laje', 'sapata', 'obra', 'metros cúbicos'],
  icon: '🏗️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    length: pos(1000).default(4),
    width: pos(1000).default(3),
    thickness: pos(100).default(0.1),
    sand: pos(20).default(2),
    gravel: pos(20).default(3),
    waterCement: pos(2).default(0.5),
    marginPercent: nonNeg(100).default(5),
  }),
  outputSchema: z.object({ volumeM3: z.number(), cementKg: z.number(), cementBags50kg: z.number(), sandKg: z.number(), gravelKg: z.number(), waterLiters: z.number() }),
  execute: (v) => {
    const volume = v.length * v.width * v.thickness * (1 + v.marginPercent / 100);
    const m = concreteMix(volume, v.sand, v.gravel, v.waterCement);
    return {
      volumeM3: roundTo(volume, 3), cementKg: roundTo(m.cementKg, 1), cementBags50kg: Math.ceil(m.cementKg / 50 - 1e-9),
      sandKg: roundTo(m.sandKg, 1), gravelKg: roundTo(m.gravelKg, 1), waterLiters: roundTo(m.waterLiters, 1),
    };
  },
  fields: {
    length: { label: 'Comprimento (m)' },
    width: { label: 'Largura (m)' },
    thickness: { label: 'Espessura (m)', help: '10 cm = 0,1 m.' },
    sand: { label: 'Traço em massa: partes de areia', help: 'Para o traço 1:2:3, areia = 2 e brita = 3.' },
    gravel: { label: 'Traço em massa: partes de brita' },
    waterCement: { label: 'Fator água/cimento', help: 'Costuma ficar entre 0,45 e 0,6; menor é mais resistente.' },
    marginPercent: { label: 'Margem de perda (%)' },
  },
  outputLabels: { volumeM3: 'Volume (m³)', cementKg: 'Cimento (kg)', cementBags50kg: 'Sacos de cimento de 50 kg', sandKg: 'Areia (kg)', gravelKg: 'Brita (kg)', waterLiters: 'Água (litros)' },
  examples: [{ description: 'Laje de 4 × 3 m com 10 cm, traço 1:2:3', input: { length: 4, width: 3, thickness: 0.1, sand: 2, gravel: 3, waterCement: 0.5, marginPercent: 0 }, output: { volumeM3: 1.2 } }],
  documentation:
    'Estimativa pelo método dos volumes absolutos: consumo de cimento por m³ = 1000 ÷ (1/3,15 + areia/2,65 + brita/2,7 + a/c), com as massas específicas usuais do cimento, da areia e da brita. Considera traço em massa e não inclui o ar incorporado nem a umidade dos agregados. Para estruturas, o traço deve vir de projeto de engenheiro; use isto apenas como estimativa de compra.',
});

// ---------- pizza ----------

export const pizzaTool = defineTool({
  id: 'pizza',
  name: 'Calculadora de Pizza',
  description: 'Calcula quantas pizzas pedir para o grupo e compara qual tamanho compensa mais pelo preço',
  category: 'calculadoras',
  keywords: ['pizza', 'fatias', 'pedir', 'pizzaria', 'tamanho', 'custo-benefício', 'grupo'],
  icon: '🍕',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    people: z.number().int().min(1).max(10000).default(6),
    slicesPerPerson: pos(50).default(3),
    slicesPerPizza: z.number().int().min(1).max(64).default(8),
    diameterA: pos(200).optional(),
    priceA: pos(100000).optional(),
    diameterB: pos(200).optional(),
    priceB: pos(100000).optional(),
  }),
  outputSchema: z.object({ pizzas: z.number(), slices: z.number(), costPerCm2A: z.number().optional(), costPerCm2B: z.number().optional(), bestValue: z.string().optional() }),
  execute: ({ people, slicesPerPerson, slicesPerPizza, diameterA, priceA, diameterB, priceB }) => {
    const slices = Math.ceil(people * slicesPerPerson - 1e-9);
    const out: { pizzas: number; slices: number; costPerCm2A?: number; costPerCm2B?: number; bestValue?: string } = {
      pizzas: Math.ceil(slices / slicesPerPizza - 1e-9), slices,
    };
    if (diameterA && priceA && diameterB && priceB) {
      const a = priceA / (Math.PI * (diameterA / 2) ** 2);
      const b = priceB / (Math.PI * (diameterB / 2) ** 2);
      out.costPerCm2A = roundTo(a, 4);
      out.costPerCm2B = roundTo(b, 4);
      out.bestValue = Math.abs(a - b) < 1e-9 ? 'Empate' : a < b ? `Pizza A compensa mais (${roundTo((1 - a / b) * 100, 1)}% mais barata por cm²)` : `Pizza B compensa mais (${roundTo((1 - b / a) * 100, 1)}% mais barata por cm²)`;
    }
    return out;
  },
  fields: {
    people: { label: 'Pessoas' },
    slicesPerPerson: { label: 'Fatias por pessoa' },
    slicesPerPizza: { label: 'Fatias por pizza' },
    diameterA: { label: 'Pizza A: diâmetro (cm)', help: 'Opcional: preencha as pizzas A e B para comparar o preço.' },
    priceA: { label: 'Pizza A: preço (R$)' },
    diameterB: { label: 'Pizza B: diâmetro (cm)' },
    priceB: { label: 'Pizza B: preço (R$)' },
  },
  outputLabels: { pizzas: 'Pizzas a pedir', slices: 'Fatias necessárias', costPerCm2A: 'Pizza A: R$ por cm²', costPerCm2B: 'Pizza B: R$ por cm²', bestValue: 'Melhor custo-benefício' },
  examples: [{ description: 'Comparar 30 cm a R$ 40 e 35 cm a R$ 52', input: { people: 6, slicesPerPerson: 3, slicesPerPizza: 8, diameterA: 30, priceA: 40, diameterB: 35, priceB: 52 }, output: { pizzas: 3, slices: 18 } }],
  documentation:
    'Pizzas = ⌈pessoas × fatias por pessoa ÷ fatias por pizza⌉. A comparação usa a área do círculo (π × raio²): dobrar o diâmetro quadruplica a área, então pizzas maiores costumam compensar. Três fatias por pessoa é uma referência comum, ajuste ao apetite do grupo.',
});

// ---------- churrasco ----------

export const barbecueTool = defineTool({
  id: 'churrasco',
  name: 'Calculadora de Churrasco',
  description: 'Estima carne, acompanhamentos, carvão e bebidas para o número de convidados',
  category: 'calculadoras',
  keywords: ['churrasco', 'carne', 'convidados', 'carvão', 'cerveja', 'bebidas', 'festa', 'quantidade'],
  icon: '🥩',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    adults: z.number().int().min(0).max(5000).default(10),
    children: z.number().int().min(0).max(5000).default(0),
    appetite: z.enum(['light', 'normal', 'heavy']).default('normal'),
    drinkingAdults: z.number().int().min(0).max(5000).optional(),
  }),
  outputSchema: z.object({
    meatKg: z.number(), sausageKg: z.number(), garlicBreadUnits: z.number(), charcoalKg: z.number(), beerLiters: z.number(), softDrinkLiters: z.number(),
  }),
  execute: ({ adults, children, appetite, drinkingAdults }) => {
    if (adults + children === 0) throw new ToolError('Informe ao menos um convidado');
    const adultMeat = { light: 300, normal: 400, heavy: 500 }[appetite];
    const meatG = adults * adultMeat + children * adultMeat * 0.5;
    const drinkers = Math.min(drinkingAdults ?? adults, adults);
    const people = adults + children;
    return {
      meatKg: roundTo(meatG / 1000, 2),
      sausageKg: roundTo((people * 100) / 1000, 2),
      garlicBreadUnits: Math.ceil(people * 1.5),
      charcoalKg: roundTo((meatG / 1000) * 1, 1),
      beerLiters: roundTo(drinkers * 1.5, 1),
      softDrinkLiters: roundTo(people * 0.6 + children * 0.3, 1),
    };
  },
  fields: {
    adults: { label: 'Adultos' },
    children: { label: 'Crianças' },
    appetite: { label: 'Apetite do grupo', optionLabels: { light: 'Leve (300 g de carne por adulto)', normal: 'Normal (400 g)', heavy: 'Forte (500 g)' } },
    drinkingAdults: { label: 'Adultos que bebem cerveja', help: 'Opcional. Se vazio, todos os adultos.' },
  },
  outputLabels: { meatKg: 'Carne (kg)', sausageKg: 'Linguiça (kg)', garlicBreadUnits: 'Pão de alho (unidades)', charcoalKg: 'Carvão (kg)', beerLiters: 'Cerveja (litros)', softDrinkLiters: 'Refrigerante e água (litros)' },
  examples: [{ description: '10 adultos', input: { adults: 10, children: 0, appetite: 'normal' }, output: { meatKg: 4, sausageKg: 1, garlicBreadUnits: 15, charcoalKg: 4, beerLiters: 15 } }],
  documentation:
    'Regras práticas comuns: 300 a 500 g de carne por adulto (crianças comem metade), 100 g de linguiça e 1,5 pão de alho por pessoa, cerca de 1 kg de carvão por kg de carne, 1,5 litro de cerveja por adulto que bebe e 0,6 litro de refrigerante ou água por pessoa. São estimativas para planejar compras, não medidas exatas; ajuste ao perfil dos convidados e à duração do evento.',
});

// ---------- horas trabalhadas ----------

const INTERVAL = /(\d{1,2}):(\d{2})\s*(?:-|–|—|às|as|a)\s*(\d{1,2}):(\d{2})/gi;

export function parseWorkedMinutes(text: string): { totalMinutes: number; days: number; perDay: number[] } {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  const perDay: number[] = [];
  lines.forEach((line, index) => {
    let minutes = 0;
    let found = false;
    for (const m of line.matchAll(INTERVAL)) {
      found = true;
      const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
      if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) throw new ToolError(`Linha ${index + 1}: horário inválido em "${m[0]}"`);
      const start = h1 * 60 + m1;
      let end = h2 * 60 + m2;
      if (end <= start) end += 24 * 60; // atravessa a meia-noite
      minutes += end - start;
    }
    if (!found) throw new ToolError(`Linha ${index + 1}: use intervalos como 08:00-12:00 13:00-17:30`);
    perDay.push(minutes);
  });
  return { totalMinutes: perDay.reduce((a, b) => a + b, 0), days: perDay.length, perDay };
}

const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(Math.round(minutes % 60))}`;

export const workedHoursTool = defineTool({
  id: 'horas-trabalhadas',
  name: 'Calculadora de Horas Trabalhadas',
  description: 'Soma as horas trabalhadas a partir dos horários de entrada, saída e intervalos de cada dia',
  category: 'calculadoras',
  keywords: ['horas trabalhadas', 'ponto', 'jornada', 'banco de horas', 'entrada', 'saída', 'folha de ponto', 'intervalo'],
  icon: '⏰',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    entries: z.string().max(20_000).default(''),
    expectedPerDay: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  }),
  outputSchema: z.object({ total: z.string(), decimalHours: z.number(), days: z.number(), averagePerDay: z.string(), balance: z.string().optional(), perDay: z.array(z.string()) }),
  execute: ({ entries, expectedPerDay }) => {
    const r = parseWorkedMinutes(entries);
    if (r.days === 0) throw new ToolError('Informe ao menos um dia');
    const out: { total: string; decimalHours: number; days: number; averagePerDay: string; balance?: string; perDay: string[] } = {
      total: hhmm(r.totalMinutes), decimalHours: roundTo(r.totalMinutes / 60, 2), days: r.days,
      averagePerDay: hhmm(r.totalMinutes / r.days), perDay: r.perDay.map((m, i) => `Dia ${i + 1}: ${hhmm(m)}`),
    };
    if (expectedPerDay) {
      const [h, m] = expectedPerDay.split(':').map(Number) as [number, number];
      const diff = r.totalMinutes - r.days * (h * 60 + m);
      out.balance = `${diff < 0 ? '-' : '+'}${hhmm(Math.abs(diff))}`;
    }
    return out;
  },
  fields: {
    entries: { label: 'Horários (uma linha por dia)', multiline: true, placeholder: '08:00-12:00 13:00-17:48\n08:10-12:05 13:05-18:00', help: 'Cada intervalo no formato HH:MM-HH:MM. Turnos que passam da meia-noite são aceitos (22:00-06:00).' },
    expectedPerDay: { label: 'Jornada esperada por dia (HH:MM)', placeholder: '08:00', help: 'Opcional. Para calcular o saldo do banco de horas.' },
  },
  outputLabels: { total: 'Total (HH:MM)', decimalHours: 'Total em horas decimais', days: 'Dias', averagePerDay: 'Média por dia', balance: 'Saldo em relação à jornada', perDay: 'Por dia' },
  examples: [{ description: 'Dois dias', input: { entries: '08:00-12:00 13:00-17:30\n09:00-12:00 13:00-18:00', expectedPerDay: '08:00' }, output: { total: '16:30', decimalHours: 16.5, days: 2, balance: '+0:30' } }],
  documentation:
    'Soma todos os intervalos de cada linha (cada linha é um dia). Quando a saída é menor ou igual à entrada, entende-se que o turno atravessa a meia-noite. O total aparece em HH:MM e em horas decimais (útil para multiplicar por valor-hora). Não aplica regras de tolerância de ponto nem acordos coletivos.',
});

// ---------- calculadora de datas ----------

export const dateCalculatorTool = defineTool({
  id: 'calculadora-datas',
  name: 'Calculadora de Datas',
  description: 'Soma ou subtrai anos, meses, semanas e dias a uma data e mostra o dia da semana do resultado',
  category: 'calculadoras',
  keywords: ['datas', 'somar dias', 'subtrair dias', 'prazo', 'vencimento', 'calendário', 'daqui a'],
  icon: '🗓️',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    date: isoDateField('Data'),
    operation: z.enum(['add', 'subtract']).default('add'),
    years: z.number().int().min(0).max(1000).default(0),
    months: z.number().int().min(0).max(12000).default(0),
    weeks: z.number().int().min(0).max(100000).default(0),
    days: z.number().int().min(0).max(1_000_000).default(30),
  }),
  outputSchema: z.object({ result: z.string(), resultBr: z.string(), weekday: z.string(), daysFromStart: z.number() }),
  execute: ({ date, operation, years, months, weeks, days }) => {
    const start = parseIsoDate(date) as CalendarDate;
    const sign = operation === 'add' ? 1 : -1;
    const shifted = addMonthsClamped(start, sign * (years * 12 + months));
    const ms = utcOf(shifted) + sign * (weeks * 7 + days) * 86_400_000;
    const end = fromUtc(ms);
    if (end.year < 1 || end.year > 9999) throw new ToolError('O resultado está fora do intervalo de datas suportado');
    return {
      result: isoOf(end), resultBr: brOf(end), weekday: WEEKDAYS[weekdayOf(end)] as string,
      daysFromStart: Math.round((utcOf(end) - utcOf(start)) / 86_400_000),
    };
  },
  fields: {
    date: { label: 'Data inicial', inputType: 'date' },
    operation: { label: 'Operação', optionLabels: { add: 'Somar', subtract: 'Subtrair' } },
    years: { label: 'Anos' }, months: { label: 'Meses' }, weeks: { label: 'Semanas' }, days: { label: 'Dias' },
  },
  outputLabels: { result: 'Data resultante (ISO)', resultBr: 'Data resultante', weekday: 'Dia da semana', daysFromStart: 'Dias de diferença' },
  examples: [
    { description: '30 dias após 01/01/2024', input: { date: '2024-01-01', operation: 'add', years: 0, months: 0, weeks: 0, days: 30 }, output: { result: '2024-01-31', weekday: 'quarta-feira' } },
    { description: '1 mês após 31/01 (fevereiro bissexto)', input: { date: '2024-01-31', operation: 'add', years: 0, months: 1, weeks: 0, days: 0 }, output: { result: '2024-02-29' } },
  ],
  documentation:
    'Primeiro somam-se (ou subtraem-se) anos e meses; se o dia não existir no mês de destino, usa-se o último dia do mês (31/01 + 1 mês = 28 ou 29/02). Depois somam-se semanas e dias exatos. O cálculo é de calendário, sem horário nem fuso. Não pula fins de semana nem feriados: para prazos em dias úteis, use a calculadora de dias úteis.',
});

// ---------- dias úteis ----------

/** Domingo de Páscoa (algoritmo gregoriano anônimo). */
export function easter(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

const shiftDays = (d: CalendarDate, n: number) => fromUtc(utcOf(d) + n * 86_400_000);

export interface Holiday {
  date: CalendarDate;
  name: string;
  optional: boolean;
}

/** Feriados nacionais do Brasil e pontos facultativos usuais. O 20/11 é nacional desde 2024 (Lei 14.759/2023). */
export function brazilianHolidays(year: number): Holiday[] {
  const e = easter(year);
  const list: Holiday[] = [
    { date: { year, month: 1, day: 1 }, name: 'Confraternização Universal', optional: false },
    { date: shiftDays(e, -2), name: 'Sexta-feira Santa', optional: false },
    { date: { year, month: 4, day: 21 }, name: 'Tiradentes', optional: false },
    { date: { year, month: 5, day: 1 }, name: 'Dia do Trabalho', optional: false },
    { date: { year, month: 9, day: 7 }, name: 'Independência do Brasil', optional: false },
    { date: { year, month: 10, day: 12 }, name: 'Nossa Senhora Aparecida', optional: false },
    { date: { year, month: 11, day: 2 }, name: 'Finados', optional: false },
    { date: { year, month: 11, day: 15 }, name: 'Proclamação da República', optional: false },
    { date: { year, month: 12, day: 25 }, name: 'Natal', optional: false },
    { date: shiftDays(e, -48), name: 'Carnaval (segunda-feira)', optional: true },
    { date: shiftDays(e, -47), name: 'Carnaval (terça-feira)', optional: true },
    { date: shiftDays(e, 60), name: 'Corpus Christi', optional: true },
  ];
  if (year >= 2024) list.push({ date: { year, month: 11, day: 20 }, name: 'Consciência Negra', optional: false });
  return list;
}

export function parseDateList(text: string): CalendarDate[] {
  return text.split(/[\s,;]+/).filter(Boolean).map((token) => {
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(token);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : token;
    const d = parseIsoDate(iso);
    if (!d) throw new ToolError(`Data inválida na lista de feriados: "${token}"`);
    return d;
  });
}

export const businessDaysTool = defineTool({
  id: 'dias-uteis',
  name: 'Calculadora de Dias Úteis',
  description: 'Conta os dias úteis entre duas datas, descontando fins de semana e feriados nacionais',
  category: 'calculadoras',
  keywords: ['dias úteis', 'feriados', 'prazo', 'dias corridos', 'fim de semana', 'calendário', 'trabalho'],
  icon: '📆',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    start: isoDateField('Data inicial'),
    end: isoDateField('Data final'),
    optionalHolidays: z.boolean().default(false),
    extraHolidays: z.string().max(5000).optional(),
    saturdayIsBusinessDay: z.boolean().default(false),
  }),
  outputSchema: z.object({ businessDays: z.number(), calendarDays: z.number(), weekendDays: z.number(), holidaysOnBusinessDays: z.array(z.string()) }),
  execute: ({ start, end, optionalHolidays, extraHolidays, saturdayIsBusinessDay }) => {
    const a = parseIsoDate(start) as CalendarDate;
    const b = parseIsoDate(end) as CalendarDate;
    if (utcOf(b) < utcOf(a)) throw new ToolError('A data final deve ser igual ou posterior à inicial');
    const calendarDays = Math.round((utcOf(b) - utcOf(a)) / 86_400_000) + 1;
    if (calendarDays > 36_600) throw new ToolError('O intervalo máximo é de 100 anos');

    const holidays = new Map<number, string>();
    for (let y = a.year; y <= b.year; y++) {
      for (const h of brazilianHolidays(y)) if (!h.optional || optionalHolidays) holidays.set(utcOf(h.date), h.name);
    }
    for (const d of parseDateList(extraHolidays ?? '')) holidays.set(utcOf(d), 'Feriado informado');

    let business = 0;
    let weekend = 0;
    const hit: string[] = [];
    for (let ms = utcOf(a); ms <= utcOf(b); ms += 86_400_000) {
      const day = new Date(ms).getUTCDay();
      const isWeekend = day === 0 || (day === 6 && !saturdayIsBusinessDay);
      if (isWeekend) {
        weekend++;
        continue;
      }
      const name = holidays.get(ms);
      if (name) hit.push(`${brOf(fromUtc(ms))} — ${name}`);
      else business++;
    }
    return { businessDays: business, calendarDays, weekendDays: weekend, holidaysOnBusinessDays: hit };
  },
  fields: {
    start: { label: 'Data inicial (incluída)', inputType: 'date' },
    end: { label: 'Data final (incluída)', inputType: 'date' },
    optionalHolidays: { label: 'Tratar Carnaval e Corpus Christi como feriados (pontos facultativos)' },
    extraHolidays: { label: 'Feriados extras (estaduais, municipais)', multiline: true, placeholder: '25/01/2025, 2025-07-09', help: 'Datas separadas por vírgula, espaço ou linha (DD/MM/AAAA ou AAAA-MM-DD).' },
    saturdayIsBusinessDay: { label: 'Contar o sábado como dia útil' },
  },
  outputLabels: { businessDays: 'Dias úteis', calendarDays: 'Dias corridos', weekendDays: 'Fins de semana', holidaysOnBusinessDays: 'Feriados em dias de semana' },
  examples: [{ description: 'Janeiro de 2025', input: { start: '2025-01-01', end: '2025-01-31', optionalHolidays: false, saturdayIsBusinessDay: false }, output: { businessDays: 22, calendarDays: 31, weekendDays: 8 } }],
  documentation:
    'Conta de segunda a sexta (ou a sábado, se marcado), descontando os feriados nacionais: Confraternização Universal, Sexta-feira Santa, Tiradentes, Dia do Trabalho, Independência, Nossa Senhora Aparecida, Finados, Proclamação da República, Natal e, a partir de 2024, Consciência Negra (Lei 14.759/2023). Carnaval e Corpus Christi são pontos facultativos e só entram se você marcar. Feriados estaduais e municipais não estão embutidos: informe-os em "feriados extras".',
});

// ---------- idade ----------

export function ageBetween(birth: CalendarDate, reference: CalendarDate) {
  let months = (reference.year - birth.year) * 12 + (reference.month - birth.month);
  while (months > 0 && utcOf(addMonthsClamped(birth, months)) > utcOf(reference)) months--;
  const anchor = addMonthsClamped(birth, months);
  const days = Math.round((utcOf(reference) - utcOf(anchor)) / 86_400_000);
  return { years: Math.floor(months / 12), months: months % 12, days, totalDays: Math.round((utcOf(reference) - utcOf(birth)) / 86_400_000) };
}

export const ageTool = defineTool({
  id: 'idade',
  name: 'Calculadora de Idade',
  description: 'Calcula a idade exata em anos, meses e dias e quanto falta para o próximo aniversário',
  category: 'calculadoras',
  keywords: ['idade', 'aniversário', 'nascimento', 'anos', 'meses', 'dias vividos', 'quantos anos'],
  icon: '🎂',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({ birthDate: isoDateField('Data de nascimento'), referenceDate: isoDateField('Data de referência').optional() }),
  outputSchema: z.object({ age: z.string(), years: z.number(), months: z.number(), days: z.number(), totalDays: z.number(), nextBirthday: z.string(), daysToNextBirthday: z.number(), birthWeekday: z.string() }),
  execute: ({ birthDate, referenceDate }) => {
    const birth = parseIsoDate(birthDate) as CalendarDate;
    const ref = referenceDate ? (parseIsoDate(referenceDate) as CalendarDate) : today();
    if (utcOf(ref) < utcOf(birth)) throw new ToolError('A data de referência é anterior ao nascimento');
    const a = ageBetween(birth, ref);
    // Quem nasceu em 29/02 faz aniversário em 28/02 nos anos comuns.
    const thisYear = addMonthsClamped(birth, (ref.year - birth.year) * 12);
    const next = utcOf(thisYear) >= utcOf(ref) ? thisYear : addMonthsClamped(birth, (ref.year - birth.year + 1) * 12);
    return {
      age: `${a.years} anos, ${a.months} meses e ${a.days} dias`, years: a.years, months: a.months, days: a.days, totalDays: a.totalDays,
      nextBirthday: brOf(next), daysToNextBirthday: Math.round((utcOf(next) - utcOf(ref)) / 86_400_000), birthWeekday: WEEKDAYS[weekdayOf(birth)] as string,
    };
  },
  fields: {
    birthDate: { label: 'Data de nascimento', inputType: 'date' },
    referenceDate: { label: 'Calcular a idade em (opcional)', inputType: 'date', help: 'Se vazio, usa a data de hoje do seu dispositivo.' },
  },
  outputLabels: { age: 'Idade', years: 'Anos', months: 'Meses', days: 'Dias', totalDays: 'Dias vividos', nextBirthday: 'Próximo aniversário', daysToNextBirthday: 'Dias até o aniversário', birthWeekday: 'Nasceu em' },
  examples: [{ description: 'Em 15/06/2024', input: { birthDate: '1990-03-10', referenceDate: '2024-06-15' }, output: { years: 34, months: 3, days: 5, birthWeekday: 'sábado' } }],
  documentation:
    'Conta anos e meses completos desde o nascimento e os dias restantes. Quem nasceu em 29/02 comemora em 28/02 nos anos que não são bissextos. O cálculo é de calendário (sem horário nem fuso).',
});

// ---------- ciclo do sono ----------

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
const fromMinutes = (n: number) => {
  const x = ((n % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};

export const sleepCycleTool = defineTool({
  id: 'ciclo-sono',
  name: 'Calculadora de Ciclos de Sono',
  description: 'Sugere horários para dormir ou acordar em múltiplos de ciclos de sono de 90 minutos',
  category: 'calculadoras',
  keywords: ['sono', 'ciclos', 'dormir', 'acordar', 'horário', 'descanso', 'rem', '90 minutos'],
  icon: '😴',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    mode: z.enum(['wake', 'sleep']).default('wake'),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').default('07:00'),
    fallAsleepMinutes: z.number().int().min(0).max(120).default(15),
  }),
  outputSchema: z.object({ suggestions: z.array(z.string()), note: z.string() }),
  execute: ({ mode, time, fallAsleepMinutes }) => {
    const base = toMinutes(time);
    const cycles = [6, 5, 4, 3];
    const suggestions = cycles.map((c) => {
      const duration = c * 90;
      const label = `${c} ciclos (${roundTo(duration / 60, 1)} h de sono)`;
      return mode === 'wake'
        ? `Dormir às ${fromMinutes(base - duration - fallAsleepMinutes)} — ${label}`
        : `Acordar às ${fromMinutes(base + fallAsleepMinutes + duration)} — ${label}`;
    });
    return { suggestions, note: 'Estimativa baseada em ciclos médios de 90 minutos; o tempo real varia entre pessoas e noites. Adultos costumam precisar de 7 a 9 horas.' };
  },
  fields: {
    mode: { label: 'Quero descobrir', optionLabels: { wake: 'A que horas dormir (sei quando preciso acordar)', sleep: 'A que horas acordar (sei quando vou dormir)' } },
    time: { label: 'Horário (HH:MM)', placeholder: '07:00' },
    fallAsleepMinutes: { label: 'Minutos para pegar no sono' },
  },
  outputLabels: { suggestions: 'Sugestões', note: 'Observação' },
  examples: [{ description: 'Acordar às 07:00', input: { mode: 'wake', time: '07:00', fallAsleepMinutes: 15 }, output: { suggestions: ['Dormir às 21:45 — 6 ciclos (9 h de sono)', 'Dormir às 23:15 — 5 ciclos (7.5 h de sono)', 'Dormir às 00:45 — 4 ciclos (6 h de sono)', 'Dormir às 02:15 — 3 ciclos (4.5 h de sono)'] } }],
  documentation:
    'O sono se organiza em ciclos de cerca de 90 minutos; acordar ao fim de um ciclo costuma dar menos sensação de grogue do que no meio dele. Este cálculo é uma referência geral, não um diagnóstico: se você dorme mal com frequência, procure um profissional de saúde.',
});

