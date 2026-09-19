import { executeProviderAcceptancePolicy } from '@fantasy/application';
import { providerAcceptanceCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    providerAcceptanceCommandSchema,
    async ({ db, principal }, input) => ({
      policy: await executeProviderAcceptancePolicy(db, principal, input),
    }),
    12000,
  );
}
