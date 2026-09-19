import { executeChipGrantCommand } from '@fantasy/application';
import { chipGrantCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    chipGrantCommandSchema,
    async ({ db, principal, grants }, input) => ({
      result: await executeChipGrantCommand(db, principal, grants, input),
    }),
  );
}
