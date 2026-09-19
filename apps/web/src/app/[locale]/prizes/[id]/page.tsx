import { SponsorSlot } from '@/components/sponsors/sponsor-slot';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied, readPublicPrizePool } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import {
  PrizeSummary,
  prizeRewardLabel,
} from '@/components/prizes/prize-summary';
import { requireLocale } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import { currentSession } from '@/server/session';
import '@/styles/groups.css';
export default async function PrizeTerms({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar',
    session = await currentSession();
  if (!idSchema.safeParse(p.id).success) notFound();
  const data = await readPublicPrizePool(
    getRuntime().db,
    p.id,
    session?.user.id ?? null,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    throw error;
  });
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section prize-page">
        <div>
          <Link href={`/${locale}/competitions/${data.competition.slug}`}>
            {data.competition.name[locale]}
          </Link>
          <h1 className="page-title">
            {ar ? 'كل جائزة. بشروط واضحة.' : 'EVERY AWARD. CLEAR TERMS.'}
          </h1>
        </div>
        <SponsorSlot
          locale={locale}
          slot="prize"
          competitionId={data.competition.id}
        />
        <PrizeSummary pool={data.pool} locale={locale} />
        <section className="group-card">
          <h2>{ar ? 'الجولات المحتسبة' : 'Scoring rounds'}</h2>
          <p>{data.rounds.map((r) => r.name[locale]).join(' · ')}</p>
          <p>
            {ar
              ? 'تُراجع النتائج النهائية والأهلية قبل الاعتماد والتسليم. التصحيحات قد توقف الجوائز للمراجعة.'
              : 'Final results and eligibility are reviewed before approval and fulfillment. Corrections may place awards on hold.'}
          </p>
          <p>
            {ar
              ? 'لا توجد رسوم اشتراك أو محفظة أو تحويلات مالية داخل التطبيق.'
              : 'There are no entry fees, wallets or in-app money transfers.'}
          </p>
        </section>
        {data.awardState && (
          <section className="group-card">
            <h2>{ar ? 'الجوائز المعتمدة' : 'Approved awards'}</h2>
            {data.held && (
              <p role="status">
                {ar
                  ? 'النتائج أو الأهلية قيد المراجعة. سجل الجوائز السابق محفوظ ولا يعني استمرار أهلية التسليم.'
                  : 'Results or eligibility are under review. The earlier award record is retained and does not confirm current fulfillment eligibility.'}
              </p>
            )}
            <p>
              {data.awardState === 'fulfilled'
                ? ar
                  ? 'تم تسجيل التسليم الخارجي.'
                  : 'External fulfillment has been recorded.'
                : ar
                  ? 'معتمدة؛ التسليم لم يُسجّل بعد.'
                  : 'Approved; fulfillment has not yet been recorded.'}
            </p>
            {data.correctionState === 'resolved' && !data.held && (
              <p>
                {ar
                  ? 'تمت مراجعة تصحيح بعد التسليم. يبقى سجل التسليم الأصلي معروضاً هنا.'
                  : 'A post-delivery correction has been reviewed. The original delivery record remains displayed here.'}
              </p>
            )}
            <ol>
              {data.awards.map((a) => (
                <li key={a.entryId}>
                  {a.rank} · {a.entryName} —{' '}
                  <bdi>
                    {prizeRewardLabel(a.reward, data.pool.currency, locale)}
                  </bdi>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
    </SiteShell>
  );
}
