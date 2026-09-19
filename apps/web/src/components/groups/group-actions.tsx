'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeagueGroup } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import {
  ReviewedGroupForm,
  formText,
  newInvitationToken,
} from './reviewed-form';
export function GroupInvitation({
  locale,
  group,
}: {
  readonly locale: Locale;
  readonly group: LeagueGroup;
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <ReviewedGroupForm
      locale={locale}
      label={ar ? 'استبدال رمز الدعوة' : 'REPLACE INVITATION CODE'}
      makeCommand={() => ({
        kind: 'rotate-invitation',
        commandId: crypto.randomUUID(),
        competitionId: group.competitionId,
        groupId: group.id,
        expectedRevision: group.revision,
        invitationToken: newInvitationToken(),
      })}
      onSaved={(result, command) => {
        if (command.kind === 'rotate-invitation')
          setCode(`${result.groupId}.${command.invitationToken}`);
        router.refresh();
      }}
    >
      <p>
        {ar
          ? 'الرمز الجديد يلغي كل الدعوات السابقة فوراً. الأعضاء الحاليون يظلون في المجموعة.'
          : 'A new code immediately revokes old invitations. Existing members remain.'}
      </p>
      {code && (
        <label>
          {ar ? 'رمز الدعوة الجديد' : 'New invitation code'}
          <input
            value={code}
            readOnly
            dir="ltr"
            onFocus={(e) => {
              e.target.select();
            }}
          />
        </label>
      )}
    </ReviewedGroupForm>
  );
}
export function GroupMembershipAction({
  locale,
  competitionId,
  groupId,
  entryId,
  status,
  organizer,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly groupId: string;
  readonly entryId: string;
  readonly status: 'pending' | 'active' | 'left' | 'removed';
  readonly organizer: boolean;
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  return (
    <ReviewedGroupForm
      locale={locale}
      label={ar ? 'مراجعة إجراء العضوية' : 'REVIEW MEMBERSHIP ACTION'}
      makeCommand={(form) =>
        organizer
          ? {
              kind: 'review-member',
              commandId: crypto.randomUUID(),
              competitionId,
              groupId,
              entryId,
              expectedStatus: status,
              decision: formText(form, 'decision'),
              reason: formText(form, 'reason'),
            }
          : {
              kind: 'leave',
              commandId: crypto.randomUUID(),
              competitionId,
              groupId,
              entryId,
            }
      }
      onSaved={() => {
        router.refresh();
      }}
    >
      {organizer ? (
        <>
          <label>
            {ar ? 'الإجراء' : 'Action'}
            <select
              name="decision"
              defaultValue={status === 'pending' ? 'approve' : 'remove'}
            >
              {status === 'pending' && (
                <option value="approve">{ar ? 'الموافقة' : 'Approve'}</option>
              )}
              <option value="remove">
                {ar ? 'إزالة العضوية' : 'Remove membership'}
              </option>
            </select>
          </label>
          <label>
            {ar ? 'سبب الإجراء' : 'Reason'}
            <input name="reason" required minLength={5} maxLength={1000} />
          </label>
        </>
      ) : (
        <p>
          {ar
            ? 'مغادرة المجموعة لا تحذف فريقك أو نقاطه في البطولة.'
            : 'Leaving the group keeps your squad and competition points.'}
        </p>
      )}
    </ReviewedGroupForm>
  );
}
