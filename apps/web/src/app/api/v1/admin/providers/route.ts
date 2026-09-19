import { providerCommandSchema } from '@fantasy/contracts';
import { executeProviderCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export async function POST(request: Request) {
  return staffMutation(
    request,
    providerCommandSchema,
    async (context, input) => ({
      result: await executeProviderCommand(
        context.db,
        context.principal,
        context.grants,
        input,
      ),
    }),
  );
}
