import { readAccountClosurePreview } from '@fantasy/application';
import { SiteShell } from '@/components/site-shell';
import { AccountClosureControls } from '@/components/account-closure-controls';
import { requireSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import { requireLocale } from '@/lib/locale';
import '@/styles/groups.css';
export default async function CloseAccountPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    session = await requireSession(locale);
  const preview = await readAccountClosurePreview(getRuntime().db, {
    accountId: session.user.id,
    sessionId: session.session.id,
    emailVerified: session.user.emailVerified,
    mfaVerifiedAt: null,
    authenticatedAt: session.session.createdAt,
  });
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <h1 className="page-title">
          {locale === 'ar' ? 'مراجعة إغلاق الحساب' : 'REVIEW ACCOUNT CLOSURE'}
        </h1>
        <AccountClosureControls locale={locale} preview={preview} />
      </section>
    </SiteShell>
  );
}
