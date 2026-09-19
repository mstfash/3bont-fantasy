import { groupHandoverCommandSchema } from '@fantasy/contracts';
import { executeGroupHandover } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    groupHandoverCommandSchema,
    executeGroupHandover,
  );
}
