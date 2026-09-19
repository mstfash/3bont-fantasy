import { executeProfileCommand } from '@fantasy/application';
import { profileCommandSchema } from '@fantasy/contracts';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    profileCommandSchema,
    executeProfileCommand,
  );
}
