import { z } from 'zod';
import {
  fantasyTicksSchema,
  instantSchema,
  idSchema,
  positionSchema,
} from './common.ts';
import type { Footballer } from './football.ts';
const bounds = z
  .strictObject({ minimum: fantasyTicksSchema, maximum: fantasyTicksSchema })
  .refine((b) => b.minimum <= b.maximum);
export const initialPricePolicySchema = z.strictObject({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  staleDays: z.int().min(1).max(3650),
  bounds: z.strictObject({ GK: bounds, DEF: bounds, MID: bounds, FWD: bounds }),
});
export const initialPriceReviewSchema = z.strictObject({
  policy: initialPricePolicySchema,
  positions: z
    .array(z.strictObject({ footballerId: idSchema, position: positionSchema }))
    .min(1)
    .max(2000),
  asOf: instantSchema,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type InitialPriceReview = z.infer<typeof initialPriceReviewSchema>;
/** Stable source bytes shared by browser review and server publication; JSONB key order is irrelevant. */
export function initialPriceSourceText(
  footballers: readonly Footballer[],
): string {
  return JSON.stringify(
    [...footballers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        seasonId: p.seasonId,
        clubId: p.clubId,
        name: { ar: p.name.ar, en: p.name.en },
        defaultPosition: p.defaultPosition,
        status: p.status,
        synthetic: p.synthetic,
        valuation: p.valuation
          ? {
              amountMinor: p.valuation.amountMinor,
              currency: p.valuation.currency,
              asOf: p.valuation.asOf,
              sourceName: p.valuation.sourceName,
              sourceUrl: p.valuation.sourceUrl,
              licensedForDisplay: p.valuation.licensedForDisplay,
            }
          : null,
      })),
  );
}
