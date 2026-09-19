import { readBoundedBody, RequestTooLarge } from '@/server/bounded-body';
import { z } from 'zod';
import { sponsorUploadFieldsSchema } from '@fantasy/contracts';
import {
  AccessDenied,
  CommandRejected,
  loadStaffContext,
  requireCapability,
  storeSponsorAsset,
} from '@fantasy/application';
import { getRuntime } from '@/server/runtime';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const fail = (code: string, status: number) =>
    Response.json({ code }, { status, headers });
  try {
    const { db, auth, config } = getRuntime();
    if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin)
      return fail('access-denied', 403);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return fail('sign-in-required', 401);
    const context = await loadStaffContext(db, session);
    const scope = new URL(request.url).searchParams.get('competitionId');
    requireCapability(
      context.principal,
      context.grants,
      'sponsors.manage',
      scope,
      new Date(),
      true,
    );
    const bytes = await readBoundedBody(request, 4 * 1024 * 1024 + 16000);
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
    const fields = sponsorUploadFieldsSchema.parse({
        commandId: form.get('commandId'),
        competitionId: scope,
        label: form.get('label'),
        authorizationReference: form.get('authorizationReference'),
      }),
      file = form.get('file');
    if (!(file instanceof File)) return fail('invalid-request', 400);
    const result = await storeSponsorAsset(
      db,
      context.principal,
      context.grants,
      fields,
      Buffer.from(await file.arrayBuffer()),
    );
    return Response.json({ result }, { headers });
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return fail('sponsor-image-size', 413);
    if (error instanceof AccessDenied)
      return fail('staff-verification-required', 403);
    if (error instanceof CommandRejected) return fail(error.code, 409);
    if (error instanceof z.ZodError || error instanceof TypeError)
      return fail('invalid-request', 400);
    return fail('request-unconfirmed', 503);
  }
}
