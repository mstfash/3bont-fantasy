import { executeProviderScheduleCommand } from '@fantasy/application';
import { providerScheduleCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    providerScheduleCommandSchema,
    async ({ db, principal, grants }, input) => ({
      schedule: await executeProviderScheduleCommand(
        db,
        principal,
        grants,
        input,
      ),
    }),
  );
}
