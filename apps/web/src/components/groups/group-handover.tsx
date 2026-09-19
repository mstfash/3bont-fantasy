'use client';
import { useRouter } from 'next/navigation';
import {
  groupHandoverCommandSchema,
  groupHandoverResultSchema,
  type GroupHandover,
  type LeagueGroup,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from './reviewed-form';
export function GroupHandoverControls({
  locale,
  group,
  offer,
  organizer,
  candidates,
}: {
  readonly locale: Locale;
  readonly group: LeagueGroup;
  readonly offer: GroupHandover | null;
  readonly organizer: boolean;
  readonly candidates: readonly { entryId: string; name: string }[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  if (!organizer && !offer) return null;
  const common = {
    competitionId: group.competitionId,
    groupId: group.id,
    expectedRevision: group.revision,
  };
  return (
    <section className="group-card">
      <h2>{ar ? 'تسليم إدارة المجموعة' : 'GROUP OWNERSHIP'}</h2>
      <p>
        {ar
          ? 'نقل الإدارة يحتاج موافقة العضو المختار. تبقى الفرق والنقاط والجداول والجوائز كما هي. تنتهي رموز الدعوة القديمة عند القبول.'
          : 'The selected member must accept ownership. Squads, points, schedules and prizes are preserved. Existing invitation codes expire on acceptance.'}
      </p>
      {offer && (
        <>
          <p>
            {ar ? 'العرض متاح حتى' : 'Offer available until'}:{' '}
            {deadlineLabel(offer.expiresAt, locale)}
          </p>
          <ReviewedCommandForm
            locale={locale}
            label={ar ? 'مراجعة عرض الإدارة' : 'REVIEW OWNERSHIP OFFER'}
            endpoint="/api/v1/groups/handover"
            commandSchema={groupHandoverCommandSchema}
            resultSchema={groupHandoverResultSchema}
            makeCommand={(form) => ({
              ...common,
              commandId: crypto.randomUUID(),
              offerId: offer.id,
              kind: organizer ? 'cancel' : formText(form, 'decision'),
            })}
            onSaved={() => {
              router.refresh();
            }}
          >
            {organizer ? (
              <p>
                {ar
                  ? 'إلغاء العرض الحالي؛ ستبقى منظّم المجموعة.'
                  : 'Cancel this offer; you remain the organizer.'}
              </p>
            ) : (
              <label>
                {ar ? 'القرار' : 'Decision'}
                <select name="decision" defaultValue="accept">
                  <option value="accept">
                    {ar ? 'قبول إدارة المجموعة' : 'Accept ownership'}
                  </option>
                  <option value="decline">
                    {ar ? 'رفض العرض' : 'Decline offer'}
                  </option>
                </select>
              </label>
            )}
          </ReviewedCommandForm>
        </>
      )}
      {organizer && candidates.length > 0 && (
        <ReviewedCommandForm
          locale={locale}
          label={
            ar ? 'مراجعة دعوة المنظّم الجديد' : 'REVIEW NEW ORGANIZER OFFER'
          }
          endpoint="/api/v1/groups/handover"
          commandSchema={groupHandoverCommandSchema}
          resultSchema={groupHandoverResultSchema}
          makeCommand={(form) => ({
            ...common,
            commandId: crypto.randomUUID(),
            kind: 'offer',
            recipientEntryId: formText(form, 'recipientEntryId'),
          })}
          onSaved={() => {
            router.refresh();
          }}
        >
          <label>
            {ar ? 'العضو حسب اسم فريقه' : 'Member by squad name'}
            <select name="recipientEntryId" required>
              {candidates.map((c) => (
                <option key={c.entryId} value={c.entryId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {ar
              ? 'العرض صالح ٧ أيام ويستبدل أي عرض سابق. حتى القبول، تظل مسؤولاً عن المجموعة.'
              : 'This seven-day offer replaces any previous offer. You remain responsible until acceptance.'}
          </p>
        </ReviewedCommandForm>
      )}
      {organizer && candidates.length === 0 && (
        <p>
          {ar
            ? 'يلزم عضو آخر لديه فريق نشط لتسليم الإدارة.'
            : 'Another member with an active squad is required for handover.'}
        </p>
      )}
    </section>
  );
}
