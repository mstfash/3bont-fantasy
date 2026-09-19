'use client';
import { useEffect, useRef } from 'react';
import type { Locale } from '@/lib/brand';
import '@/styles/sponsors.css';
export function SponsorBanner({
  locale,
  assetId,
  name,
  description,
  destination,
  token,
  compact = false,
}: {
  readonly locale: Locale;
  readonly assetId: string;
  readonly name: string;
  readonly description: string;
  readonly destination: string;
  readonly token: string;
  readonly compact?: boolean;
}) {
  const node = useRef<HTMLElement | null>(null),
    sent = useRef(false);
  function metric(kind: 'impression' | 'click') {
    navigator.sendBeacon(
      '/api/v1/sponsors/metrics',
      new Blob([JSON.stringify({ token, kind })], { type: 'application/json' }),
    );
  }
  useEffect(() => {
    const target = node.current;
    if (!target) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      visible = false;
    function consider() {
      if (timer) clearTimeout(timer);
      if (visible && !document.hidden && !sent.current)
        timer = setTimeout(() => {
          if (!document.hidden) {
            sent.current = true;
            navigator.sendBeacon(
              '/api/v1/sponsors/metrics',
              new Blob([JSON.stringify({ token, kind: 'impression' })], {
                type: 'application/json',
              }),
            );
          }
        }, 1000);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.intersectionRatio >= 0.5);
        consider();
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    document.addEventListener('visibilitychange', consider);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', consider);
    };
  }, [token]);
  return (
    <aside
      ref={node}
      className={compact ? 'sponsor-banner sponsor-compact' : 'sponsor-banner'}
      aria-label={locale === 'ar' ? 'رعاية' : 'Sponsorship'}
    >
      <span className="sponsor-disclosure">
        {locale === 'ar' ? 'برعاية' : 'SPONSORED'}
      </span>
      {/* The upload service owns image validation and resizing; previews retain their protected route. */}
      <img
        src={`/api/v1/sponsors/assets/${assetId}`}
        alt={name}
        width={320}
        height={120}
      />
      <div>
        <strong>{name}</strong>
        {!compact && <p>{description}</p>}
      </div>
      <a
        href={destination}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => {
          metric('click');
        }}
      >
        {locale === 'ar' ? 'زيارة الراعي ↗' : 'Visit sponsor ↗'}
      </a>
    </aside>
  );
}
