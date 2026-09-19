import { accountClosureCommandSchema } from '@fantasy/contracts';
import { executeAccountClosure } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    accountClosureCommandSchema,
    executeAccountClosure,
  );
}
