import { PrizeCorrectionCases } from '@/components/prizes/correction-cases';
import {
  PrizeReviewEvidence,
  prizeStateLabels,
} from '@/components/prizes/review-evidence';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AccessDenied,
  CommandRejected,
  capabilityScopes,
  readPrizeAdministration,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { currencyMinorToDecimal } from '@fantasy/domain';
import { AdminShell } from '@/components/admin-shell';
import { PrizePoolEditor } from '@/components/prizes/pool-editor';
import {
  PrizeAction,
  PrizeEligibility,
} from '@/components/prizes/prize-actions';
import {
  PrizeSummary,
  prizeRewardLabel,
} from '@/components/prizes/prize-summary';
import { requireLocale } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { getRuntime } from '@/server/runtime';
import { requireStaffSession } from '@/server/staff';
import '@/styles/groups.css';
export default async function PrizeAdministration({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale);
  if (!idSchema.safeParse(p.id).success) notFound();
  const detail = await readPrizeAdministration(
    getRuntime().db,
    context.principal,
    context.grants,
    p.id,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied || error instanceof CommandRejected)
      notFound();
    throw error;
  });
  const { pool, preview, hold, proposals, rounds, groups } = detail;
  const active = proposals.find((p) => p.state !== 'voided') ?? null;
  const canPrepare = capabilityScopes(context.grants, 'prizes.prepare').some(
      (s) => s === null || s === pool.competitionId,
    ),
    canApprove = capabilityScopes(context.grants, 'prizes.approve').some(
      (s) => s === null || s === pool.competitionId,
    );
  const actions: (
    'publish' | 'prepare' | 'review' | 'approve' | 'fulfill' | 'void'
  )[] = [];
  if (canPrepare && pool.state === 'draft') actions.push('publish');
  if (canPrepare && preview && !hold && !active) actions.push('prepare');
  if (canPrepare && active?.state === 'prepared' && !hold)
    actions.push('review');
  if (canApprove && active?.state === 'reviewed' && !hold)
    actions.push('approve');
  if (canPrepare && active?.state === 'approved' && !hold)
    actions.push('fulfill');
  if (canPrepare && active && active.state !== 'fulfilled')
    actions.push('void');
  const displayed = active?.preview ?? preview;
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link
          href={`/${locale}/admin/prizes?competition=${pool.competitionId}`}
        >
          {ar ? 'كل الجوائز' : 'All award pools'} ↗
        </Link>
        <h1>{pool.name[locale]}</h1>
        <p>
          {ar ? 'نسخة الشروط' : 'Terms revision'} {pool.revision} ·{' '}
          {pool.state === 'draft'
            ? ar
              ? 'مسودة'
              : 'Draft'
            : ar
              ? 'منشورة'
              : 'Published'}
        </p>
      </div>
      <PrizeSummary pool={pool} locale={locale} />
      <section className="group-card">
        <h2>{ar ? 'الجولات المحتسبة' : 'Scoring interval'}</h2>
        <p>
          {rounds
            .filter((r) => pool.gameweekIds.includes(r.id))
            .map((r) => r.name[locale])
            .join(' · ')}
        </p>
        {pool.state === 'published' && (
          <Link href={`/${locale}/prizes/${pool.id}`}>
            {ar ? 'عرض الشروط للمشاركين' : 'View participant terms'} ↗
          </Link>
        )}
      </section>
      {pool.state === 'published' && (
        <section className="admin-panel">
          <h2>
            {ar ? 'معاينة أثر تصحيح النتائج' : 'Result correction projections'}
          </h2>
          <p>
            {ar
              ? 'اختر جولة لمقارنة الجوائز بالنقاط المنشورة مع التصحيح المقترح، دون تعديل أي قرار.'
              : 'Choose a round to compare published-score awards with a proposed correction, without changing any decision.'}
          </p>
          <details>
            <summary>{ar ? 'اختر الجولة' : 'Choose a gameweek'}</summary>
            <ul>
              {rounds
                .filter(
                  (r) =>
                    pool.gameweekIds.includes(r.id) && r.resultRevision > 0,
                )
                .map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/${locale}/admin/prizes/${pool.id}/corrections/${r.id}`}
                    >
                      {r.name[locale]}
                    </Link>
                  </li>
                ))}
            </ul>
          </details>
        </section>
      )}
      {pool.state === 'draft' && canPrepare && (
        <section className="group-card">
          <h2>{ar ? 'تحرير المسودة' : 'Edit draft'}</h2>
          <PrizePoolEditor
            locale={locale}
            competitionId={pool.competitionId}
            rounds={rounds}
            groups={groups}
            pool={pool}
          />
        </section>
      )}
      {hold && (
        <section className="group-card" role="status">
          <h2>{ar ? 'الجوائز معلّقة للمراجعة' : 'Awards on hold'}</h2>
          <p>{commandError(hold, locale)}</p>
          {preview?.issues.map((issue) => (
            <p key={issue}>
              {issue.startsWith('goods-tie-needs-resolution:')
                ? ar
                  ? `تعادل عند المركز ${issue.split(':')[1] ?? ''} يحتاج إلى تسوية عينية وفق الشروط المنشورة.`
                  : `The tie at rank ${issue.split(':')[1] ?? ''} needs a goods settlement under the published terms.`
                : issue === 'no-eligible-entries'
                  ? ar
                    ? 'لا توجد فرق مستوفية للأهلية حالياً.'
                    : 'No squads currently satisfy eligibility.'
                  : ar
                    ? 'توجد نتائج غير مكتملة لبعض الفرق المؤهلة.'
                    : 'Some eligible squads have incomplete results.'}
            </p>
          ))}
          {active?.state === 'fulfilled' && (
            <p>
              {ar
                ? 'سجل التسليم السابق محفوظ؛ راجع أثر التصحيح قبل اتخاذ إجراء إضافي.'
                : 'Previous fulfillment remains recorded; review the correction before taking further action.'}
            </p>
          )}
        </section>
      )}
      {displayed && (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <h2>{ar ? 'المقترح والمستفيدون' : 'Proposal and recipients'}</h2>
            <span>
              {active
                ? prizeStateLabels[active.state][locale]
                : ar
                  ? 'معاينة'
                  : 'Preview'}
            </span>
          </div>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'المركز' : 'Rank'}</th>
                  <th>{ar ? 'الفريق' : 'Squad'}</th>
                  <th>{ar ? 'الجائزة' : 'Award'}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.awards.map((a) => (
                  <tr key={a.entryId}>
                    <td>{a.rank}</td>
                    <td>{a.entryName}</td>
                    <td>{prizeRewardLabel(a.reward, pool.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-note">
            {ar ? 'باقي القسمة' : 'Tie residue'}:{' '}
            {currencyMinorToDecimal(displayed.residueMinor, pool.currency)}{' '}
            {pool.currency} · {ar ? 'مبالغ بلا مستفيد' : 'Unallocated cash'}:{' '}
            {currencyMinorToDecimal(displayed.unallocatedMinor, pool.currency)}{' '}
            {pool.currency}
          </p>
          <p className="panel-note">
            {ar ? 'نسخ النتائج' : 'Result revisions'}:{' '}
            {displayed.revisions
              .map(
                (r) =>
                  `${String(rounds.find((g) => g.id === r.gameweekId)?.number ?? '?')} / v${String(r.revision)}`,
              )
              .join(' · ')}
          </p>
        </section>
      )}
      {preview && (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <h2>
              {ar ? 'مراجعة الأهلية الحالية' : 'Current eligibility review'}
            </h2>
          </div>
          <div className="admin-table-scroll">
            <table className="prize-candidates">
              <thead>
                <tr>
                  <th>{ar ? 'الفريق' : 'Squad'}</th>
                  <th>{ar ? 'النقاط' : 'Points'}</th>
                  <th>{ar ? 'الحالة' : 'Status'}</th>
                  <th>{ar ? 'قرار' : 'Decision'}</th>
                </tr>
              </thead>
              <tbody>
                {preview.candidates.map((c) => (
                  <tr key={c.entryId}>
                    <td>{c.entryName}</td>
                    <td>{c.points / 1000}</td>
                    <td>
                      {c.eligible
                        ? ar
                          ? 'مؤهل'
                          : 'Eligible'
                        : c.reasons
                            .map((r) => commandError(`prize-${r}`, locale))
                            .join(' · ')}
                    </td>
                    <td>
                      {canPrepare && (
                        <PrizeEligibility
                          locale={locale}
                          pool={pool}
                          accountId={c.accountId}
                          excluded={c.reasons.includes('eligibility-excluded')}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <PrizeCorrectionCases
        locale={locale}
        cases={detail.corrections}
        history={detail.observationHistory}
        proposals={proposals}
        currency={pool.currency}
        canApprove={canApprove}
      />
      <PrizeReviewEvidence
        locale={locale}
        proposals={proposals}
        reviews={detail.eligibilityReviews}
      />
      <div className="group-grid">
        {actions.map((action) => (
          <section className="group-card" key={action}>
            <PrizeAction
              locale={locale}
              pool={pool}
              proposal={active}
              preview={preview}
              action={action}
            />
          </section>
        ))}
      </div>
      {active?.fulfilledAt && (
        <section className="group-card">
          <h2>{ar ? 'سجل التسليم' : 'Fulfillment record'}</h2>
          <p>{active.fulfillmentReference}</p>
          <p>{active.fulfilledAt}</p>
        </section>
      )}
    </AdminShell>
  );
}
