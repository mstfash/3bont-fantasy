/** ISO currency precision supplied by the runtime's locale data; no currency conversion is performed. */
export function currencyMinorDigits(currency: string): number {
  if (!/^[A-Z]{3}$/u.test(currency)) throw new RangeError('Invalid currency');
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined)
    throw new RangeError('Currency precision unavailable');
  return digits;
}
export function currencyAmountToMinor(
  amount: string,
  currency: string,
): number {
  const digits = currencyMinorDigits(currency);
  if (!/^\d+(?:\.\d+)?$/u.test(amount))
    throw new RangeError('Use a nonnegative decimal amount');
  const [whole = '', fraction = ''] = amount.split('.');
  if (fraction.length > digits)
    throw new RangeError('Too many decimal places for this currency');
  const result =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, '0') || '0');
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Currency amount overflow');
  return Number(result);
}
export function currencyMinorToDecimal(
  amount: number,
  currency: string,
): string {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError('Invalid minor units');
  const digits = currencyMinorDigits(currency);
  const factor = 10n ** BigInt(digits);
  const minor = BigInt(amount);
  return digits === 0
    ? String(amount)
    : `${String(minor / factor)}.${String(minor % factor).padStart(digits, '0')}`;
}
