import { previewProviderNormalization } from '@fantasy/application';
import { providerNormalizationSelectionSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    providerNormalizationSelectionSchema,
    async ({ db, principal, grants }, selection) => ({
      preview: await previewProviderNormalization(
        db,
        principal,
        grants,
        selection,
      ),
    }),
  );
}
