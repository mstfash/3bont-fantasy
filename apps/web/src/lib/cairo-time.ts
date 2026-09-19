import { Temporal } from '@js-temporal/polyfill';

export function cairoWallTime(instant: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO('Africa/Cairo')
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}
export function resolveCairoTime(
  wallTime: string,
):
  | { kind: 'valid'; instant: string }
  | { kind: 'ambiguous'; earlier: string; later: string }
  | { kind: 'invalid' } {
  try {
    const plain = Temporal.PlainDateTime.from(wallTime);
    const earlier = plain.toZonedDateTime('Africa/Cairo', {
      disambiguation: 'earlier',
    });
    const later = plain.toZonedDateTime('Africa/Cairo', {
      disambiguation: 'later',
    });
    if (
      !earlier.toPlainDateTime().equals(plain) ||
      !later.toPlainDateTime().equals(plain)
    )
      return { kind: 'invalid' };
    if (earlier.epochNanoseconds !== later.epochNanoseconds)
      return {
        kind: 'ambiguous',
        earlier: earlier.toInstant().toString(),
        later: later.toInstant().toString(),
      };
    return { kind: 'valid', instant: earlier.toInstant().toString() };
  } catch {
    return { kind: 'invalid' };
  }
}
