import { z } from 'zod';
import type { RoutesFile } from './deals';

/** feed/routes.json (scripts/feed/prices.ts → buildRoutes). */
export const RoutesFileSchema: z.ZodType<RoutesFile> = z.object({
  updatedAt: z.string(),
  cities: z.record(z.tuple([z.string(), z.string(), z.number().nullable(), z.number().nullable()])),
  prices: z.array(z.tuple([z.string(), z.string(), z.string(), z.number(), z.string(), z.number()])),
});
