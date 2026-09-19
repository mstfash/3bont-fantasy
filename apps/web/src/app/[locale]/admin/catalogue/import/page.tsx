import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { CatalogueImporter } from '@/components/catalogue/catalogue-importer';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import '@/styles/groups.css';
import '@/styles/catalogue-import.css';
export default async function CatalogueImportPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    staff = await requireStaff(locale, 'facts.manage', null);
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'المصدر. المراجعة. النشر.' : 'SOURCE. REVIEW. IMPORT.'}
        </span>
        <h1>{ar ? 'استيراد دليل الموسم' : 'IMPORT THE SEASON CATALOGUE'}</h1>
        <p>
          {ar
            ? 'المواسم والأندية واللاعبون في دفعة موثّقة، مع مراجعة التغييرات قبل تطبيقها.'
            : 'Seasons, clubs and footballers in one documented batch, with changes reviewed before they are applied.'}
        </p>
        <Link href={`/${locale}/admin/catalogue`}>
          {ar ? 'العودة إلى الدليل' : 'Back to catalogue'}
        </Link>
      </div>
      <CatalogueImporter locale={locale} />
    </AdminShell>
  );
}
