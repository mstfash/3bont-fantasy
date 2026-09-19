'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ColorMode, Locale } from '@/lib/brand';

export function SiteControls({
  locale,
  initialTheme,
  signedIn,
}: {
  readonly locale: Locale;
  readonly initialTheme: ColorMode;
  readonly signedIn: boolean;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = usePathname();
  const query = useSearchParams().toString();
  const ar = locale === 'ar';
  return (
    <div className="site-controls">
      <Link
        href={`${path.replace(/^\/(ar|en)(?=\/|$)/u, ar ? '/en' : '/ar')}${query ? `?${query}` : ''}`}
        lang={ar ? 'en' : 'ar'}
        onClick={() => {
          document.cookie = `fantasy-locale=${ar ? 'en' : 'ar'}; Path=/; Max-Age=31536000; SameSite=Lax`;
        }}
      >
        {ar ? 'EN' : 'عربي'}
      </Link>
      <button
        type="button"
        aria-label={ar ? 'تغيير المظهر' : 'Change theme'}
        onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark';
          document.documentElement.dataset['theme'] = next;
          document.cookie = `fantasy-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
          setTheme(next);
        }}
      >
        {theme === 'dark' ? '◐' : '◑'}
      </button>
      {signedIn ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setFailed(false);
            void fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            })
              .then((response) => {
                if (response.ok) window.location.assign(`/${locale}`);
                else setFailed(true);
              })
              .catch(() => {
                setFailed(true);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {ar ? 'خروج' : 'Sign out'}
        </button>
      ) : (
        <Link className="nav-signin" href={`/${locale}/login`}>
          {ar ? 'دخول' : 'Sign in'}
        </Link>
      )}
      {failed && (
        <span role="alert">
          {ar ? 'تعذر الخروج. حاول مرة أخرى.' : 'Sign-out failed. Try again.'}
        </span>
      )}
    </div>
  );
}
