import { idSchema } from '@fantasy/contracts';
import {
  AccessDenied,
  loadStaffContext,
  readSponsorAsset,
} from '@fantasy/application';
import { getRuntime } from '@/server/runtime';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id).data;
  if (!id) return new Response(null, { status: 404 });
  const { db, auth } = getRuntime();
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const staff = session
      ? await loadStaffContext(db, session).catch((e: unknown) => {
          if (e instanceof AccessDenied) return null;
          throw e;
        })
      : null;
    const asset = await readSponsorAsset(db, id, staff);
    if (!asset)
      return new Response(null, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    return new Response(new Uint8Array(asset.content), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(asset.content.length),
        'Cache-Control': asset.public
          ? 'public, max-age=300'
          : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        ETag: `"${asset.checksum}"`,
      },
    });
  } catch (e) {
    if (e instanceof AccessDenied)
      return new Response(null, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    throw e;
  }
}
