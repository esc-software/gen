import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';

/**
 * Fator médio anual de emissão de CO2 da geração do Sistema Interligado Nacional (tCO2/MWh = kg CO2/kWh).
 * Fonte: MCTI, "Fatores de emissão de CO2 pela geração de energia elétrica no SIN", aba "Inventários" (média anual),
 * planilha Inventario_2026_janset.xlsx, conferida em 18/10/2026. Os valores de 2025 em diante usam a base de dados
 * aprimorada do ONS e não são diretamente comparáveis aos anteriores.
 */
export const GRID_FACTORS: Record<number, number> = {
  2018: 0.074,
  2019: 0.075,
  2020: 0.0617,
  2021: 0.1263,
  2022: 0.0426,
  2023: 0.0385,
  2024: 0.0545,
  2025: 0.0461,
};
export const GRID_SOURCE = 'MCTI, fator médio anual de emissão de CO2 do SIN (planilha de inventários), conferido em 18/10/2026';

const GWP_CH4 = 28;
const GWP_N2O = 265;

interface FuelFactor {
  /** Unidade em que o combustível é medido. */
  unit: 'L' | 'm³' | 'kg';
  co2: number;
  ch4: number;
  n2o: number;
}

/**
 * Fatores de combustão (kg do gás por unidade) do Programa Brasileiro GHG Protocol, como apresentados em
 * material do PLVB/IBTS de 13/03/2024 (GWP de 100 anos: CH4 = 28 e N2O = 265).
 * Nos combustíveis de origem vegetal, o CO2 é biogênico e não entra no total (só CH4 e N2O).
 */
export const FUEL_FACTORS = {
  gasoline: { unit: 'L', co2: 2.212, ch4: 0.00081, n2o: 0.00026 },
  diesel: { unit: 'L', co2: 2.603, ch4: 0.00014, n2o: 0.00014 },
  ethanolHydrous: { unit: 'L', co2: 1.457, ch4: 0.00038, n2o: 0.00001 },
  ethanolAnhydrous: { unit: 'L', co2: 1.526, ch4: 0.00022, n2o: 0.00001 },
  biodiesel: { unit: 'L', co2: 2.431, ch4: 0.00033, n2o: 0.00002 },
  cng: { unit: 'm³', co2: 1.999, ch4: 0.00339, n2o: 0.00011 },
  lpg: { unit: 'kg', co2: 2.932, ch4: 0.00288, n2o: 0.00001 },
} as const satisfies Record<string, FuelFactor>;
export const FUEL_SOURCE = 'Programa Brasileiro GHG Protocol (FGV), fatores de combustão, conforme material do PLVB/IBTS de 13/03/2024';

export interface Emission {
  /** kg de CO2 equivalente que entram no total. */
  fossilKg: number;
  /** kg de CO2 de origem biogênica (informado à parte, fora do total). */
  biogenicKg: number;
}

const co2e = (f: FuelFactor) => f.ch4 * GWP_CH4 + f.n2o * GWP_N2O;
const BIOGENIC = new Set<keyof typeof FUEL_FACTORS>(['ethanolHydrous', 'ethanolAnhydrous', 'biodiesel']);

function emission(fuel: keyof typeof FUEL_FACTORS, amount: number): Emission {
  const f: FuelFactor = FUEL_FACTORS[fuel];
  return BIOGENIC.has(fuel) ? { fossilKg: amount * co2e(f), biogenicKg: amount * f.co2 } : { fossilKg: amount * (f.co2 + co2e(f)), biogenicKg: 0 };
}

export type FuelKind = 'gasoline' | 'ethanol' | 'diesel' | 'cng' | 'none';

