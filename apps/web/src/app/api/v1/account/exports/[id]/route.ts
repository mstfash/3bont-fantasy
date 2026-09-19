import {
  AccessDenied,
  CommandRejected,
  readAccountExportDownload,
  readAccountExportChunk,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const parsed = idSchema.safeParse((await params).id);
    if (!parsed.success)
      return Response.json(
        { code: 'archive-unavailable' },
        { status: 404, headers },
      );
    const session = await currentSession();
    if (!session)
      return Response.json(
        { code: 'sign-in-required' },
        { status: 401, headers },
      );
    const db = getRuntime().db,
      principal = {
        accountId: session.user.id,
        sessionId: session.session.id,
        emailVerified: session.user.emailVerified,
        mfaVerifiedAt: null,
        authenticatedAt: session.session.createdAt,
      },
      archive = await readAccountExportDownload(db, principal, parsed.data);
    if (archive.byteLength === null || archive.checksum === null)
      throw new CommandRejected('archive-unavailable');
    let sequence = 0,
      cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await readAccountExportChunk(
            db,
            principal,
            archive.id,
            sequence,
          );
          if (cancelled) return;
          if (!chunk) {
            controller.close();
            return;
          }
          controller.enqueue(new TextEncoder().encode(chunk.body));
          sequence++;
        } catch {
          if (!cancelled)
            controller.error(new Error('Archive download interrupted'));
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': 'attachment; filename="3bont-game-data.ndjson"',
        'Content-Length': String(archive.byteLength),
        'X-Archive-SHA256': archive.checksum,
      },
    });
  } catch (error) {
    const denied = error instanceof AccessDenied;
    return Response.json(
      {
        code: denied
          ? 'access-denied'
          : error instanceof CommandRejected
            ? error.code
            : 'request-unconfirmed',
      },
      {
        status: denied ? 403 : error instanceof CommandRejected ? 404 : 503,
        headers,
      },
    );
  }
}
