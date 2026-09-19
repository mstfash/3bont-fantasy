import { readAccountModeration } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { AccountModerationForm } from '@/components/account-moderation-form';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function Accounts({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ q?: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaff(locale, 'moderation.manage', null),
    q = (await searchParams).q ?? '';
  const accounts = await readAccountModeration(
    getRuntime().db,
    context.principal,
    context.grants,
    q,
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'مراجعة الحسابات' : 'ACCOUNT REVIEW'}
        </span>
        <h1>{ar ? 'الوصول مسؤولية.' : 'ACCESS. WITH ACCOUNTABILITY.'}</h1>
        <p>
          {ar
            ? 'للمراجعين على مستوى المنصة. حسابات التشغيل محمية؛ صلاحياتها تُدار من صفحة الفريق.'
            : 'For platform moderators. Staff accounts are protected; manage their privileges through Staff & access.'}
        </p>
      </div>
      <form className="group-form" method="get">
        <label>
          {ar ? 'اسم العرض أو معرّف الحساب' : 'Display name or account ID'}
          <input name="q" defaultValue={q} maxLength={100} />
        </label>
        <button className="button-outline">{ar ? 'بحث' : 'Search'}</button>
      </form>
      <div className="group-grid">
        {accounts.map((a) => (
          <article className="group-card" key={a.id}>
            <h2>
              <bdi>{a.displayName}</bdi>
            </h2>
            <p className="chat-evidence">
              <bdi>{a.id}</bdi>
            </p>
            <p>
              {a.closedAt
                ? ar
                  ? 'الحساب مغلق نهائيًا'
                  : 'Account permanently closed'
                : a.suspendedUntil && Date.parse(a.suspendedUntil) > Date.now()
                  ? (ar ? 'موقوف حتى ' : 'Suspended until ') +
                    new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Africa/Cairo',
                    }).format(new Date(a.suspendedUntil))
                  : ar
                    ? 'الوصول متاح'
                    : 'Access available'}
            </p>
            {a.closedAt ? (
              <p>
                {ar
                  ? 'الإغلاق لا يُلغى بإزالة الإيقاف.'
                  : 'Suspension controls cannot reopen a closed account.'}
              </p>
            ) : a.staff || a.id === context.principal.accountId ? (
              <p>{ar ? 'حساب تشغيل محمي' : 'Protected staff account'}</p>
            ) : (
              <AccountModerationForm
                locale={locale}
                accountId={a.id}
                suspendedUntil={a.suspendedUntil}
              />
            )}
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
