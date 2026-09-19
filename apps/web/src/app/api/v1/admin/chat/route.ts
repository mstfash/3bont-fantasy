import { chatModerationCommandSchema } from '@fantasy/contracts';
import { executeChatModeration } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    chatModerationCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeChatModeration(db, principal, grants, command),
    }),
  );
}
