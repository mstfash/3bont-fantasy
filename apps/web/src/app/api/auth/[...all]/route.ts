import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import { getRuntime, IdentityUnavailable } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  try {
    return await (await getRuntime().getIdentity()).handler(request);
  } catch (error) {
    if (error instanceof IdentityUnavailable) return unavailable();
    throw error;
  }
}
function unavailable(): Response {
  return Response.json(
    { code: 'SERVICE_UNAVAILABLE' },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBoundedBody(request, 16000);
    return await (
      await getRuntime().getIdentity()
    ).handler(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
        signal: request.signal,
      }),
    );
  } catch (error) {
    if (error instanceof IdentityUnavailable) return unavailable();
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'REQUEST_TOO_LARGE' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    throw error;
  }
}
