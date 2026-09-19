import { executeResultCommand } from '@fantasy/application';
import { resultCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    resultCommandSchema,
    async ({ db, principal, grants }, input) => ({
      gameweek: await executeResultCommand(db, principal, grants, input),
    }),
  );
}
