declare const fantasyTickBrand: unique symbol;
declare const pointUnitBrand: unique symbol;

/** One tenth of a fantasy unit; never real-world currency. */
export type FantasyTicks = number & { readonly [fantasyTickBrand]: true };
/** One thousandth of a point, permitting exact configurable fractional scoring. */
export type PointUnits = number & { readonly [pointUnitBrand]: true };

export function requireInteger(
  value: number,
  minimum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${label} must be a safe integer >= ${String(minimum)}`,
    );
  }
}

export function fantasyTicks(value: number): FantasyTicks {
  requireInteger(value, 0, 'Fantasy ticks');
  return (value === 0 ? 0 : value) as FantasyTicks;
}

export function pointUnits(value: number): PointUnits {
  requireInteger(value, Number.MIN_SAFE_INTEGER, 'Point units');
  return (value === 0 ? 0 : value) as PointUnits;
}

function decimalUnits(
  value: string,
  precision: number,
  signed: boolean,
): number {
  const pattern = signed ? /^-?\d+(?:\.\d+)?$/u : /^\d+(?:\.\d+)?$/u;
  if (!pattern.test(value))
    throw new RangeError('Expected a plain decimal string');
  const negative = value.startsWith('-');
  const [whole = '', fraction = ''] = (negative ? value.slice(1) : value).split(
    '.',
  );
  if (fraction.length > precision)
    throw new RangeError('Too many decimal places');
  const magnitude =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, '0'));
  const result = Number(negative ? -magnitude : magnitude);
  requireInteger(
    result,
    signed ? Number.MIN_SAFE_INTEGER : 0,
    'Decimal amount',
  );
  return result;
}

export function fantasyPrice(value: string): FantasyTicks {
  return fantasyTicks(decimalUnits(value, 1, false));
}

export function points(value: string): PointUnits {
  return pointUnits(decimalUnits(value, 3, true));
}

export function sumPoints(values: readonly PointUnits[]): PointUnits {
  return values.reduce<PointUnits>(
    (total, value) => pointUnits(total + value),
    pointUnits(0),
  );
}

export function multiplyPoints(value: PointUnits, count: number): PointUnits {
  requireInteger(count, 0, 'Point multiplier');
  return pointUnits(value * count);
}
