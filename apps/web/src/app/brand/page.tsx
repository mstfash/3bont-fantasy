import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand-logo';

export const metadata: Metadata = {
  title: 'Brand / الهوية',
  robots: { index: false, follow: false },
};

export default function BrandPage() {
  return (
    <main className="brand-review" dir="ltr" lang="en">
      <header className="brand-review-heading">
        <span className="brand-kicker">3BONT / FANTASY FOOTBALL</span>
        <h1>
          ONE IDENTITY.
          <br />
          <span>TWO LANGUAGES.</span>
        </h1>
        <p>The supplied 3BONT identity, adapted for fantasy football.</p>
      </header>
      <div className="brand-grid">
        {(['dark', 'light'] as const).flatMap((mode) =>
          (['en', 'ar'] as const).map((locale) => (
            <section
              className="brand-tile"
              data-theme={mode}
              key={`${locale}-${mode}`}
            >
              <header>
                <span>{locale === 'ar' ? 'ARABIC / العربية' : 'ENGLISH'}</span>
                <span>{mode.toUpperCase()}</span>
              </header>
              <div className="brand-artwork">
                <BrandLogo locale={locale} mode={mode} />
              </div>
              <a href={`/brand/3bont-fantasy-${locale}-${mode}.png`} download>
                Download PNG <span aria-hidden="true">↗</span>
              </a>
            </section>
          )),
        )}
      </div>
      <footer className="brand-review-footer">
        <span>ORIGINAL 3BONT MARK / MATCHING FANTASY LETTERING</span>
        <span>2026</span>
      </footer>
    </main>
  );
}
