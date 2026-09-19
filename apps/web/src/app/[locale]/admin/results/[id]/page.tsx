import Link from 'next/link';
import { capabilityScopes } from '@fantasy/application';
import { ResultScoreChanges } from '@/components/result-score-changes';
import { notFound } from 'next/navigation';
import { idSchema } from '@fantasy/contracts';
import { previewGameweekResults } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { ResultImpactSummary } from '@/components/result-impact-summary';
import { ReopenResults } from '@/components/reopen-results';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function ResultReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(p.id).success) notFound();
  const db = getRuntime().db;
  const reference = await db
    .selectFrom('gameweeks')
    .select('competition_id')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!reference) notFound();
  const context = await requireStaff(
    locale,
    'competition.manage',
    reference.competition_id,
  );
  const preview = await previewGameweekResults(
    db,
    context.principal,
    context.grants,
    p.id,
  );
  const changed = preview.changes.filter((c) => c.before !== c.after);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {preview.round.name[locale]} / {preview.round.status}
        </span>
        <h1>{ar ? 'راجع أثر كل نقطة.' : 'REVIEW EVERY POINT.'}</h1>
        <p>
          {ar
            ? `${String(changed.length)} فريق تتغير نقاطه. هذه معاينة وليست نشراً.`
            : `${String(changed.length)} squads have changed totals. This is a preview, not a publication.`}
        </p>
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'جودة البيانات' : 'Data readiness'}</h2>
        <p>
          {preview.settled
            ? ar
              ? 'كل المباريات وبيانات النقاط مكتملة.'
              : 'All fixtures and scoring inputs are settled.'
            : ar
              ? 'الجولة لم تكتمل أو توجد بيانات ناقصة.'
              : 'The round is still in progress or scoring data is incomplete.'}
        </p>
        {preview.issues.length > 0 && (
          <details>
            <summary>
              {ar ? 'عرض البيانات الناقصة' : 'Show missing-data details'} (
              {preview.issues.length})
            </summary>
            <ul>
              {preview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {preview.round.resultRevision > 0 &&
        capabilityScopes(context.grants, 'results.replay').some(
          (scope) => scope === null || scope === preview.round.competitionId,
        ) && (
          <section className="admin-panel">
            <Link href={`/${locale}/admin/results/${p.id}/rules`}>
              {ar
                ? 'تصحيح قواعد جولة سابقة'
                : 'Correct historical gameweek rules'}{' '}
              ↗
            </Link>
          </section>
        )}
      <ResultScoreChanges locale={locale} changes={preview.changes} />
      <ResultImpactSummary locale={locale} preview={preview} />
      {['finalized', 'review'].includes(preview.round.status) && (
        <ReopenResults
          locale={locale}
          gameweekId={p.id}
          revision={preview.round.resultRevision}
          fingerprint={preview.fingerprint}
        />
      )}
    </AdminShell>
  );
}
