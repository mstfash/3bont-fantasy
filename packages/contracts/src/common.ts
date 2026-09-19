import { z } from 'zod';
import { fantasyTicks, pointUnits } from '@fantasy/domain';

export const idSchema = z.uuid();
export const localeSchema = z.enum(['ar', 'en']);
export const localizedSchema = z.strictObject({
  ar: z.string().trim().min(1).max(5000),
  en: z.string().trim().min(1).max(5000),
});
export const instantSchema = z.iso.datetime({ offset: true });
export const fantasyTicksSchema = z
  .int()
  .nonnegative()
  .max(1_000_000)
  .transform(fantasyTicks);
export const pointUnitsSchema = z
  .int()
  .min(-1_000_000_000)
  .max(1_000_000_000)
  .transform(pointUnits);
export const positionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/u);
export const httpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === 'https:',
    'HTTPS URL required',
  );
export type Localized = z.infer<typeof localizedSchema>;

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    requestId: z.uuid(),
  }),
});
