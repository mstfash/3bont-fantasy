import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import { getRuntime } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Promise<Response> {
  return getRuntime().auth.handler(request);
}
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBoundedBody(request, 16000);
    return await getRuntime().auth.handler(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
        signal: request.signal,
      }),
    );
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'REQUEST_TOO_LARGE' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    throw error;
  }
}
