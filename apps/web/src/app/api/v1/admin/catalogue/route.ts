import { executeCatalogueCommand } from '@fantasy/application';
import { catalogueCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    catalogueCommandSchema,
    async ({ db, principal, grants }, input) => ({
      entity: await executeCatalogueCommand(db, principal, grants, input),
    }),
  );
}
