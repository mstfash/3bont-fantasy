import { entryLifecycleCommandSchema } from '@fantasy/contracts';
import { executeEntryLifecycle } from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
export async function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    entryLifecycleCommandSchema,
    executeEntryLifecycle,
  );
}