/** Emissão de um combustível de uso final. A gasolina C e o diesel comercial são misturas: a parte vegetal vem do percentual informado. */
export function fuelEmission(kind: FuelKind, amount: number, ethanolShare: number, biodieselShare: number): Emission {
  if (kind === 'none' || amount <= 0) return { fossilKg: 0, biogenicKg: 0 };
  const parts: Array<[keyof typeof FUEL_FACTORS, number]> =
    kind === 'gasoline' ? [['gasoline', 1 - ethanolShare / 100], ['ethanolAnhydrous', ethanolShare / 100]]
    : kind === 'diesel' ? [['diesel', 1 - biodieselShare / 100], ['biodiesel', biodieselShare / 100]]
    : kind === 'ethanol' ? [['ethanolHydrous', 1]]
    : [['cng', 1]];
  return parts.reduce<Emission>((acc, [fuel, share]) => {
    const e = emission(fuel, amount * share);
    return { fossilKg: acc.fossilKg + e.fossilKg, biogenicKg: acc.biogenicKg + e.biogenicKg };
  }, { fossilKg: 0, biogenicKg: 0 });
}

const round = (n: number, d = 2) => Number(n.toFixed(d));
const kgText = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
const LATEST = Math.max(...Object.keys(GRID_FACTORS).map(Number));

