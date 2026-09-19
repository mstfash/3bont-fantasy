import { providerIdentityCommandSchema } from '@fantasy/contracts';
import { executeProviderIdentityCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    providerIdentityCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeProviderIdentityCommand(
        db,
        principal,
        grants,
        command,
      ),
    }),
  );
}
