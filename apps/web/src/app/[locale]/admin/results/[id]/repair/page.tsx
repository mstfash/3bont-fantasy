import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CommandRejected,
  previewSnapshotRepair,
  readSnapshotRepairWorkspace,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { ResultImpactSummary } from '@/components/result-impact-summary';
import { ResultScoreChanges } from '@/components/result-score-changes';
import { SnapshotRepairDiff } from '@/components/snapshot-repair-diff';
import { SnapshotRepairConfirm } from '@/components/snapshot-repair-confirm';
import { InfoTip } from '@/components/help/info-tip';
import { requireLocale } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function SnapshotRepairPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<{ q?: string; entryId?: string }>;
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
  const round = row.data;
  const context = await requireStaff(
    locale,
    'results.replay',
    round.competitionId,
    true,
  );
  if (round.resultRevision < 1) notFound();
  const query = await searchParams;
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
  const { entries, history } = await readSnapshotRepairWorkspace(
    db,
    context.principal,
    round.id,
    q,
  );
  let preview: Awaited<ReturnType<typeof previewSnapshotRepair>> | null = null,
    notice = '';
  if (query.entryId) {
    if (!idSchema.safeParse(query.entryId).success) notFound();
    try {
      preview = await previewSnapshotRepair(db, context.principal, {
        entryId: query.entryId,
        gameweekId: round.id,
        expectedResultRevision: round.resultRevision,
      });
    } catch (error) {
      if (error instanceof CommandRejected)
        notice = commandError(error.code, locale);
      else throw error;
    }
  }
  const ids = [
    ...new Set(
      [
        ...(preview?.before?.roster.holdings ?? []),
        ...(preview?.after.roster.holdings ?? []),
      ].map((h) => h.footballerId),
    ),
  ];
  const footballers = ids.length
    ? await db
        .selectFrom('footballers')
        .select('data')
        .where('id', 'in', ids)
        .execute()
    : [];
  const names = Object.fromEntries(
    footballers.map((r) => [r.data.id, r.data.name[locale]]),
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link className="eyebrow" href={`/${locale}/admin/results/${round.id}`}>
          {round.name[locale]} ↗
        </Link>
        <h1>
          {ar ? 'استعادة الاختيارات المقبولة.' : 'RESTORE ACCEPTED CHOICES.'}
        </h1>
        <InfoTip
          locale={locale}
          label={ar ? 'إصلاح سجل التشكيلة' : 'Snapshot repair'}
          text={
            ar
              ? 'للمالك فقط. تُستعاد آخر اختيارات قبل الموعد النهائي من دليل قبول مسجل. لا يمكن اختيار تشكيلة جديدة أو أمر أقدم. المعاينة لا تحفظ شيئاً.'
              : 'Owner only. Restores the latest pre-deadline choices from a recorded acceptance. No new lineup or older command can be selected. Preview saves nothing.'
          }
        />
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'اختيار الفريق' : 'Select a squad'}</h2>
        <form className="admin-form" method="get">
          <label>
            {ar ? 'ابحث باسم الفريق' : 'Search squad name'}
            <input name="q" defaultValue={q} maxLength={80} />
          </label>
          <button className="button-outline" type="submit">
            {ar ? 'بحث' : 'Search'}
          </button>
        </form>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
                <th>{ar ? 'دليل القبول' : 'Acceptance evidence'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 50).map(({ data: entry }) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>
                    <Link
                      href={`/${locale}/admin/results/${round.id}/repair?entryId=${entry.id}`}
                    >
                      {ar ? 'معاينة إصلاح السجل' : 'Preview snapshot repair'} ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length > 50 && (
          <p>
            {ar
              ? 'تظهر أول ٥٠ نتيجة. حدّد الاسم لتضييق البحث.'
              : 'Showing the first 50 results. Refine the name to narrow the search.'}
          </p>
        )}
      </section>
      {notice && <p role="alert">{notice}</p>}
      {preview && (
        <>
          <section className="admin-panel">
            <h2>{preview.entryName}</h2>
            <p>
              {ar ? 'قُبلت الاختيارات في' : 'Choices accepted at'}{' '}
              <time dateTime={preview.source.acceptedAt}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'long',
                  timeZone: 'Africa/Cairo',
                }).format(new Date(preview.source.acceptedAt))}
              </time>
            </p>
            <p>
              {ar ? 'مرجع الأمر المقبول' : 'Accepted command reference'}:{' '}
              <code>{preview.source.commandId}</code>
            </p>
          </section>
          <SnapshotRepairDiff
            locale={locale}
            before={preview.before}
            after={preview.after}
            names={names}
          />
          <ResultScoreChanges
            locale={locale}
            changes={preview.impact.changes}
          />
          <ResultImpactSummary locale={locale} preview={preview.impact} />
          {preview.canApply ? (
            <SnapshotRepairConfirm
              locale={locale}
              selection={preview.selection}
              fingerprint={preview.fingerprint}
            />
          ) : (
            <p role="alert">{commandError('replay-incomplete', locale)}</p>
          )}
        </>
      )}
      {history.length > 0 && (
        <section className="admin-panel">
          <h2>{ar ? 'سجل الإصلاحات المنشورة' : 'Published repair history'}</h2>
          {history.map((r) => (
            <details key={`${r.entryId}:${String(r.revision)}`}>
              <summary>
                {ar ? 'مراجعة النتائج' : 'Result revision'} {r.resultRevision} ·{' '}
                {r.recordedAt}
              </summary>
              <p>{r.reason}</p>
              <p>
                {ar ? 'مرجع الأمر المقبول' : 'Accepted command reference'}:{' '}
                <code>{r.source.commandId}</code>
              </p>
            </details>
          ))}
        </section>
      )}
    </AdminShell>
  );
}