export const carbonFootprintTool = defineTool({
  id: 'pegada-carbono',
  name: 'Calculadora de Pegada de Carbono (Energia, Carro e Gás)',
  description: 'Estima as emissões de CO2 equivalente da sua energia elétrica, do combustível do carro e do gás de cozinha, com fatores oficiais brasileiros',
  category: 'calculadoras',
  keywords: ['pegada de carbono', 'calculadora de carbono', 'emissão de co2', 'co2 do carro', 'co2 da energia elétrica', 'carbono', 'gases de efeito estufa', 'meio ambiente', 'sustentabilidade'],
  icon: '🌱',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    period: z.enum(['month', 'year']).default('month'),
    electricityKwh: z.number().finite().min(0).max(1e9).default(150),
    gridYear: z.coerce.number().int().refine((y) => y in GRID_FACTORS, { message: `Anos disponíveis: ${Object.keys(GRID_FACTORS).join(', ')}` }).default(LATEST),
    fuel: z.enum(['none', 'gasoline', 'ethanol', 'diesel', 'cng']).default('gasoline'),
    fuelAmount: z.number().finite().min(0).max(1e9).default(0),
    distanceKm: z.number().finite().min(0).max(1e9).default(600),
    kmPerUnit: z.number().finite().min(0).max(1000).default(11),
    lpgKg: z.number().finite().min(0).max(1e6).default(13),
    ethanolSharePercent: z.number().finite().min(0).max(100).default(30),
    biodieselSharePercent: z.number().finite().min(0).max(100).default(15),
  }),
  outputSchema: z.object({
    electricityKg: z.number(), fuelKg: z.number(), lpgKg: z.number(), totalKg: z.number(), totalTonnes: z.number(), perYearKg: z.number(),
    liters: z.number(), biogenicKg: z.number(), sources: z.string(), notes: z.string(),
  }),
  execute: (v) => {
    const grid = GRID_FACTORS[v.gridYear];
    if (grid === undefined) throw new ToolError('Ano sem fator da rede elétrica');
    // Consumo informado direto ou calculado pela distância e pela autonomia.
    const amount = v.fuelAmount > 0 ? v.fuelAmount : v.distanceKm > 0 && v.kmPerUnit > 0 ? v.distanceKm / v.kmPerUnit : 0;
    if (v.fuel !== 'none' && v.fuelAmount <= 0 && v.distanceKm > 0 && v.kmPerUnit <= 0) throw new ToolError('Informe a autonomia do veículo (km por litro ou por m³)');
    const electricityKg = v.electricityKwh * grid;
    const fuel = fuelEmission(v.fuel, amount, v.ethanolSharePercent, v.biodieselSharePercent);
    const lpg = emission('lpg', v.lpgKg);
    const totalKg = electricityKg + fuel.fossilKg + lpg.fossilKg;
    const yearly = v.period === 'month' ? totalKg * 12 : totalKg;
    return {
      electricityKg: round(electricityKg),
      fuelKg: round(fuel.fossilKg),
      lpgKg: round(lpg.fossilKg),
      totalKg: round(totalKg),
      totalTonnes: round(totalKg / 1000, 3),
      perYearKg: round(yearly),
      liters: round(amount),
      biogenicKg: round(fuel.biogenicKg),
      sources: `Energia elétrica: ${GRID_SOURCE} (${v.gridYear}: ${grid} kg CO2/kWh). Combustíveis e gás: ${FUEL_SOURCE}.`,
      notes: `Estimativa só do que você informou (energia, combustível e gás), em CO2 equivalente (CH4 × 28 e N2O × 265). Não inclui voos, ônibus, alimentação, compras nem a produção dos combustíveis. O CO2 do etanol e do biodiesel é biogênico e fica fora do total (${kgText(fuel.biogenicKg)} no período). A gasolina é calculada como mistura com ${v.ethanolSharePercent}% de etanol anidro e o diesel com ${v.biodieselSharePercent}% de biodiesel; ajuste se a mistura vigente mudar.`,
    };
  },
  fields: {
    period: { label: 'Os valores são de', optionLabels: { month: 'Um mês', year: 'Um ano' } },
    electricityKwh: { label: 'Energia elétrica no período (kWh)', help: 'Está na conta de luz.' },
    gridYear: { label: 'Ano do fator da rede elétrica', help: `Médias anuais do MCTI: ${Object.keys(GRID_FACTORS).join(', ')}.` },
    fuel: { label: 'Combustível do veículo', optionLabels: { none: 'Nenhum', gasoline: 'Gasolina', ethanol: 'Etanol hidratado', diesel: 'Diesel', cng: 'GNV' } },
    fuelAmount: { label: 'Combustível usado (litros, ou m³ no GNV)', help: 'Deixe 0 para calcular pela distância e pela autonomia.' },
    distanceKm: { label: 'Distância percorrida no período (km)' },
    kmPerUnit: { label: 'Autonomia (km por litro ou por m³)' },
    lpgKg: { label: 'Gás de cozinha no período (kg)', help: 'Um botijão P13 tem 13 kg.' },
    ethanolSharePercent: { label: 'Etanol anidro na gasolina (%)', help: 'Define a parte vegetal da gasolina C. Padrão: 30%.' },
    biodieselSharePercent: { label: 'Biodiesel no diesel (%)', help: 'Padrão: 15%.' },
  },
  outputLabels: {
    electricityKg: 'Energia elétrica (kg CO2e)', fuelKg: 'Combustível do veículo (kg CO2e)', lpgKg: 'Gás de cozinha (kg CO2e)', totalKg: 'Total no período (kg CO2e)', totalTonnes: 'Total no período (t CO2e)',
    perYearKg: 'Projeção para um ano (kg CO2e)', liters: 'Combustível considerado (L ou m³)', biogenicKg: 'CO2 biogênico, fora do total (kg)', sources: 'Fontes dos fatores', notes: 'Observações',
  },
  examples: [{ description: 'Casa com 150 kWh, 600 km de gasolina a 11 km/L e um botijão no mês', input: { period: 'month', electricityKwh: 150, gridYear: 2025, fuel: 'gasoline', fuelAmount: 0, distanceKm: 600, kmPerUnit: 11, lpgKg: 13, ethanolSharePercent: 30, biodieselSharePercent: 15 } }],
  documentation:
    'Energia elétrica: kWh multiplicado pelo fator médio anual de emissão da geração do Sistema Interligado Nacional publicado pelo MCTI (kg CO2 por kWh). A rede brasileira é majoritariamente renovável, então esse fator é baixo e varia bastante de ano para ano (mais térmicas ligadas, mais emissão). Combustíveis: litros (ou a distância dividida pela autonomia) multiplicados pelos fatores de combustão do Programa Brasileiro GHG Protocol, somando CO2, CH4 e N2O em CO2 equivalente; a gasolina e o diesel são misturas com etanol e biodiesel, cujo CO2 é biogênico e não entra no total. Gás de cozinha em kg. É uma estimativa para ter uma ordem de grandeza e comparar hábitos, não um inventário corporativo.',
});
