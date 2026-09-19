'use client';
import { useId, useState } from 'react';
import type { Locale } from '@/lib/brand';
import { cairoWallTime, resolveCairoTime } from '@/lib/cairo-time';

export function CairoDateTime({
  locale,
  label,
  name,
  initialValue = '',
  onChange,
}: {
  readonly locale: Locale;
  readonly label: string;
  readonly name: string;
  readonly initialValue?: string;
  readonly onChange?: (instant: string) => void;
}) {
  const ar = locale === 'ar';
  const id = useId();
  const [wallTime, setWallTime] = useState(
    initialValue ? cairoWallTime(initialValue) : '',
  );
  const [instant, setInstant] = useState(initialValue);
  const [resolution, setResolution] = useState<ReturnType<
    typeof resolveCairoTime
  > | null>(null);
  function accept(value: string): void {
    setInstant(value);
    onChange?.(value);
  }
  return (
    <div className="date-time-field">
      <label htmlFor={id}>
        {label} <span>{ar ? '— توقيت القاهرة' : '— Cairo time'}</span>
      </label>
      <input
        id={id}
        type="datetime-local"
        dir="ltr"
        required
        value={wallTime}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const value = event.target.value;
          setWallTime(value);
          const result = resolveCairoTime(value);
          setResolution(result);
          accept(result.kind === 'valid' ? result.instant : '');
          event.target.setCustomValidity(
            result.kind === 'valid'
              ? ''
              : ar
                ? 'اختر وقتاً صالحاً وحدّد تكراره عند الحاجة.'
                : 'Choose a valid time and resolve any repeated hour.',
          );
        }}
      />
      <input type="hidden" name={name} value={instant} />
      <small id={`${id}-help`}>
        {resolution?.kind === 'invalid'
          ? ar
            ? 'هذا الوقت غير صالح أو يقع في الساعة المحذوفة عند تغيير التوقيت. اختر وقتاً آخر.'
            : 'This time is invalid or falls in a skipped daylight-saving hour. Choose another time.'
          : resolution?.kind === 'ambiguous'
            ? ar
              ? 'هذا الوقت يتكرر مرتين عند تغيير التوقيت. اختر المقصود.'
              : 'This hour occurs twice during a clock change. Choose the intended occurrence.'
            : ar
              ? 'يُحفظ الموعد عالمياً ويُعرض بتوقيت القاهرة.'
              : 'Saved as an exact instant and displayed in Cairo time.'}
      </small>
      {resolution?.kind === 'ambiguous' && (
        <select
          aria-label={ar ? 'اختيار الساعة المتكررة' : 'Repeated-hour choice'}
          value={instant}
          required
          onChange={(event) => {
            accept(event.target.value);
            const input = document.getElementById(id);
            if (input instanceof HTMLInputElement)
              input.setCustomValidity(
                event.target.value
                  ? ''
                  : ar
                    ? 'اختر تكرار الساعة.'
                    : 'Choose an occurrence.',
              );
          }}
        >
          <option value="">{ar ? 'اختر التكرار' : 'Choose occurrence'}</option>
          <option value={resolution.earlier}>
            {ar ? 'المرة الأولى' : 'First occurrence'}
          </option>
          <option value={resolution.later}>
            {ar ? 'المرة الثانية' : 'Second occurrence'}
          </option>
        </select>
      )}
    </div>
  );
}
