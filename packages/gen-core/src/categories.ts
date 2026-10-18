import { z } from 'zod';
import { CATEGORIES, type CategoryId } from './category-data.js';

export * from './category-data.js';

const ids = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const categoryIdSchema = z.enum(ids);
