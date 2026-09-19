import { PageHelp } from './help/page-help';
import { SponsorSlot } from './sponsors/sponsor-slot';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/brand';
import { BrandLogo } from './brand-logo';
import { SiteControls } from './site-controls';
import '@/styles/site.css';

export async function SiteShell({
  locale,
  children,
  signedIn = false,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
  readonly signedIn?: boolean;
}) {
  const ar = locale === 'ar';
  const theme =
    (await cookies()).get('fantasy-theme')?.value === 'light'
      ? 'light'
      : 'dark';
  return (
    <>
      <a href="#main-content" className="skip-link">
        {ar ? 'انتقل للمحتوى' : 'Skip to content'}
      </a>
      <div className="edition-bar">
        <span>
          {ar ? 'كرة مصرية. قراراتك أنت.' : 'EGYPTIAN FOOTBALL. YOUR CALL.'}
        </span>
        <span>3BONT / FANTASY</span>
      </div>
      <header className="site-header">
        <Link
          className="site-brand"
          href={`/${locale}`}
          aria-label={ar ? 'الرئيسية' : 'Home'}
        >
          <BrandLogo locale={locale} mode="dark" className="logo-dark" />
          <BrandLogo locale={locale} mode="light" className="logo-light" />
        </Link>
        <nav
          className="site-navigation"
          aria-label={ar ? 'القائمة الرئيسية' : 'Main navigation'}
        >
          <Link href={`/${locale}/dashboard`}>{ar ? 'فرقي' : 'My squads'}</Link>
          <Link href={`/${locale}#competitions`}>
            {ar ? 'البطولات' : 'Competitions'}
          </Link>
          <Link href={`/${locale}#scoreboard`}>
            {ar ? 'النتائج' : 'Scoreboard'}
          </Link>
          <Link href={`/${locale}/how-to-play`}>
            {ar ? 'إزاي تلعب' : 'How to play'}
          </Link>
          {signedIn && (
            <Link href={`/${locale}/profile`}>{ar ? 'ملفي' : 'Profile'}</Link>
          )}
          {signedIn && (
            <Link href={`/${locale}/security`}>
              {ar ? 'الأمان' : 'Security'}
            </Link>
          )}
        </nav>
        <SiteControls
          locale={locale}
          initialTheme={theme}
          signedIn={signedIn}
        />
      </header>
      <PageHelp locale={locale} />
      <SponsorSlot locale={locale} slot="header" competitionId={null} />
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <strong>3BONT FANTASY.</strong>
        <span>
          {ar ? 'اللعبة تبدأ باختيارك.' : 'THE GAME STARTS WITH YOUR CHOICE.'}
        </span>
        <span>© {new Date().getFullYear()} 3BONT</span>
      </footer>
    </>
  );
}
