'use client';
import { useRouter } from 'next/navigation';
import {
  prizeCorrectionCommandSchema,
  prizeCorrectionResultSchema,
  type PrizeCorrectionCase,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
export function PrizeCorrectionAction({
  locale,
  review,
}: {
  readonly locale: Locale;
  readonly review: PrizeCorrectionCase;
}) {
  const router = useRouter(),
    ar = locale === 'ar';
  return (
    <ReviewedCommandForm
      locale={locale}
      endpoint="/api/v1/admin/prize-corrections"
      commandSchema={prizeCorrectionCommandSchema}
      resultSchema={prizeCorrectionResultSchema}
      label={ar ? 'مراجعة قرار التصحيح' : 'Review correction decision'}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        commandId: crypto.randomUUID(),
        competitionId: review.competitionId,
        caseId: review.id,
        expectedRevision: review.revision,
        expectedFingerprint: review.observation.fingerprint,
        decision: formText(form, 'decision'),
        reason: formText(form, 'reason'),
        reference: formText(form, 'reference'),
      })}
    >
      <p>
        {ar
          ? 'يبقى سجل التسليم الأصلي محفوظاً. القرار لا ينفذ تحويلاً مالياً أو يسترد جائزة. سجّل التسوية الخارجية فقط بعد إتمامها وتوثيقها.'
          : 'The original delivery record remains intact. This decision does not transfer funds or recover an award. Record an external remedy only after it is completed and documented.'}
      </p>
      <label>
        {ar ? 'قرار المراجعة' : 'Review decision'}
        <select name="decision" defaultValue="original-delivery-stands">
          <option value="original-delivery-stands">
            {ar ? 'الإبقاء على التسليم الأصلي' : 'Original delivery stands'}
          </option>
          <option value="external-remedy-recorded">
            {ar
              ? 'تسجيل تسوية خارجية مكتملة'
              : 'Record completed external remedy'}
          </option>
        </select>
      </label>
      <label>
        {ar ? 'سبب القرار' : 'Decision reason'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
      <label>
        {ar
          ? 'مرجع المراجعة أو إثبات التسوية'
          : 'Review or remedy evidence reference'}
        <input name="reference" minLength={5} maxLength={1000} required />
      </label>
      <label className="confirmation-check">
        <input type="checkbox" required />
        {ar
          ? 'راجعت التسليم الأصلي والأهلية والجوائز الحالية والأدلة.'
          : 'I reviewed the original delivery, current eligibility, awards and evidence.'}
      </label>
    </ReviewedCommandForm>
  );
}
