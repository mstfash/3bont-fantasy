'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Gameweek } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import {
  ReviewedGroupForm,
  formText,
  newInvitationToken,
  type OwnedGroupEntry,
} from './reviewed-form';
export function GroupCreate({
  locale,
  competitionId,
  entryLimit,
  entries,
  gameweeks,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly entryLimit: number;
  readonly entries: readonly OwnedGroupEntry[];
  readonly gameweeks: readonly Gameweek[];
}) {
  const ar = locale === 'ar';
  const [saved, setSaved] = useState<{ id: string; code: string } | null>(null);
  if (saved)
    return (
      <div className="group-form">
        <h2>{ar ? 'مجموعتك جاهزة.' : 'YOUR GROUP IS READY.'}</h2>
        <label>
          {ar
            ? 'رمز الدعوة — احتفظ به وشاركه مع أصدقائك'
            : 'Invitation code — save and share with friends'}
          <input
            readOnly
            value={saved.code}
            dir="ltr"
            onFocus={(e) => {
              e.target.select();
            }}
          />
        </label>
        <p>
          {ar
            ? 'يمكنك إنشاء رمز جديد من صفحة المجموعة لإلغاء هذا الرمز.'
            : 'You can replace this code from the group page to revoke it.'}
        </p>
        <Link className="action-button" href={`/${locale}/groups/${saved.id}`}>
          {ar ? 'افتح المجموعة' : 'OPEN GROUP'}
        </Link>
      </div>
    );
  return (
    <ReviewedGroupForm
      locale={locale}
      label={ar ? 'مراجعة المجموعة الجديدة' : 'REVIEW NEW GROUP'}
      makeCommand={(form) => ({
        kind: 'create',
        commandId: crypto.randomUUID(),
        competitionId,
        name: formText(form, 'name'),
        description: formText(form, 'description'),
        visibility: formText(form, 'visibility'),
        approvalRequired: form.has('approval'),
        entryLimit: Number(formText(form, 'entryLimit')),
        startGameweekId: formText(form, 'start') || null,
        entryId: formText(form, 'entry'),
        invitationToken: newInvitationToken(),
      })}
      onSaved={(result, command) => {
        if (command.kind === 'create')
          setSaved({
            id: result.groupId,
            code: `${result.groupId}.${command.invitationToken}`,
          });
      }}
    >
      <label>
        {ar ? 'اسم المجموعة' : 'Group name'}
        <input name="name" minLength={2} maxLength={80} required />
      </label>
      <label>
        {ar ? 'وصف المجموعة' : 'Group description'}
        <textarea name="description" maxLength={1000} />
      </label>
      <div className="form-pair">
        <label>
          {ar ? 'الظهور' : 'Visibility'}
          <select name="visibility" defaultValue="private">
            <option value="private">
              {ar ? 'خاصة — بالدعوة فقط' : 'Private — invitation only'}
            </option>
            <option value="public">
              {ar ? 'عامة — قابلة للاكتشاف' : 'Public — discoverable'}
            </option>
          </select>
        </label>
        <label>
          {ar ? 'الفرق لكل حساب' : 'Entries per account'}
          <input
            name="entryLimit"
            type="number"
            min={1}
            max={entryLimit}
            defaultValue={1}
            required
          />
        </label>
      </div>
      <label className="confirmation-check">
        <input name="approval" type="checkbox" />
        {ar
          ? 'موافقة المنظّم مطلوبة للانضمام'
          : 'Organizer approval required to join'}
      </label>
      <label>
        {ar ? 'فريقك في المجموعة' : 'Your squad in this group'}
        <select
          name="entry"
          required
          aria-label={ar ? 'فريقك في المجموعة' : 'Your squad in this group'}
        >
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ar ? 'النقاط المحتسبة' : 'Counted points'}
        <select name="start" defaultValue="">
          <option value="">
            {ar
              ? 'من بداية البطولة — تشمل نقاط ما قبل الانضمام'
              : 'Competition to date — includes points before joining'}
          </option>
          {gameweeks.map((g) => (
            <option key={g.id} value={g.id}>
              {ar ? 'من' : 'From'} {g.name[locale]}
            </option>
          ))}
        </select>
      </label>
      <p>
        {ar
          ? 'تثبت بداية احتساب النقاط وحد الفرق عند إنشاء المجموعة. الفرق وقواعد تسجيل النقاط مشتركة مع البطولة.'
          : 'The scoring start and entry limit are fixed when the group opens. Squads and player scoring come from the competition.'}
      </p>
    </ReviewedGroupForm>
  );
}
