import Link from 'next/link';
import { readAccountExports } from '@fantasy/application';
import { AccountExportControls } from '@/components/account-export-controls';
import { SiteShell } from '@/components/site-shell';
import { ProfileEditor } from '@/components/profile-editor';
import { requireSession } from '@/server/session';
import { requireLocale } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function ProfilePage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    session = await requireSession(locale);
  const account = await getRuntime()
    .db.selectFrom('accounts')
    .select('display_name')
    .where('id', '=', session.user.id)
    .executeTakeFirstOrThrow();
  const db = getRuntime().db;
  const [archives, competitionRows] = await Promise.all([
    readAccountExports(db, {
      accountId: session.user.id,
      sessionId: session.session.id,
      emailVerified: session.user.emailVerified,
      mfaVerifiedAt: null,
      authenticatedAt: session.session.createdAt,
    }),
    db
      .selectFrom('entries')
      .innerJoin('competitions', 'competitions.id', 'entries.competition_id')
      .select('competitions.data')
      .where('entries.account_id', '=', session.user.id)
      .execute(),
  ]);
  const competitions = [
    ...new Map(
      competitionRows.map((r) => [
        r.data.id,
        { id: r.data.id, name: r.data.name[locale] },
      ]),
    ).values(),
  ];
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <span className="eyebrow">
          {ar ? 'حسابك. اختيارك.' : 'YOUR ACCOUNT. YOUR CHOICE.'}
        </span>
        <h1 className="page-title">{ar ? 'ملفك الشخصي' : 'YOUR PROFILE'}</h1>
        <div className="group-grid">
          <section className="group-card">
            <h2>{ar ? 'اسمك في اللعبة' : 'YOUR NAME IN THE GAME'}</h2>
            <ProfileEditor locale={locale} displayName={account.display_name} />
          </section>
          <section className="group-card">
            <h2>{ar ? 'الوصول إلى حسابك' : 'ACCOUNT ACCESS'}</h2>
            <p>
              <bdi>{session.user.email}</bdi>
            </p>
            <p>
              {ar
                ? 'بريدك المؤكد خاص بحسابك ولا يظهر في ترتيب البطولات.'
                : 'Your verified email is private to your account and does not appear in standings.'}
            </p>
            <Link href={`/${locale}/security`}>
              {ar
                ? 'كلمة المرور والمصادقة'
                : 'Password and authenticator settings'}
            </Link>
          </section>
        </div>
        <p>
          <Link href={`/${locale}/profile/close`}>
            {ar ? 'مراجعة إغلاق الحساب' : 'Review account closure'}
          </Link>
        </p>
        <AccountExportControls
          locale={locale}
          initialArchives={archives}
          competitions={competitions}
          observedAt={new Date().toISOString()}
        />
      </section>
    </SiteShell>
  );
}
