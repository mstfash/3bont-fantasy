import {
  AccessDenied,
  CommandRejected,
  exportCatalogueSeason,
  loadStaffContext,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { getRuntime } from '@/server/runtime';
export async function GET(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const { db, auth } = getRuntime(),
      session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const season = idSchema.safeParse(
      new URL(request.url).searchParams.get('season'),
    );
    if (!season.success)
      return Response.json(
        { code: 'invalid-request' },
        { status: 400, headers },
      );
    const { principal, grants } = await loadStaffContext(db, session);
    const manifest = await exportCatalogueSeason(
      db,
      principal,
      grants,
      season.data,
    );
    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="catalogue-season.json"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied)
      return Response.json(
        { code: 'staff-verification-required' },
        { status: 403, headers },
      );
    if (error instanceof CommandRejected)
      return Response.json({ code: error.code }, { status: 409, headers });
    console.error('Catalogue export failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return Response.json(
      { code: 'request-unconfirmed' },
      { status: 503, headers },
    );
  }
}
