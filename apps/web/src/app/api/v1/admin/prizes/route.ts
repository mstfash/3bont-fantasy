import { prizeCommandSchema } from '@fantasy/contracts';
import { executePrizeCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    prizeCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executePrizeCommand(db, principal, grants, command),
    }),
  );
}
