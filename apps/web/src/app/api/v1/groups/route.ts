import { groupCommandSchema } from '@fantasy/contracts';
import { executeGroupCommand } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request): Promise<Response> {
  return participantMutation(request, groupCommandSchema, executeGroupCommand);
}
