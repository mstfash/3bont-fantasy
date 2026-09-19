import { SiteShell } from '@/components/site-shell';
import { AccountSecurity } from '@/components/account-security';
import { requireLocale } from '@/lib/locale';
import { requireSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/auth.css';

export default async function SecurityPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const session = await requireSession(locale);
  const grant = await getRuntime()
    .db.selectFrom('staff_grants')
    .select('id')
    .where('account_id', '=', session.user.id)
    .executeTakeFirst();
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <span className="eyebrow">
          {locale === 'ar' ? 'أمان الحساب' : 'ACCOUNT SECURITY'}
        </span>
        <h1 className="page-title">
          {locale === 'ar' ? 'حماية قرارك.' : 'PROTECT YOUR PLAY.'}
        </h1>
        <AccountSecurity
          locale={locale}
          enabled={session.user.twoFactorEnabled ?? false}
          staff={grant !== undefined}
        />
      </section>
    </SiteShell>
  );
}
