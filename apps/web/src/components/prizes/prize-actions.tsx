'use client';
import { useRouter } from 'next/navigation';
import {
  prizeCommandSchema,
  prizeCommandResultSchema,
  type PrizePool,
  type PrizeProposal,
  type PrizePreview,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
import '@/styles/groups.css';
export function PrizeAction({
  locale,
  pool,
  proposal,
  preview,
  action,
}: {
  readonly locale: Locale;
  readonly pool: PrizePool;
  readonly proposal: PrizeProposal | null;
  readonly preview: PrizePreview | null;
  readonly action:
    'publish' | 'prepare' | 'review' | 'approve' | 'fulfill' | 'void';
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const labels = {
    publish: ar ? 'نشر الشروط الملزمة' : 'Publish binding terms',
    prepare: ar ? 'إعداد مقترح الجوائز' : 'Prepare award proposal',
    review: ar ? 'تأكيد مراجعة الأهلية' : 'Confirm eligibility review',
    approve: ar ? 'اعتماد الجوائز' : 'Approve awards',
    fulfill: ar ? 'تسجيل التسليم الخارجي' : 'Record external fulfillment',
    void: ar ? 'إلغاء المقترح' : 'Void proposal',
  };
  return (
    <ReviewedCommandForm
      locale={locale}
      label={labels[action]}
      endpoint="/api/v1/admin/prizes"
      commandSchema={prizeCommandSchema}
      resultSchema={prizeCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: action,
        commandId: crypto.randomUUID(),
        competitionId: pool.competitionId,
        reason: formText(form, 'reason'),
        ...(['publish', 'prepare'].includes(action)
          ? { poolId: pool.id, expectedRevision: pool.revision }
          : { proposalId: proposal?.id, expectedRevision: proposal?.revision }),
        ...(action === 'publish'
          ? { evidenceReference: formText(form, 'reference') }
          : {}),
        ...(action === 'prepare'
          ? { expectedFingerprint: preview?.fingerprint }
          : {}),
        ...(action === 'fulfill'
          ? { reference: formText(form, 'reference') }
          : {}),
      })}
    >
      {action === 'publish' && (
        <>
          <p>
            {ar
              ? 'الشروط المنشورة لا تُعدّل. تأكد من مراجعة أهلية المشاركين والجوائز والتعادل والنطاق القانوني قبل عرض جوائز حقيقية.'
              : 'Published terms cannot be edited. Confirm participant eligibility, prizes, ties and the applicable program requirements before offering real awards.'}
          </p>
          <label>
            {ar
              ? 'مرجع مراجعة الشروط والأهلية'
              : 'Terms and eligibility review reference'}
            <input name="reference" minLength={5} maxLength={1000} required />
          </label>
        </>
      )}
      {action === 'fulfill' && (
        <>
          <p>
            {ar
              ? 'سجّل هذا فقط بعد إتمام تسليم جميع الجوائز المدرجة. لا ينفّذ التطبيق أي تحويل مالي.'
              : 'Record this only after every listed award has been delivered. The app does not transfer money.'}
          </p>
          <label>
            {ar
              ? 'مرجع إثبات التسليم (بدون بيانات مصرفية)'
              : 'Fulfillment evidence reference (no bank details)'}
            <input name="reference" minLength={5} maxLength={1000} required />
          </label>
        </>
      )}
      <label>
        {ar ? 'السبب والأدلة' : 'Reason and evidence'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
      <label className="confirmation-check">
        <input type="checkbox" required />
        {ar
          ? 'راجعت الشروط والمستفيدين والنتائج المعروضة.'
          : 'I reviewed the terms, recipients and displayed results.'}
      </label>
    </ReviewedCommandForm>
  );
}
export function PrizeEligibility({
  locale,
  pool,
  accountId,
  excluded,
}: {
  readonly locale: Locale;
  readonly pool: PrizePool;
  readonly accountId: string;
  readonly excluded: boolean;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <details>
      <summary>
        {ar ? 'مراجعة أهلية الحساب' : 'Review account eligibility'}
      </summary>
      <ReviewedCommandForm
        locale={locale}
        label={
          excluded
            ? ar
              ? 'إزالة الاستبعاد'
              : 'Remove exclusion'
            : ar
              ? 'استبعاد الحساب من الجائزة'
              : 'Exclude account from pool'
        }
        endpoint="/api/v1/admin/prizes"
        commandSchema={prizeCommandSchema}
        resultSchema={prizeCommandResultSchema}
        onSaved={() => {
          router.refresh();
        }}
        makeCommand={(form) => ({
          kind: 'eligibility',
          commandId: crypto.randomUUID(),
          competitionId: pool.competitionId,
          poolId: pool.id,
          expectedRevision: pool.revision,
          accountId,
          excluded: !excluded,
          reason: formText(form, 'reason'),
          evidenceReference: formText(form, 'evidence'),
        })}
      >
        <label>
          {ar ? 'سبب قرار الأهلية' : 'Eligibility decision reason'}
          <textarea name="reason" minLength={5} maxLength={1000} required />
        </label>
        <label>
          {ar ? 'مرجع الدليل' : 'Evidence reference'}
          <input name="evidence" minLength={5} maxLength={1000} required />
        </label>
      </ReviewedCommandForm>
    </details>
  );
}
