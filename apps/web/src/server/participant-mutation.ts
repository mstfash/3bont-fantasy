import { readBoundedBody, RequestTooLarge } from './bounded-body';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AccessDenied,
  CommandRejected,
  type Principal,
} from '@fantasy/application';
import { getRuntime } from './runtime';
import { currentSession } from './session';
/** Shared HTTP boundary. Every command still enforces its own ownership and account state. */
export async function participantMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  execute: (
    db: ReturnType<typeof getRuntime>['db'],
    principal: Principal,
    input: T,
  ) => Promise<unknown>,
): Promise<Response> {
  const requestId = randomUUID();
  const failure = (code: string, status: number) =>
    Response.json(
      { code, requestId },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const { config, db } = getRuntime();
    if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
      return failure('access-denied', 403);
    const session = await currentSession();
    if (!session) return failure('sign-in-required', 401);
    const text = new TextDecoder().decode(
      await readBoundedBody(request, 24000),
    );
    const input: unknown = JSON.parse(text);
    const result = await execute(
      db,
      {
        accountId: session.user.id,
        sessionId: session.session.id,
        emailVerified: session.user.emailVerified,
        mfaVerifiedAt: null,
        authenticatedAt: session.session.createdAt,
      },
      schema.parse(input),
    );
    return Response.json(
      { result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'request-too-large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    if (error instanceof AccessDenied) return failure('access-denied', 403);
    if (error instanceof CommandRejected) return failure(error.code, 409);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return failure('invalid-request', 400);
    console.error('Participant command failed', {
      requestId,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return failure('request-unconfirmed', 503);
  }
}
