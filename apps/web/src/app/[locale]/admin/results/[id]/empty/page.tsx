import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommandRejected, previewEmptyGameweek } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { ResultImpactSummary } from '@/components/result-impact-summary';
import { ResultScoreChanges } from '@/components/result-score-changes';
import { EmptyGameweekConfirm } from '@/components/empty-gameweek-confirm';
import { InfoTip } from '@/components/help/info-tip';
import { requireLocale } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function EmptyGameweekPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar',
    db = getRuntime().db;
  if (!idSchema.safeParse(p.id).success) notFound();
  const row = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!row) notFound();
  const context = await requireStaff(
    locale,
    'competition.manage',
    row.data.competitionId,
    true,
  );
  let preview: Awaited<ReturnType<typeof previewEmptyGameweek>> | null = null,
    notice = '';
  try {
    preview = await previewEmptyGameweek(db, context.principal, p.id);
  } catch (error) {
    if (error instanceof CommandRejected)
      notice = commandError(error.code, locale);
    else throw error;
  }
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link className="eyebrow" href={`/${locale}/admin/results/${p.id}`}>
          {row.data.name[locale]} ↗
        </Link>
        <h1>
          {ar ? 'جولة بلا أداء. قرار موثّق.' : 'NO PLAY. A RECORDED DECISION.'}
        </h1>
        <InfoTip
          locale={locale}
          label={ar ? 'تسوية بلا أداء' : 'Zero-performance settlement'}
          text={
            ar
              ? 'المعاينة لا تحفظ شيئاً. لا تُسوّى الجولة تلقائياً لمجرد غياب المباريات. يلزم مرور الموعد النهائي وتوثيق أي إلغاء أو نتيجة إدارية.'
              : 'Preview saves nothing. An absent fixture list does not automatically settle a round. Its deadline must pass and every void or awarded outcome must have recorded evidence.'
          }
        />
      </div>
      {notice && <p role="alert">{notice}</p>}
      {preview && (
        <>
          <ResultScoreChanges locale={locale} changes={preview.changes} />
          <ResultImpactSummary locale={locale} preview={preview} />
          {preview.settled && preview.rankings !== null && (
            <EmptyGameweekConfirm
              locale={locale}
              gameweekId={p.id}
              revision={preview.round.resultRevision}
              fingerprint={preview.fingerprint}
            />
          )}
        </>
      )}
    </AdminShell>
  );
}
