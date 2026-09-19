import { headToHeadCommandSchema } from '@fantasy/contracts';
import { executeHeadToHeadCommand } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    headToHeadCommandSchema,
    executeHeadToHeadCommand,
  );
}
