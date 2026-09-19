import { currencyMinorToDecimal } from '@fantasy/domain';
import type { Footballer } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
export function MarketValuation({
  locale,
  valuation,
  stale,
}: {
  readonly locale: Locale;
  readonly valuation: Footballer['valuation'];
  readonly stale: boolean;
}) {
  const ar = locale === 'ar';
  if (!valuation?.licensedForDisplay)
    return (
      <small>
        {ar ? 'القيمة السوقية: غير متاحة' : 'Market value: unavailable'}
      </small>
    );
  return (
    <small className="market-valuation">
      <span>
        {ar ? 'قيمة سوقية' : 'Market value'}:{' '}
        <bdi>
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: valuation.currency,
          }).format(
            Number(
              currencyMinorToDecimal(valuation.amountMinor, valuation.currency),
            ),
          )}
        </bdi>
      </span>
      <span>
        <a href={valuation.sourceUrl} target="_blank" rel="noopener noreferrer">
          {valuation.sourceName} ↗
        </a>{' '}
        ·{' '}
        <time dateTime={valuation.asOf}>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeZone: 'Africa/Cairo',
          }).format(new Date(valuation.asOf))}
        </time>
        {stale && <strong> · {ar ? 'تقييم قديم' : 'Stale valuation'}</strong>}
      </span>
    </small>
  );
}
