import { chatModerationCommandSchema } from '@fantasy/contracts';
import { executeOrganizerChatModeration } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export function POST(request: Request) {
  return participantMutation(
    request,
    chatModerationCommandSchema,
    executeOrganizerChatModeration,
  );
}
