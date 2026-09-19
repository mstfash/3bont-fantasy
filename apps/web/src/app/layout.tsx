import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import '@fontsource-variable/oswald';
import '@fontsource-variable/inter';
import '@fontsource-variable/cairo';
import '@/styles/theme.css';
import '@/styles/help.css';
import '@/styles/brand-preview.css';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  icons: { icon: '/brand/3bont-fantasy-en-light.png' },
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: '٣ بونط فانتازي — اختار تشكيلتك ونافس أصحابك.',
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale =
    (await headers()).get('x-fantasy-locale') === 'en' ? 'en' : 'ar';
  const theme =
    (await cookies()).get('fantasy-theme')?.value === 'light'
      ? 'light'
      : 'dark';
  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-theme={theme}
    >
      <body>{children}</body>
    </html>
  );
}
