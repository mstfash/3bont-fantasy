import { notFound } from 'next/navigation';
import {
  AccessDenied,
  CommandRejected,
  previewPrizeResultCorrection,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { PrizeResultImpact } from '@/components/prizes/result-impact';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function PrizeCorrectionPreview({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string; gameweek: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const context = await requireStaffSession(locale);
  if (
    !idSchema.safeParse(p.id).success ||
    !idSchema.safeParse(p.gameweek).success
  )
    notFound();
  const preview = await previewPrizeResultCorrection(
    getRuntime().db,
    context.principal,
    context.grants,
    p.id,
    p.gameweek,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied || error instanceof CommandRejected)
      notFound();
    throw error;
  });
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <h1>
          {locale === 'ar'
            ? 'راجع أثر التصحيح على الجائزة.'
            : 'REVIEW THE AWARD IMPACT.'}
        </h1>
        <p>{preview.round.name[locale]}</p>
      </div>
      <PrizeResultImpact locale={locale} impact={preview.impact} />
    </AdminShell>
  );
}
