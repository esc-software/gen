import { z } from 'zod';

/** Inteiro positivo dentro de [min, max], usado por ferramentas com parâmetro de tamanho. */
export const boundedLength = (min: number, max: number) =>
  z.number().int().min(min).max(max);
