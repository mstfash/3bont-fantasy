import { staffCommandSchema } from '@fantasy/contracts';
import { executeStaffCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    staffCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeStaffCommand(db, principal, grants, command),
    }),
  );
}
