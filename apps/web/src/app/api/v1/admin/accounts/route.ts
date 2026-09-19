import { accountModerationCommandSchema } from '@fantasy/contracts';
import { executeAccountModeration } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    accountModerationCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeAccountModeration(db, principal, grants, command),
    }),
  );
}
