import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import { entryCommandSchema } from '@fantasy/contracts';
import {
  AccessDenied,
  CommandRejected,
  executeEntryCommand,
} from '@fantasy/application';
import { EntryRuleError } from '@fantasy/domain';
import { ZodError } from 'zod';
import { getRuntime } from '@/server/runtime';
import { currentSession } from '@/server/session';

export async function POST(request: Request): Promise<Response> {
  const { config, db } = getRuntime();
  if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
    return Response.json({ code: 'access-denied' }, { status: 403 });
  const session = await currentSession();
  if (!session)
    return Response.json({ code: 'sign-in-required' }, { status: 401 });
  try {
    const text = new TextDecoder().decode(
      await readBoundedBody(request, 24000),
    );
    const input: unknown = JSON.parse(text);
    const entry = await executeEntryCommand(
      db,
      {
        accountId: session.user.id,
        sessionId: session.session.id,
        emailVerified: session.user.emailVerified,
        mfaVerifiedAt: null,
        authenticatedAt: session.session.createdAt,
      },
      entryCommandSchema.parse(input),
    );
    return Response.json(
      { entry },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'request-too-large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    if (error instanceof AccessDenied)
      return Response.json({ code: 'access-denied' }, { status: 403 });
    if (error instanceof CommandRejected || error instanceof EntryRuleError)
      return Response.json({ code: error.code }, { status: 409 });
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json({ code: 'invalid-request' }, { status: 400 });
    console.error(
      'Entry command failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return Response.json({ code: 'request-unconfirmed' }, { status: 503 });
  }
}
