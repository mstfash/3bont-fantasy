import { z } from 'zod';
import {
  chatCommandSchema,
  idSchema,
  chatCursorSchema,
} from '@fantasy/contracts';
import {
  AccessDenied,
  executeChatCommand,
  readChatPage,
} from '@fantasy/application';
import { participantMutation } from '@/server/participant-mutation';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
export function POST(request: Request) {
  return participantMutation(request, chatCommandSchema, executeChatCommand);
}
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const url = new URL(request.url),
      competitionId = idSchema.parse(url.searchParams.get('competitionId')),
      groupId = idSchema.parse(url.searchParams.get('groupId')),
      before = chatCursorSchema
        .nullable()
        .parse(url.searchParams.get('before'));
    const result = await readChatPage(
      getRuntime().db,
      {
        accountId: session.user.id,
        sessionId: session.session.id,
        emailVerified: session.user.emailVerified,
        mfaVerifiedAt: null,
        authenticatedAt: session.session.createdAt,
      },
      competitionId,
      groupId,
      before,
    );
    return Response.json({ result }, { headers });
  } catch (error) {
    if (error instanceof AccessDenied)
      return Response.json({ code: 'access-denied' }, { status: 403, headers });
    if (error instanceof z.ZodError)
      return Response.json(
        { code: 'invalid-request' },
        { status: 400, headers },
      );
    return Response.json(
      { code: 'request-unconfirmed' },
      { status: 503, headers },
    );
  }
}
