import { executeMatchDataCommand } from '@fantasy/application';
import { matchDataCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    matchDataCommandSchema,
    async ({ db, principal, grants }, input) => ({
      fixture: await executeMatchDataCommand(db, principal, grants, input),
    }),
  );
}
