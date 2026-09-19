import {
  AccessDenied,
  requestAccountExport,
  readAccountExports,
} from '@fantasy/application';
import { accountExportCommandSchema } from '@fantasy/contracts';
import { participantMutation } from '@/server/participant-mutation';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
export function POST(request: Request): Promise<Response> {
  return participantMutation(
    request,
    accountExportCommandSchema,
    requestAccountExport,
  );
}
export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const archives = await readAccountExports(getRuntime().db, {
      accountId: session.user.id,
      sessionId: session.session.id,
      emailVerified: session.user.emailVerified,
      mfaVerifiedAt: null,
      authenticatedAt: session.session.createdAt,
    });
    return Response.json({ archives }, { headers });
  } catch (error) {
    return Response.json(
      {
        code:
          error instanceof AccessDenied
            ? 'access-denied'
            : 'request-unconfirmed',
      },
      { status: error instanceof AccessDenied ? 403 : 503, headers },
    );
  }
}
