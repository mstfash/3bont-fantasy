import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import {
  StaffChallengeLimited,
  staffChallengeSchema,
  verifyStaffChallenge,
} from '@fantasy/application';
import { getRuntime } from '@/server/runtime';

export async function POST(request: Request): Promise<Response> {
  const { config, auth, db } = getRuntime();
  if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
    return Response.json({ code: 'access-denied' }, { status: 403 });
  try {
    const text = new TextDecoder().decode(await readBoundedBody(request, 2000));
    const input: unknown = JSON.parse(text);
    await verifyStaffChallenge(
      db,
      auth,
      request.headers,
      staffChallengeSchema.parse(input),
    );
    return Response.json(
      { verified: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return Response.json(
        { code: 'request-too-large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    return Response.json(
      {
        code:
          error instanceof StaffChallengeLimited
            ? 'rate-limited'
            : 'verification-failed',
      },
      { status: error instanceof StaffChallengeLimited ? 429 : 403 },
    );
  }
}
