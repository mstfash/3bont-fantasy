import {
  AccessDenied,
  loadStaffContext,
  readProviderEvidence,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { getRuntime } from '@/server/runtime';
export async function GET(request: Request): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const { db, getIdentity } = getRuntime();
    const auth = await getIdentity();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const attempt = idSchema.safeParse(
      new URL(request.url).searchParams.get('attempt'),
    );
    if (!attempt.success)
      return Response.json(
        { code: 'invalid-request' },
        { status: 400, headers },
      );
    const { principal, grants } = await loadStaffContext(db, session);
    const report = await readProviderEvidence(
      db,
      principal,
      grants,
      attempt.data,
    );
    if (!report)
      return Response.json(
        { code: 'provider-attempt-unavailable' },
        { status: 404, headers },
      );
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="provider-evidence-${attempt.data}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied)
      return Response.json(
        { code: 'staff-verification-required' },
        { status: 403, headers },
      );
    return Response.json(
      { code: 'request-unconfirmed' },
      { status: 503, headers },
    );
  }
}
