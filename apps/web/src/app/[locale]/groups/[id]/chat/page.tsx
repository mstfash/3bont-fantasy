import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied, readChatPage } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { ChatRoom } from '@/components/chat/chat-room';
import { requireLocale } from '@/lib/locale';
import { requireSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/chat.css';
export default async function ChatPage({
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
  const data = await readChatPage(
    db,
    {
      accountId: session.user.id,
      sessionId: session.session.id,
      emailVerified: session.user.emailVerified,
      mfaVerifiedAt: null,
      authenticatedAt: session.session.createdAt,
    },
    group.competition_id,
    p.id,
  ).catch((e: unknown) => {
    if (e instanceof AccessDenied) notFound();
    throw e;
  });
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section chat-page">
        <Link className="eyebrow" href={`/${locale}/groups/${p.id}`}>
          {data.groupName} ↗
        </Link>
        <h1 className="page-title">
          {locale === 'ar' ? 'كلام الملعب.' : 'TALK FOOTBALL.'}
        </h1>
        <p className="hero-description">
          {locale === 'ar'
            ? 'غرفة أعضاء المجموعة. احترم المنافس، واستمتع باللعبة.'
            : 'Your group’s room. Respect the rival. Enjoy the game.'}
        </p>
        <ChatRoom
          locale={locale}
          competitionId={group.competition_id}
          groupId={p.id}
          accountId={session.user.id}
          initial={data}
        />
      </section>
    </SiteShell>
  );
}
