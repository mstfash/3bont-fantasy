'use client';
import '@/styles/groups.css';
import { useRouter } from 'next/navigation';
import { fantasyPrice, points } from '@fantasy/domain';
import {
  priceCalibrationCommandSchema,
  priceCalibrationResultSchema,
  type CompetitionRules,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from './reviewed-command-form';
import { formText } from './groups/reviewed-form';
import type { Locale } from '@/lib/brand';
export function PriceCalibrationForm({
  locale,
  competitionId,
  rules,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly rules: CompetitionRules['pricing'];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <ReviewedCommandForm
      locale={locale}
      endpoint="/api/v1/admin/prices/calibration"
      commandSchema={priceCalibrationCommandSchema}
      resultSchema={priceCalibrationResultSchema}
      label={ar ? 'مراجعة تجربة الأسعار' : 'REVIEW PRICE EXPERIMENT'}
      makeCommand={(form) => ({
        commandId: crypto.randomUUID(),
        competitionId,
        reason: formText(form, 'reason'),
        candidates: [
          { label: ar ? 'الإعداد الحالي' : 'Current settings', rules },
          {
            label: ar ? 'الإعداد المقترح' : 'Proposed settings',
            rules: {
              ...rules,
              automaticUpdates: false,
              step: fantasyPrice(formText(form, 'step')),
              observedGameweeks: Number(formText(form, 'observedGameweeks')),
              minimumMinutes: Number(formText(form, 'minimumMinutes')),
              riseAt: points(formText(form, 'riseAt')),
              fallAt: points(formText(form, 'fallAt')),
              freezeHours: Number(formText(form, 'freezeHours')),
            },
          },
        ],
      })}
      onSaved={(result) => {
        router.push(
          `/${locale}/admin/competitions/${competitionId}/prices/calibration?report=${result.reportId}`,
        );
      }}
    >
      <p>
        {ar
          ? 'قارن الإعداد الحالي باقتراحك. تبقى حدود الأسعار الحالية كما هي.'
          : 'Compare current settings with your proposal. Both use the current minimum and maximum price bounds.'}
      </p>
      <div className="form-pair">
        <label>
          {ar ? 'خطوة تغير السعر' : 'Price step'}
          <input
            name="step"
            type="number"
            min="0.1"
            max="100000"
            step="0.1"
            defaultValue={(rules.step / 10).toFixed(1)}
            required
          />
        </label>
        <label>
          {ar ? 'عدد الجولات المرصودة' : 'Observed gameweeks'}
          <input
            name="observedGameweeks"
            type="number"
            min="1"
            max="20"
            defaultValue={Math.min(20, rules.observedGameweeks + 1)}
            required
          />
        </label>
        <label>
          {ar ? 'الحد الأدنى للدقائق' : 'Minimum minutes'}
          <input
            name="minimumMinutes"
            type="number"
            min="0"
            max="10000"
            defaultValue={rules.minimumMinutes}
            required
          />
        </label>
        <label>
          {ar ? 'متوسط النقاط للارتفاع' : 'Average points to rise'}
          <input
            name="riseAt"
            type="number"
            step="0.001"
            min="-1000000"
            max="1000000"
            defaultValue={rules.riseAt / 1000}
            required
          />
        </label>
        <label>
          {ar ? 'متوسط النقاط للانخفاض' : 'Average points to fall'}
          <input
            name="fallAt"
            type="number"
            step="0.001"
            min="-1000000"
            max="1000000"
            defaultValue={rules.fallAt / 1000}
            required
          />
        </label>
        <label>
          {ar
            ? 'تجميد الأسعار قبل الموعد (ساعات)'
            : 'Hours frozen before deadline'}
          <input
            name="freezeHours"
            type="number"
            min="0"
            max="168"
            defaultValue={rules.freezeHours}
            required
          />
        </label>
      </div>
      <label>
        {ar ? 'سبب التجربة' : 'Reason for this experiment'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
    </ReviewedCommandForm>
  );
}
