import { executeCatalogueImport } from '@fantasy/application';
import { catalogueImportCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    catalogueImportCommandSchema,
    async ({ db, principal, grants }, input) => ({
      result: await executeCatalogueImport(db, principal, grants, input),
    }),
    2_100_000,
  );
}
