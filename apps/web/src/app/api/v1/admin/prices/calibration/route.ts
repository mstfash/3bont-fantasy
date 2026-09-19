import {
  AccessDenied,
  CommandRejected,
  createPriceCalibration,
  loadStaffContext,
  readPriceCalibration,
} from '@fantasy/application';
import { idSchema, priceCalibrationCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
import { getRuntime } from '@/server/runtime';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    priceCalibrationCommandSchema,
    async ({ db, principal, grants }, input) => ({
      result: await createPriceCalibration(db, principal, grants, input),
    }),
  );
}
export async function GET(request: Request): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const { db, getIdentity } = getRuntime(),
      auth = await getIdentity(),
      session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const search = new URL(request.url).searchParams,
      competition = idSchema.safeParse(search.get('competition')),
      report = idSchema.safeParse(search.get('report'));
    if (!competition.success || !report.success)
      return Response.json(
        { code: 'invalid-request' },
        { status: 400, headers },
      );
    const { principal, grants } = await loadStaffContext(db, session);
    const result = await readPriceCalibration(
      db,
      principal,
      grants,
      competition.data,
      report.data,
    );
    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="price-calibration-${report.data}.json"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof AccessDenied
        ? 403
        : error instanceof CommandRejected
          ? 404
          : 503;
    return Response.json(
      {
        code:
          status === 403
            ? 'staff-verification-required'
            : status === 404
              ? 'calibration-report-unavailable'
              : 'request-unconfirmed',
      },
      { status, headers },
    );
  }
}
