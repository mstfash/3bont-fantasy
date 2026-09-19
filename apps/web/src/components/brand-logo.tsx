import Image from 'next/image';
import { BRAND, type ColorMode, type Locale } from '@/lib/brand';

/** Choose by the immediate surface, not necessarily the page's overall theme. */
export function BrandLogo({
  locale,
  mode,
  className = '',
}: {
  readonly locale: Locale;
  readonly mode: ColorMode;
  readonly className?: string;
}) {
  return (
    <Image
      src={BRAND.logos[locale][mode]}
      alt={BRAND.localizedName[locale]}
      loading="eager"
      width={640}
      height={640}
      className={`brand-logo ${className}`}
    />
  );
}
