'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/brand';
export function BoardRefresh({
  locale,
  checkedAt,
}: {
  readonly locale: Locale;
  readonly checkedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ar = locale === 'ar';
  useEffect(() => {
    const timer = setInterval(() => {
      const tag = document.activeElement?.tagName;
      if (
        document.visibilityState === 'visible' &&
        !['SELECT', 'INPUT', 'TEXTAREA'].includes(tag ?? '')
      )
        startTransition(() => {
          router.refresh();
        });
    }, 60000);
    return () => {
      clearInterval(timer);
    };
  }, [router]);
  return (
    <div className="board-refresh">
      <span className="board-dot" aria-hidden="true" />
      <span>
        {ar ? 'فحص النتائج المنشورة' : 'Published results checked'}{' '}
        <time dateTime={checkedAt}>
          {new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Cairo',
          }).format(new Date(checkedAt))}
        </time>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {pending
          ? ar
            ? 'تحديث…'
            : 'Refreshing…'
          : ar
            ? 'تحديث الآن'
            : 'Refresh now'}
      </button>
    </div>
  );
}
