import { readBoundedBody, RequestTooLarge } from './bounded-body';
import { randomUUID } from 'node:crypto';
import {
  AccessDenied,
  CommandRejected,
  loadStaffContext,
} from '@fantasy/application';
import { z } from 'zod';
import { getRuntime } from './runtime';

type StaffActionContext = Awaited<ReturnType<typeof loadStaffContext>> & {
  db: ReturnType<typeof getRuntime>['db'];
};

/** HTTP mechanics only. Each application command owns capability/scope and transaction checks. */
export async function staffMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  execute: (
    context: StaffActionContext,
    input: T,
  ) => Promise<Record<string, unknown>>,
  maximumBytes = 500000,
): Promise<Response> {
  const requestId = randomUUID();
  const failure = (code: string, status: number) =>
    Response.json(
      { code, requestId },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const { auth, db, config } = getRuntime();
    if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
      return failure('access-denied', 403);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return failure('sign-in-required', 401);
    const context = await loadStaffContext(db, session);
    const text = new TextDecoder().decode(
      await readBoundedBody(request, maximumBytes),
    );
    const input: unknown = JSON.parse(text);
    const result = await execute({ ...context, db }, schema.parse(input));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'request-too-large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    if (error instanceof AccessDenied)
      return failure('staff-verification-required', 403);
    if (error instanceof CommandRejected) return failure(error.code, 409);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return failure('invalid-request', 400);
    console.error('Staff command failed', {
      requestId,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return failure('request-unconfirmed', 503);
  }
}
