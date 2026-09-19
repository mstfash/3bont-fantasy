import Link from 'next/link';
import { capabilityScopes, readProviderAcceptance } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { ProviderAcceptanceControls } from '@/components/providers/provider-acceptance-controls';
import { InfoTip } from '@/components/help/info-tip';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function ProviderAcceptancePage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar';
  const staff = await requireStaff(locale, 'facts.manage', null);
  const info = await readProviderAcceptance(getRuntime().db, staff.principal);
  const canEdit = capabilityScopes(
    staff.grants,
    'provider.acceptance.manage',
  ).includes(null);
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">API-FOOTBALL</span>
        <h1>{ar ? 'قبول بالدليل.' : 'ACCEPT WITH EVIDENCE.'}</h1>
        <p>
          {ar
            ? 'جمع المصادر لا يعني اعتمادها. القبول التلقائي يحتاج سياسة موسم يوافق عليها المالك، وقوائم مكتملة ومصادر حديثة خالية من الالتباس.'
            : 'Collection does not establish acceptance. Automatic acceptance needs an owner-approved season policy, complete participation and recent unambiguous sources.'}
        </p>
        <p>
          <Link href={`/${locale}/admin/providers`}>
            {ar ? 'مزود البيانات' : 'Data provider'}
          </Link>{' '}
          ·{' '}
          <Link href={`/${locale}/admin/providers/schedules`}>
            {ar ? 'جدول الجمع' : 'Collection schedule'}
          </Link>{' '}
          ·{' '}
          <Link href={`/${locale}/admin/operations`}>
            {ar ? 'حالة العامل' : 'Worker health'}
          </Link>
        </p>
        <InfoTip
          locale={locale}
          label={ar ? 'الحقائق والنتائج' : 'Facts and results'}
          text={
            ar
              ? 'التقرير المقبول يحدّث الحقائق؛ لا يزيل تصحيحاً إدارياً ولا يعيد فتح نتائج نهائية. ينشئ العامل حالات مراجعة للتصحيحات المتأخرة وتبقى الجوائز خاضعة لقواعدها.'
              : 'Accepted reports update facts; they do not remove admin overrides or reopen finalized results. The result worker creates review cases for late corrections, and prizes retain their approval rules.'
          }
        />
      </div>
      {!info.bindings.length && (
        <p>
          {ar
            ? 'اربط موسماً موثقاً أولاً من خريطة الهويات.'
            : 'Bind an evidenced season in provider identities first.'}
        </p>
      )}
      {info.bindings.map(({ binding, season }) => {
        const policy =
          info.policies.find((p) => p.bindingId === binding.id) ?? null;
        return (
          <section
            className="group-card"
            key={binding.id}
            aria-labelledby={`acceptance-${binding.id}`}
          >
            <h2 id={`acceptance-${binding.id}`}>{season.name[locale]}</h2>
            <p>
              {policy?.enabled
                ? ar
                  ? 'سياسة القبول مفعلة'
                  : 'Acceptance policy enabled'
                : ar
                  ? 'القبول التلقائي متوقف'
                  : 'Automatic acceptance paused'}{' '}
              · {ar ? 'الإصدار' : 'Revision'} {policy?.revision ?? 0}
            </p>
            <p>
              {ar
                ? 'النطاق: كل بطولات الفانتازي التي تستخدم هذا الموسم. المباريات المباشرة والموقوفة أو المنتهية بوقت إضافي تتطلب المراجعة في هذا الإصدار.'
                : 'Scope: every fantasy competition using this season. Live, suspended and extra-time matches require review in this version.'}
            </p>
            {canEdit && info.accounts.length > 0 ? (
              <ProviderAcceptanceControls
                locale={locale}
                bindingId={binding.id}
                policy={policy}
                accounts={info.accounts}
              />
            ) : (
              <p>
                {ar
                  ? 'يغيّر المالك السياسة بعد التحقق من البيانات وحساب المزود.'
                  : 'An owner changes the policy after verifying the data and provider account.'}
              </p>
            )}
          </section>
        );
      })}
      <section className="admin-panel">
        <h2>{ar ? 'آخر قرارات القبول' : 'Recent acceptance decisions'}</h2>
        <p>
          {ar
            ? 'تُحفظ الدفعات المحجوبة للمراجعة من صفحة المباراة. يمكن لإصدار سياسة جديد إعادة فحصها إذا بقيت المصادر حديثة.'
            : 'Held bundles remain available for review on the match page. A new policy revision may recheck them while their sources are still fresh.'}
        </p>
        {!info.history.length ? (
          <p>
            {ar
              ? 'لا قرارات قبول آلي حتى الآن.'
              : 'No automatic acceptance decisions yet.'}
          </p>
        ) : (
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'المباراة' : 'Match'}</th>
                  <th>{ar ? 'القرار' : 'Decision'}</th>
                  <th>{ar ? 'آخر مصدر' : 'Latest source'}</th>
                  <th>{ar ? 'التفاصيل' : 'Details'}</th>
                </tr>
              </thead>
              <tbody>
                {info.history.map((r) => (
                  <tr key={`${r.batchId}:${String(r.policy.revision)}`}>
                    <td>
                      <Link href={`/${locale}/admin/matches/${r.fixtureId}`}>
                        {ar ? 'مراجعة المباراة' : 'Review match'} ↗
                      </Link>
                    </td>
                    <td>
                      {r.state === 'accepted'
                        ? ar
                          ? 'مقبول'
                          : 'Accepted'
                        : ar
                          ? 'محجوب للمراجعة'
                          : 'Held for review'}
                    </td>
                    <td>
                      {r.sourceAt ? deadlineLabel(r.sourceAt, locale) : '—'}
                    </td>
                    <td>
                      <details>
                        <summary>
                          {ar ? 'الأدلة والمشكلات' : 'Evidence and issues'}
                        </summary>
                        <p>
                          {ar ? 'إصدار السياسة' : 'Policy revision'}{' '}
                          {r.policy.revision} ·{' '}
                          {deadlineLabel(r.decidedAt, locale)}
                        </p>
                        {r.issues.map((i) => (
                          <p key={i}>
                            <code>{i}</code>
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
