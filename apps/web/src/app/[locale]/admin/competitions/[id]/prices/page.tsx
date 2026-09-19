import Link from 'next/link';
import { notFound } from 'next/navigation';
import { competitionSchema, idSchema } from '@fantasy/contracts';
import { previewCompetitionPrices } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { PriceBatchReview } from '@/components/price-batch-review';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function PricesPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(p.id).success) notFound();
  const context = await requireStaff(locale, 'competition.manage', p.id);
  const db = getRuntime().db;
  const row = await db
    .selectFrom('competitions')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!row) notFound();
  const competition = competitionSchema.parse(row.data);
  const [preview, players, batches] = await Promise.all([
    previewCompetitionPrices(db, context.principal, context.grants, p.id),
    db
      .selectFrom('footballers')
      .select('data')
      .where('season_id', '=', competition.seasonId)
      .execute(),
    db
      .selectFrom('price_batches')
      .select(['id', 'created_at', 'payload'])
      .where('competition_id', '=', p.id)
      .orderBy('created_at', 'desc')
      .limit(20)
      .execute(),
  ]);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link
          className="eyebrow"
          href={`/${locale}/admin/competitions/${p.id}`}
        >
          {competition.name[locale]} ↗
        </Link>
        <h1>{ar ? 'السعر. بالأداء.' : 'PRICED ON PERFORMANCE.'}</h1>
        <p>
          {ar
            ? 'نقاط اللاعب الأصلية من الجولات النهائية. لا تأثير للكابتن أو الطلب أو التقييم السوقي.'
            : 'Unmultiplied footballer points from finalized rounds. Captaincy, transfer demand and real-world valuations do not affect this calculation.'}
        </p>
        <p>
          {ar
            ? 'التشغيل التلقائي ينتظر تقرير معايرة موثق. يمكنك مراجعة هذه الدفعة واعتمادها يدوياً.'
            : 'Automatic operation awaits a documented calibration report. You can review and approve this batch manually.'}
        </p>
      </div>
      <p>
        <Link
          className="button-outline"
          href={`/${locale}/admin/competitions/${p.id}/prices/calibration`}
        >
          {ar ? 'تجربة سياسات الأسعار' : 'Compare pricing policies'}
        </Link>
      </p>
      <PriceBatchReview
        locale={locale}
        preview={preview}
        names={Object.fromEntries(
          players.map((p) => [p.data.id, p.data.name[locale]]),
        )}
      />
      <section className="admin-panel">
        <h2>{ar ? 'آخر الدفعات المنشورة' : 'Recent published batches'}</h2>
        {batches.length === 0 ? (
          <p>{ar ? 'لم تُنشر دفعات بعد.' : 'No batches published yet.'}</p>
        ) : (
          batches.map((batch) => (
            <p key={batch.id}>
              {batch.created_at.toLocaleString(ar ? 'ar-EG' : 'en-GB', {
                timeZone: 'Africa/Cairo',
              })}{' '}
              —{' '}
              {
                batch.payload.changes.filter((p) => p.newPrice !== p.oldPrice)
                  .length
              }{' '}
              {ar ? 'سعر متغير' : 'price changes'}
            </p>
          ))
        )}
      </section>
    </AdminShell>
  );
}
