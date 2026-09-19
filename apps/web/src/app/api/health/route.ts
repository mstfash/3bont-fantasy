import { applicationSchemaReady } from '@fantasy/persistence';
import { getRuntime } from '@/server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public readiness reports no credentials, account state, schema details or exception text. */
export async function GET() {
  let ready: boolean;
  try {
    ready = await applicationSchemaReady(getRuntime().pool);
  } catch {
    ready = false;
  }
  return Response.json(
    { status: ready ? 'ready' : 'unavailable' },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
