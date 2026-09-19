'use client';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/brand';
import {
  ReviewedGroupForm,
  formText,
  type OwnedGroupEntry,
} from './reviewed-form';
export function GroupJoin({
  locale,
  competitionId,
  groupId,
  privateGroup = false,
  entries,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly groupId?: string;
  readonly privateGroup?: boolean;
  readonly entries: readonly OwnedGroupEntry[];
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  return (
    <ReviewedGroupForm
      locale={locale}
      label={ar ? 'مراجعة الانضمام' : 'REVIEW JOIN REQUEST'}
      makeCommand={(form) => {
        const [codeGroup, token] = formText(form, 'code').trim().split('.');
        return {
          kind: 'join',
          commandId: crypto.randomUUID(),
          competitionId,
          groupId: groupId ?? codeGroup,
          entryId: formText(form, 'entry'),
          invitationToken: token ?? null,
        };
      }}
      onSaved={(result) => {
        if (result.membership === 'active')
          router.push(`/${locale}/groups/${result.groupId}`);
        router.refresh();
      }}
    >
      {(!groupId || privateGroup) && (
        <label>
          {ar ? 'رمز الدعوة' : 'Invitation code'}
          <input
            name="code"
            required
            dir="ltr"
            autoComplete="off"
            maxLength={101}
          />
        </label>
      )}
      <label>
        {ar ? 'الفريق الذي ينضم' : 'Squad to join'}
        <select
          name="entry"
          required
          aria-label={ar ? 'الفريق الذي ينضم' : 'Squad to join'}
        >
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        {ar
          ? 'ستنضم بنفس فريقك الحالي. لن يتم إنشاء فريق جديد أو تغيير تشكيلتك.'
          : 'Join with your existing squad. This does not create another squad or change your lineup.'}
      </p>
    </ReviewedGroupForm>
  );
}
