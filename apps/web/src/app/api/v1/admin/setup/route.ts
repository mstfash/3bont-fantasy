import { executeSetupCommand } from '@fantasy/application';
import { setupCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';

export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    setupCommandSchema,
    async ({ db, principal, grants }, input) => ({
      competition: await executeSetupCommand(db, principal, grants, input),
    }),
  );
}
