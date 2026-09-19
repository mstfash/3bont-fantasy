import type { Locale } from '@/lib/brand';
export function StandingsMovement({
  rank,
  previousRank,
  locale,
}: {
  readonly rank: number;
  readonly previousRank: number | null;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  const delta = previousRank === null ? null : previousRank - rank;
  const label =
    delta === null
      ? ar
        ? 'جديد'
        : 'New'
      : delta === 0
        ? ar
          ? 'ثابت'
          : 'Unchanged'
        : delta > 0
          ? ar
            ? `صعد ${String(delta)}`
            : `Up ${String(delta)}`
          : ar
            ? `هبط ${String(-delta)}`
            : `Down ${String(-delta)}`;
  return (
    <span
      className={`rank-movement ${delta !== null && delta > 0 ? 'movement-up' : delta !== null && delta < 0 ? 'movement-down' : ''}`}
      aria-label={label}
    >
      <span aria-hidden="true">
        {delta === null ? '✦' : delta === 0 ? '—' : delta > 0 ? '↑' : '↓'}
      </span>{' '}
      {delta === null
        ? ar
          ? 'جديد'
          : 'NEW'
        : delta === 0
          ? ''
          : Math.abs(delta)}
    </span>
  );
}
