import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import '@/styles/auth.css';

export default async function AccountLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'ar' && locale !== 'en') notFound();
  const ar = locale === 'ar';
  return (
    <main className="account-layout" dir={ar ? 'rtl' : 'ltr'} lang={locale}>
      <aside className="account-story" data-theme="dark">
        <Link href={`/${locale}`} className="account-brand">
          <BrandLogo locale={locale} mode="dark" />
        </Link>
        <div className="account-story-copy">
          <span className="eyebrow">EGYPTIAN FANTASY FOOTBALL</span>
          <h1>
            {ar ? (
              <>
                الملعب ليهم.
                <br />
                <em>القرار ليك.</em>
              </>
            ) : (
              <>
                THEY PLAY.
                <br />
                <em>YOU DECIDE.</em>
              </>
            )}
          </h1>
          <p>
            {ar
              ? 'اختار تشكيلتك. ثق في رؤيتك الكروية. ونافس أصحابك لحد آخر صافرة.'
              : 'Pick your squad. Back your football instincts. Compete with your friends until the final whistle.'}
          </p>
        </div>
        <span className="account-edition">3BONT FANTASY / 2026—27</span>
      </aside>
      <section className="account-panel">
        <nav>
          <Link href={`/${locale}`}>
            {ar ? 'العودة للرئيسية' : 'Back to home'}
          </Link>
          <Link href={`/${ar ? 'en' : 'ar'}/login`} lang={ar ? 'en' : 'ar'}>
            {ar ? 'ENGLISH' : 'العربية'}
          </Link>
        </nav>
        <div className="account-fields">{children}</div>
        <nav className="guide-links">
          <Link href={`/${locale}/how-to-play`}>
            {ar ? 'إزاي تلعب' : 'How to play'}
          </Link>
          <Link href={`/${locale}/playbook`}>
            {ar ? 'دليل اللعب' : 'Playbook'}
          </Link>
        </nav>
        <footer>
          {ar
            ? 'اختياراتك تصنع الفارق.'
            : 'Your decisions make the difference.'}
        </footer>
      </section>
    </main>
  );
}
