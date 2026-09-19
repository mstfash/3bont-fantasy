'use client';
import { useState } from 'react';
import { currencyMinorToDecimal } from '@fantasy/domain';
import type { Footballer } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { CairoDateTime } from '../cairo-date-time';
export function ValuationFields({
  locale,
  valuation,
}: {
  readonly locale: Locale;
  readonly valuation: Footballer['valuation'];
}) {
  const ar = locale === 'ar';
  const [enabled, setEnabled] = useState(valuation !== null);
  return (
    <fieldset className="valuation-fields">
      <legend>{ar ? 'القيمة السوقية الحقيقية' : 'Real-world valuation'}</legend>
      <label className="confirmation-check">
        <input
          type="checkbox"
          name="hasValuation"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
        />
        {ar ? 'لدي قيمة موثقة من مصدر' : 'I have a sourced valuation'}
      </label>
      <p>
        {ar
          ? 'لا تغيّر هذه القيمة سعر اختيار اللاعب في الفانتازي.'
          : 'This value does not change the fantasy selection price.'}
      </p>
      {enabled && (
        <>
          <div className="form-pair">
            <label>
              {ar ? 'المبلغ بالعملة' : 'Amount in currency'}
              <input
                name="amount"
                inputMode="decimal"
                required
                pattern="[0-9]+(\.[0-9]+)?"
                defaultValue={
                  valuation
                    ? currencyMinorToDecimal(
                        valuation.amountMinor,
                        valuation.currency,
                      )
                    : ''
                }
              />
            </label>
            <label>
              {ar ? 'رمز العملة' : 'Currency code'}
              <input
                name="currency"
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                defaultValue={valuation?.currency ?? 'EUR'}
                dir="ltr"
              />
            </label>
          </div>
          <CairoDateTime
            locale={locale}
            name="asOf"
            label={ar ? 'تاريخ التقييم' : 'Valuation as of'}
            initialValue={valuation?.asOf ?? ''}
          />
          <div className="form-pair">
            <label>
              {ar ? 'اسم المصدر' : 'Source name'}
              <input
                name="sourceName"
                required
                maxLength={200}
                defaultValue={valuation?.sourceName ?? ''}
              />
            </label>
            <label>
              {ar ? 'رابط المصدر HTTPS' : 'Source HTTPS URL'}
              <input
                name="sourceUrl"
                type="url"
                required
                pattern="https://.*"
                defaultValue={valuation?.sourceUrl ?? ''}
                dir="ltr"
              />
            </label>
          </div>
          <label className="confirmation-check">
            <input
              name="licensedForDisplay"
              type="checkbox"
              defaultChecked={valuation?.licensedForDisplay ?? false}
            />
            {ar
              ? 'تم التحقق من حق عرض هذه القيمة للجمهور'
              : 'Rights to display this value publicly have been verified'}
          </label>
        </>
      )}
    </fieldset>
  );
}
