import { executeEmptyGameweek } from '@fantasy/application';
import { emptyGameweekCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    emptyGameweekCommandSchema,
    async ({ db, principal }, input) => ({
      gameweek: await executeEmptyGameweek(db, principal, input),
    }),
    12000,
  );
}
