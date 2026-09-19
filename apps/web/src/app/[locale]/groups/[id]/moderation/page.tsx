import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied, readChatModeration } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { ChatModerationPanel } from '@/components/chat/moderation-panel';
import { requireLocale } from '@/lib/locale';
import { requireSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
export default async function GroupModeration({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    session = await requireSession(locale),
    db = getRuntime().db;
  if (!idSchema.safeParse(p.id).success) notFound();
  const group = await db
    .selectFrom('league_groups')
    .select('competition_id')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!group) notFound();
  const data = await readChatModeration(
    db,
    {
      accountId: session.user.id,
      sessionId: session.session.id,
      emailVerified: session.user.emailVerified,
      mfaVerifiedAt: null,
      authenticatedAt: session.session.createdAt,
    },
    [],
    group.competition_id,
    p.id,
  ).catch((e: unknown) => {
    if (e instanceof AccessDenied) notFound();
    throw e;
  });
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section chat-page">
        <Link href={`/${locale}/groups/${p.id}/chat`}>{data.group.name} ↗</Link>
        <h1 className="page-title">
          {locale === 'ar' ? 'العب بروح رياضية.' : 'KEEP IT SPORTING.'}
        </h1>
        <ChatModerationPanel locale={locale} data={data} staff={false} />
      </section>
    </SiteShell>
  );
}
