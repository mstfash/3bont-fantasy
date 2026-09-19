import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import { sponsorMetricSchema } from '@fantasy/contracts';
import { recordSponsorMetric } from '@fantasy/application';
import { getRuntime } from '@/server/runtime';
export async function POST(request: Request) {
  const { db, config } = getRuntime();
  if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
    return new Response(null, { status: 403 });
  let text: string;
  try {
    text = new TextDecoder().decode(await readBoundedBody(request, 3000));
  } catch (e) {
    if (e instanceof RequestTooLarge)
      return new Response(null, { status: 413 });
    throw e;
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = sponsorMetricSchema.safeParse(input);
  if (!parsed.success) return new Response(null, { status: 400 });
  await recordSponsorMetric(
    db,
    parsed.data.token,
    parsed.data.kind,
    config.BETTER_AUTH_SECRET,
    request.headers.get('user-agent') ?? '',
  );
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
