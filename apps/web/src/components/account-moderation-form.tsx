'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  accountModerationCommandSchema,
  accountModerationResultSchema,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from './reviewed-command-form';
import { CairoDateTime } from './cairo-date-time';
import { formText } from './groups/reviewed-form';
import type { Locale } from '@/lib/brand';
export function AccountModerationForm({
  locale,
  accountId,
  suspendedUntil,
}: {
  readonly locale: Locale;
  readonly accountId: string;
  readonly suspendedUntil: string | null;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    [restore, setRestore] = useState(false);
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة قرار الحساب' : 'Review account decision'}
      endpoint="/api/v1/admin/accounts"
      commandSchema={accountModerationCommandSchema}
      resultSchema={accountModerationResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        commandId: crypto.randomUUID(),
        accountId,
        expectedSuspendedUntil: suspendedUntil,
        until: restore ? null : formText(form, 'until'),
        reason: formText(form, 'reason'),
        evidenceReference: formText(form, 'evidence'),
      })}
    >
      <label>
        {ar ? 'الإجراء' : 'Account action'}
        <select
          value={restore ? 'restore' : 'suspend'}
          onChange={(e) => {
            setRestore(e.target.value === 'restore');
          }}
        >
          <option value="suspend">
            {ar ? 'إيقاف مؤقت' : 'Temporary suspension'}
          </option>
          <option value="restore">
            {ar ? 'استعادة الوصول' : 'Restore access'}
          </option>
        </select>
      </label>
      {!restore && (
        <CairoDateTime
          locale={locale}
          name="until"
          label={ar ? 'موعد انتهاء الإيقاف' : 'Suspension ends'}
        />
      )}
      <label>
        {ar ? 'سبب القرار' : 'Decision reason'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
      <label>
        {ar ? 'مرجع الأدلة' : 'Evidence reference'}
        <input name="evidence" required minLength={5} maxLength={1000} />
      </label>
      <p>
        {ar
          ? 'يتطلب تحققاً حديثاً، ويسري على المنصة كلها. تُلغى الجلسات الحالية؛ الاستعادة لا تعيد الجلسات السابقة. الفرق والنتائج محفوظة.'
          : 'Requires fresh verification and applies across the platform. Existing sessions are revoked; restoring access does not restore old sessions. Squads and results are preserved.'}
      </p>
    </ReviewedCommandForm>
  );
}
