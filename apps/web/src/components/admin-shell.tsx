import { PageHelp } from './help/page-help';
import Link from 'next/link';
import { capabilityScopes, type StaffGrant } from '@fantasy/application';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import type { Locale } from '@/lib/brand';
import { BrandLogo } from './brand-logo';
import { SiteControls } from './site-controls';
import '@/styles/site.css';
import '@/styles/admin.css';

export async function AdminShell({
  locale,
  grants,
  children,
}: {
  readonly locale: Locale;
  readonly grants: readonly StaffGrant[];
  readonly children: ReactNode;
}) {
  const ar = locale === 'ar';
  const mode =
    (await cookies()).get('fantasy-theme')?.value === 'light'
      ? 'light'
      : 'dark';
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href={`/${locale}/admin`} className="site-brand">
          <BrandLogo locale={locale} mode="dark" className="logo-dark" />
          <BrandLogo locale={locale} mode="light" className="logo-light" />
        </Link>
        <p className="eyebrow">
          {ar ? 'إدارة المنافسة' : 'COMPETITION CONTROL'}
        </p>
        <nav aria-label={ar ? 'الإدارة' : 'Administration'}>
          <Link href={`/${locale}/admin`}>{ar ? 'نظرة عامة' : 'Overview'}</Link>
          {capabilityScopes(grants, 'competition.manage').length > 0 && (
            <Link href={`/${locale}/admin/competitions`}>
              {ar ? 'البطولات' : 'Competitions'}
            </Link>
          )}
          {capabilityScopes(grants, 'staff.manage').includes(null) && (
            <>
              <Link href={`/${locale}/admin/staff`}>
                {ar ? 'فريق التشغيل' : 'Staff & access'}
              </Link>
              <Link href={`/${locale}/admin/audit`}>
                {ar ? 'سجل العمليات' : 'Audit trail'}
              </Link>
            </>
          )}
          {capabilityScopes(grants, 'facts.manage').includes(null) && (
            <>
              <Link href={`/${locale}/admin/providers`}>
                {ar ? 'مزود البيانات' : 'Data provider'}
              </Link>
              <Link href={`/${locale}/admin/catalogue`}>
                {ar ? 'دليل كرة القدم' : 'Football catalogue'}
              </Link>
              <Link href={`/${locale}/admin/matches`}>
                {ar ? 'بيانات المباريات' : 'Match data'}
              </Link>
            </>
          )}
          {(capabilityScopes(grants, 'prizes.prepare').length > 0 ||
            capabilityScopes(grants, 'prizes.approve').length > 0) && (
            <Link href={`/${locale}/admin/prizes`}>
              {ar ? 'الجوائز' : 'Prize operations'}
            </Link>
          )}
          {capabilityScopes(grants, 'moderation.manage').length > 0 && (
            <Link href={`/${locale}/admin/moderation`}>
              {ar ? 'مراجعة المجتمعات' : 'Community moderation'}
            </Link>
          )}
          {capabilityScopes(grants, 'operations.read').includes(null) && (
            <Link href={`/${locale}/admin/operations`}>
              {ar ? 'حالة التشغيل' : 'Worker health'}
            </Link>
          )}
          {capabilityScopes(grants, 'operations.read').length > 0 && (
            <Link href={`/${locale}/admin/support`}>
              {ar ? 'متابعة التشغيل' : 'Support desk'}
            </Link>
          )}
          {capabilityScopes(grants, 'moderation.manage').includes(null) && (
            <Link href={`/${locale}/admin/accounts`}>
              {ar ? 'مراجعة الحسابات' : 'Account review'}
            </Link>
          )}
          {capabilityScopes(grants, 'sponsors.manage').length > 0 && (
            <Link href={`/${locale}/admin/sponsors`}>
              {ar ? 'إدارة الرعاية' : 'Sponsor operations'}
            </Link>
          )}
          <Link href={`/${locale}/admin/how-to`}>
            {ar ? 'دليل الإدارة' : 'Admin handbook'}
          </Link>
          <Link href={`/${locale}/security`}>
            {ar ? 'أمان الجلسة' : 'Session security'}
          </Link>
        </nav>
        <Link className="admin-back" href={`/${locale}/dashboard`}>
          {ar ? 'العودة للملعب ↗' : 'BACK TO THE GAME ↗'}
        </Link>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>{ar ? '٣ بونط / لوحة الإدارة' : '3BONT / ADMINISTRATION'}</span>
          <SiteControls locale={locale} initialTheme={mode} signedIn />
        </header>
        <PageHelp locale={locale} />
        <main>{children}</main>
      </div>
    </div>
  );
}
