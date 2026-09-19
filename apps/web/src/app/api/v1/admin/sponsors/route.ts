import { sponsorCommandSchema } from '@fantasy/contracts';
import { executeSponsorCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    sponsorCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeSponsorCommand(db, principal, grants, command),
    }),
  );
}
